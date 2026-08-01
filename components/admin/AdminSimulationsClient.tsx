"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export default function AdminSimulationsClient() {
  const [maxSim, setMaxSim] = useState(10000);
  const [savedMaxSim, setSavedMaxSim] = useState(10000);
  const [dailyLimit, setDailyLimit] = useState(20);
  const [savedDailyLimit, setSavedDailyLimit] = useState(20);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/admin/settings", { credentials: "include" });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }
        const data = await res.json();
        const val = data?.settings?.max_simulations ?? 10000;
        const limit = data?.settings?.scenario_daily_run_limit ?? 20;
        setMaxSim(val);
        setSavedMaxSim(val);
        setDailyLimit(limit);
        setSavedDailyLimit(limit);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load settings");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ max_simulations: maxSim, scenario_daily_run_limit: dailyLimit }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to save");
      }
      const data = await res.json();
      const val = data?.settings?.max_simulations ?? maxSim;
      const limit = data?.settings?.scenario_daily_run_limit ?? dailyLimit;
      setMaxSim(val);
      setSavedMaxSim(val);
      setDailyLimit(limit);
      setSavedDailyLimit(limit);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-muted-foreground">Loading settings…</p>;
  }

  const hasChanges = maxSim !== savedMaxSim || dailyLimit !== savedDailyLimit;

  return (
    <div className="max-w-lg space-y-6">
      <div className="rounded-xl border border-border bg-muted/20 p-6 space-y-5">
        <div>
          <h3
            className="text-sm font-bold uppercase tracking-wide mb-1"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Simulation Budget
          </h3>
          <p className="text-xs text-muted-foreground mb-4" style={{ fontFamily: "var(--font-body)" }}>
            Maximum number of standings-function calls per scenario analysis. This budget is shared
            across all solver layers (possibility check + Monte Carlo). Higher values give more
            accurate probabilities but take longer to run.
          </p>

          <label className="block">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Max Simulations
            </span>
            <input
              type="number"
              min={100}
              max={1000000}
              step={100}
              value={maxSim}
              onChange={(e) => setMaxSim(parseInt(e.target.value, 10) || 100)}
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </label>
        </div>

        <div className="border-t border-border pt-5">
          <h3
            className="text-sm font-bold uppercase tracking-wide mb-1"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Daily Run Limit
          </h3>
          <p className="text-xs text-muted-foreground mb-4" style={{ fontFamily: "var(--font-body)" }}>
            Maximum scenario runs a single (non-admin) user may start per rolling 24 hours. Keeps
            the feature open to everyone while capping cost. Admins are never limited.
          </p>

          <label className="block">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Runs per user / day
            </span>
            <input
              type="number"
              min={1}
              max={10000}
              step={1}
              value={dailyLimit}
              onChange={(e) => setDailyLimit(parseInt(e.target.value, 10) || 1)}
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </label>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <Button
            variant="default"
            size="sm"
            disabled={saving || !hasChanges}
            onClick={handleSave}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
          {success && (
            <span className="text-xs text-green-500" style={{ fontFamily: "var(--font-body)" }}>
              Saved successfully
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive rounded-md">
          {error}
        </div>
      )}
    </div>
  );
}
