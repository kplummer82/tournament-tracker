"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type ApiKey = "mapbox_enabled" | "usps_enabled" | "itunes_enabled";

const DEFAULTS: Record<ApiKey, boolean> = {
  mapbox_enabled: false,
  usps_enabled: true,
  itunes_enabled: true,
};

const API_CONFIG: { key: ApiKey; title: string; description: string }[] = [
  {
    key: "mapbox_enabled",
    title: "Mapbox",
    description:
      "Master switch for all Mapbox API calls — place name search, address autofill, " +
      "and any future Mapbox integrations. Keep this off in DEV/LDQA unless actively " +
      "testing a Mapbox feature. Use it in production as an emergency kill switch if " +
      "Mapbox causes problems.",
  },
  {
    key: "usps_enabled",
    title: "USPS",
    description:
      "Controls address verification via the USPS Address Validation API. When disabled, " +
      "locations are saved with addresses exactly as entered and will not receive the " +
      "USPS-verified badge. All other location functionality is unaffected.",
  },
  {
    key: "itunes_enabled",
    title: "iTunes",
    description:
      "Controls the iTunes Search API used for walk-up song autocomplete on roster pages. " +
      "When disabled, the search field still accepts free-text song names but will not " +
      "make API calls or show search suggestions.",
  },
];

export default function AdminApisClient() {
  const [settings, setSettings] = useState<Record<ApiKey, boolean>>({ ...DEFAULTS });
  const [saved, setSaved] = useState<Record<ApiKey, boolean>>({ ...DEFAULTS });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<ApiKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successKey, setSuccessKey] = useState<ApiKey | null>(null);

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
        const s = data?.settings ?? {};
        const loaded: Record<ApiKey, boolean> = {
          mapbox_enabled: s.mapbox_enabled === true,
          usps_enabled: s.usps_enabled !== false,
          itunes_enabled: s.itunes_enabled !== false,
        };
        setSettings(loaded);
        setSaved(loaded);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load settings");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleToggle = async (key: ApiKey) => {
    const newVal = !settings[key];
    setSettings((prev) => ({ ...prev, [key]: newVal }));
    setSaving(key);
    setError(null);
    setSuccessKey(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ [key]: newVal }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to save");
      }
      const data = await res.json();
      const confirmed = data?.settings?.[key] ?? newVal;
      setSettings((prev) => ({ ...prev, [key]: confirmed }));
      setSaved((prev) => ({ ...prev, [key]: confirmed }));
      setSuccessKey(key);
      setTimeout(() => setSuccessKey(null), 3000);
    } catch (e) {
      // Rollback optimistic update
      setSettings((prev) => ({ ...prev, [key]: saved[key] }));
      setError(e instanceof Error ? e.message : "Failed to save settings");
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return <p className="text-muted-foreground">Loading settings…</p>;
  }

  return (
    <div className="max-w-lg space-y-4">
      {API_CONFIG.map(({ key, title, description }) => (
        <div key={key} className="rounded-xl border border-border bg-muted/20 p-6">
          <h3
            className="text-sm font-bold uppercase tracking-wide mb-1"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {title}
          </h3>
          <p
            className="text-xs text-muted-foreground mb-4"
            style={{ fontFamily: "var(--font-body)" }}
          >
            {description}
          </p>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              {settings[key] ? "Enabled" : "Disabled"}
            </span>
            <button
              role="switch"
              aria-checked={settings[key]}
              onClick={() => handleToggle(key)}
              disabled={saving === key}
              className={cn(
                "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                settings[key] ? "bg-primary" : "bg-border"
              )}
            >
              <span
                className={cn(
                  "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform",
                  settings[key] ? "translate-x-[18px]" : "translate-x-[2px]"
                )}
              />
            </button>
          </div>
          {successKey === key && (
            <span
              className="text-xs text-green-500 mt-2 block"
              style={{ fontFamily: "var(--font-body)" }}
            >
              Saved
            </span>
          )}
        </div>
      ))}

      {error && (
        <div className="border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive rounded-md">
          {error}
        </div>
      )}
    </div>
  );
}
