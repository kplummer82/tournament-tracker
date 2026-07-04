"use client";

import { useState, useEffect, useCallback } from "react";

type Device = {
  id: number;
  label: string | null;
  created_at: string;
  expires_at: string;
  current: boolean;
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Compact human label from a stored user-agent snapshot. */
function deviceLabel(ua: string | null): string {
  if (!ua) return "Unknown device";
  const browser =
    /Edg\//.test(ua) ? "Edge" :
    /OPR\//.test(ua) ? "Opera" :
    /Chrome\//.test(ua) ? "Chrome" :
    /Firefox\//.test(ua) ? "Firefox" :
    /Safari\//.test(ua) ? "Safari" :
    "Browser";
  const os =
    /Windows/.test(ua) ? "Windows" :
    /Mac OS X/.test(ua) ? "macOS" :
    /Android/.test(ua) ? "Android" :
    /iPhone|iPad/.test(ua) ? "iOS" :
    /Linux/.test(ua) ? "Linux" :
    null;
  return os ? `${browser} on ${os}` : browser;
}

/**
 * Trusted devices card: devices that skip the sign-in code for 30 days.
 * Revoking one forces the next sign-in from it to verify again.
 */
export default function TrustedDevices({ refreshKey = 0 }: { refreshKey?: number }) {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<number | null>(null);

  const load = useCallback(() => {
    fetch("/api/mfa/trusted-devices", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setDevices(d.devices ?? []))
      .catch(() => {
        setDevices([]);
        setError("Failed to load trusted devices.");
      });
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const revoke = async (id: number) => {
    setRevokingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/mfa/trusted-devices/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        setDevices((prev) => prev?.filter((d) => d.id !== id) ?? prev);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to remove the device.");
      }
    } catch {
      setError("Failed to remove the device.");
    }
    setRevokingId(null);
  };

  return (
    <section className="border border-border bg-card p-6">
      <h2 className="label-section mb-2" style={{ fontSize: "13px" }}>
        Trusted Devices
      </h2>
      <p className="text-sm text-muted-foreground mb-4" style={{ fontFamily: "var(--font-body)" }}>
        These devices skip the sign-in code until they expire. Remove one to
        require a code on its next sign-in.
      </p>

      {error && (
        <p className="mb-4 text-sm text-destructive border border-destructive/30 bg-destructive/10 px-3 py-2" style={{ fontFamily: "var(--font-body)" }}>
          {error}
        </p>
      )}

      {devices === null ? (
        <div className="h-9 w-full bg-border animate-pulse" />
      ) : devices.length === 0 ? (
        <p className="text-sm text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
          No trusted devices.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {devices.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="text-sm text-foreground flex items-center gap-2" style={{ fontFamily: "var(--font-body)" }}>
                  <span className="truncate">{deviceLabel(d.label)}</span>
                  {d.current && (
                    <span className="shrink-0 px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.08em] uppercase text-primary border border-primary/30 bg-primary/10">
                      This device
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
                  Added {formatDate(d.created_at)} · Expires {formatDate(d.expires_at)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => revoke(d.id)}
                disabled={revokingId === d.id}
                className="shrink-0 text-sm text-destructive hover:opacity-80 disabled:opacity-40 transition-opacity duration-100"
                style={{ fontFamily: "var(--font-body)" }}
              >
                {revokingId === d.id ? "Removing…" : "Remove"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
