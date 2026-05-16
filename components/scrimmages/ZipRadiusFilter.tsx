"use client";

import React, { useEffect, useState } from "react";
import { MapPin, X } from "lucide-react";
import { geocodeZip } from "@/lib/mapbox/geocodeZip";

export const RADIUS_PRESETS = [10, 25, 50, 100] as const;

export type ZipRadiusValue = {
  zip: string;
  lat: number | null;
  lng: number | null;
  radiusMiles: number;
  place: string | null;
};

type Props = {
  value: ZipRadiusValue;
  onChange: (next: ZipRadiusValue) => void;
};

export default function ZipRadiusFilter({ value, onChange }: Props) {
  const [localZip, setLocalZip] = useState(value.zip);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep local input in sync when parent clears the filter (e.g. Clear button).
  useEffect(() => {
    setLocalZip(value.zip);
    if (!value.zip) setError(null);
  }, [value.zip]);

  // Debounced geocoding on zip input changes.
  useEffect(() => {
    const trimmed = localZip.trim();

    if (trimmed === "") {
      setError(null);
      if (value.lat !== null || value.lng !== null || value.zip !== "") {
        onChange({ ...value, zip: "", lat: null, lng: null, place: null });
      }
      return;
    }

    if (!/^\d{5}$/.test(trimmed)) {
      setError(trimmed.length > 0 && trimmed.length < 5 ? null : "Enter a 5-digit US zip");
      return;
    }

    // Already resolved this exact zip.
    if (trimmed === value.zip && value.lat !== null && value.lng !== null) {
      setError(null);
      return;
    }

    let cancelled = false;
    setResolving(true);
    setError(null);

    const t = setTimeout(async () => {
      const result = await geocodeZip(trimmed);
      if (cancelled) return;
      setResolving(false);
      if (!result) {
        setError("Could not find that zip code");
        onChange({ ...value, zip: trimmed, lat: null, lng: null, place: null });
        return;
      }
      onChange({
        zip: trimmed,
        lat: result.lat,
        lng: result.lng,
        place: result.place,
        radiusMiles: value.radiusMiles || 25,
      });
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localZip]);

  const clear = () => {
    setLocalZip("");
    setError(null);
    onChange({ zip: "", lat: null, lng: null, place: null, radiusMiles: value.radiusMiles || 25 });
  };

  const setRadius = (mi: number) => {
    onChange({ ...value, radiusMiles: mi });
  };

  const isGeoActive = value.lat !== null && value.lng !== null;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        {/* Zip input */}
        <div className="relative">
          <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            inputMode="numeric"
            maxLength={5}
            value={localZip}
            onChange={(e) => setLocalZip(e.target.value.replace(/\D/g, "").slice(0, 5))}
            placeholder="Zip"
            className="h-9 w-[110px] pl-7 pr-7 text-xs border border-border bg-input text-foreground focus:outline-none focus:border-primary"
          />
          {localZip && (
            <button
              type="button"
              onClick={clear}
              aria-label="Clear zip"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          {resolving && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin rounded-full border-2 border-border border-t-primary" />
          )}
        </div>

        {/* Radius chips */}
        <div
          className="flex items-center gap-1"
          aria-label="Search radius"
        >
          {RADIUS_PRESETS.map((mi) => {
            const active = value.radiusMiles === mi;
            return (
              <button
                key={mi}
                type="button"
                onClick={() => setRadius(mi)}
                disabled={!isGeoActive}
                className={
                  "h-9 px-2.5 text-[11px] uppercase tracking-wider border transition-colors " +
                  (active
                    ? "border-primary text-primary"
                    : "border-border text-muted-foreground hover:border-primary hover:text-primary") +
                  " disabled:opacity-40 disabled:hover:border-border disabled:hover:text-muted-foreground"
                }
                style={{ fontFamily: "var(--font-body)" }}
              >
                {mi} mi
              </button>
            );
          })}
        </div>
      </div>

      {/* Status line: resolved place or error */}
      {error ? (
        <p className="text-[10px] text-destructive ml-1" style={{ fontFamily: "var(--font-body)" }}>
          {error}
        </p>
      ) : isGeoActive && value.place ? (
        <p
          className="text-[10px] text-muted-foreground ml-1 truncate max-w-[260px]"
          style={{ fontFamily: "var(--font-body)" }}
          title={value.place}
        >
          {value.place}
        </p>
      ) : null}
    </div>
  );
}
