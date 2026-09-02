"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type SettingKey =
  | "max_simulations"
  | "scenario_daily_run_limit"
  | "timeline_daily_run_limit"
  | "scenario_timeline_max_points"
  | "scenario_timeline_simulations";

type Field = {
  key: SettingKey;
  label: string;
  min: number;
  max: number;
  step: number;
  fallback: number;
};

type Section = {
  title: string;
  blurb: string;
  fields: Field[];
};

// Bounds mirror the validation in pages/api/admin/settings.ts.
const SECTIONS: Section[] = [
  {
    title: "Simulation Budget",
    blurb:
      "Maximum number of standings-function calls per scenario analysis. This budget is shared across all solver layers (possibility check + Monte Carlo). Higher values give more accurate probabilities but take longer to run.",
    fields: [
      { key: "max_simulations", label: "Max Simulations", min: 100, max: 1000000, step: 100, fallback: 10000 },
    ],
  },
  {
    title: "Daily Run Limit",
    blurb:
      "Maximum scenario runs a single (non-admin) user may start per rolling 24 hours. Keeps the feature open to everyone while capping cost. Admins are never limited.",
    fields: [
      { key: "scenario_daily_run_limit", label: "Runs per user / day", min: 1, max: 10000, step: 1, fallback: 20 },
    ],
  },
  {
    title: "Scenario Timelines",
    blurb:
      "A timeline replays one scenario at each date a game was played, so it costs one analysis per plotted point. It draws on its own daily allowance rather than the scenario limit above.",
    fields: [
      { key: "timeline_daily_run_limit", label: "Timelines per user / day", min: 1, max: 1000, step: 1, fallback: 3 },
      { key: "scenario_timeline_max_points", label: "Max plotted dates", min: 2, max: 60, step: 1, fallback: 12 },
      { key: "scenario_timeline_simulations", label: "Simulations per point", min: 100, max: 100000, step: 100, fallback: 2000 },
    ],
  },
];

const ALL_FIELDS = SECTIONS.flatMap((s) => s.fields);

function fromResponse(settings: Record<string, unknown> | undefined): Record<SettingKey, number> {
  return Object.fromEntries(
    ALL_FIELDS.map((f) => [f.key, Number(settings?.[f.key] ?? f.fallback)])
  ) as Record<SettingKey, number>;
}

export default function AdminSimulationsClient() {
  const [values, setValues] = useState<Record<SettingKey, number>>(() => fromResponse(undefined));
  const [saved, setSaved] = useState<Record<SettingKey, number>>(() => fromResponse(undefined));
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
        const next = fromResponse(data?.settings);
        setValues(next);
        setSaved(next);
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
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to save");
      }
      const data = await res.json();
      const next = fromResponse(data?.settings);
      setValues(next);
      setSaved(next);
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

  const hasChanges = ALL_FIELDS.some((f) => values[f.key] !== saved[f.key]);

  return (
    <div className="max-w-lg space-y-6">
      <div className="rounded-xl border border-border bg-muted/20 p-6 space-y-5">
        {SECTIONS.map((section, si) => (
          <div key={section.title} className={si > 0 ? "border-t border-border pt-5" : undefined}>
            <h3
              className="text-sm font-bold uppercase tracking-wide mb-1"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {section.title}
            </h3>
            <p className="text-xs text-muted-foreground mb-4" style={{ fontFamily: "var(--font-body)" }}>
              {section.blurb}
            </p>

            <div className="space-y-3">
              {section.fields.map((f) => (
                <label key={f.key} className="block">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {f.label}
                  </span>
                  <input
                    type="number"
                    min={f.min}
                    max={f.max}
                    step={f.step}
                    value={values[f.key]}
                    onChange={(e) =>
                      setValues((prev) => ({
                        ...prev,
                        [f.key]: parseInt(e.target.value, 10) || f.min,
                      }))
                    }
                    className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </label>
              ))}
            </div>
          </div>
        ))}

        <div className="flex items-center gap-3 pt-1">
          <Button variant="default" size="sm" disabled={saving || !hasChanges} onClick={handleSave}>
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
