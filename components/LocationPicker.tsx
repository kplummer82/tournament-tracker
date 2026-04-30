"use client";

import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────────

type LocField = { id: number; name: string };
type LocOption = {
  id: number;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  fields: LocField[];
};

export interface LocationPickerValue {
  locationId: number | null;
  location: string;
  field: string;
}

interface LocationPickerProps {
  locationId: number | null;
  location: string;
  field: string;
  onChange: (val: LocationPickerValue) => void;
  compact?: boolean;
}

// ─── Shared locations cache ─────────────────────────────────────────────────────

let cachedLocations: LocOption[] | null = null;
let cachePromise: Promise<LocOption[]> | null = null;

function fetchLocations(): Promise<LocOption[]> {
  if (cachedLocations) return Promise.resolve(cachedLocations);
  if (cachePromise) return cachePromise;
  cachePromise = fetch("/api/locations?include=fields")
    .then((r) => r.json())
    .then((d) => {
      cachedLocations = d.locations ?? [];
      return cachedLocations!;
    })
    .catch(() => {
      cachedLocations = [];
      return [];
    });
  return cachePromise;
}

// ─── Styles ─────────────────────────────────────────────────────────────────────

const SELECT =
  "w-full border border-border bg-input px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors";
const SELECT_COMPACT =
  "border border-border bg-input px-1.5 py-0 text-xs text-foreground focus:outline-none focus:border-primary transition-colors";
const INPUT =
  "w-full border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors";
const INPUT_COMPACT =
  "border border-border bg-input px-1.5 py-0 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors";

// ─── Component ──────────────────────────────────────────────────────────────────

const CUSTOM = "__custom__";

export default function LocationPicker({
  locationId,
  location,
  field,
  onChange,
  compact = false,
}: LocationPickerProps) {
  const [locations, setLocations] = useState<LocOption[]>(cachedLocations ?? []);
  const [loaded, setLoaded] = useState(!!cachedLocations);

  // Determine mode: official (matched by id) or custom
  const isCustom = locationId == null && (location !== "" || field !== "");
  const selectedLoc = locations.find((l) => l.id === locationId) ?? null;

  useEffect(() => {
    if (!loaded) {
      fetchLocations().then((locs) => {
        setLocations(locs);
        setLoaded(true);
      });
    }
  }, [loaded]);

  const handleLocationSelect = (val: string) => {
    if (val === CUSTOM) {
      onChange({ locationId: null, location: "", field: "" });
      return;
    }
    if (val === "") {
      onChange({ locationId: null, location: "", field: "" });
      return;
    }
    const id = parseInt(val, 10);
    const loc = locations.find((l) => l.id === id);
    if (loc) {
      onChange({ locationId: loc.id, location: loc.name, field: "" });
    }
  };

  const handleFieldSelect = (val: string) => {
    if (val === CUSTOM) {
      // Switch to custom field entry but keep the official location
      onChange({ locationId, location, field: "" });
      return;
    }
    onChange({ locationId, location, field: val });
  };

  const selectCls = compact ? SELECT_COMPACT : SELECT;
  const inputCls = compact ? INPUT_COMPACT : INPUT;

  // Current select value
  const locSelectValue =
    locationId != null ? String(locationId) : isCustom ? CUSTOM : "";

  // Is the field currently a free-form override while location is official?
  const officialFields = selectedLoc?.fields ?? [];
  const fieldIsOfficial = officialFields.some((f) => f.name === field);
  const showFieldDropdown = selectedLoc != null;
  const showFieldFreeform =
    !selectedLoc || (selectedLoc && !fieldIsOfficial && field !== "");

  if (compact) {
    return (
      <span className="inline-flex items-center gap-1">
        <select
          className={cn(selectCls, "w-36")}
          value={locSelectValue}
          onChange={(e) => handleLocationSelect(e.target.value)}
        >
          <option value="">Location…</option>
          {locations.map((l) => (
            <option key={l.id} value={String(l.id)}>
              {l.name}
            </option>
          ))}
          <option value={CUSTOM}>Custom…</option>
        </select>
        {locSelectValue === CUSTOM ? (
          <>
            <input
              className={cn(inputCls, "w-28")}
              placeholder="Location"
              value={location}
              onChange={(e) =>
                onChange({ locationId: null, location: e.target.value, field })
              }
            />
            <input
              className={cn(inputCls, "w-24")}
              placeholder="Field"
              value={field}
              onChange={(e) =>
                onChange({ locationId: null, location, field: e.target.value })
              }
            />
          </>
        ) : selectedLoc ? (
          <select
            className={cn(selectCls, "w-28")}
            value={fieldIsOfficial ? field : CUSTOM}
            onChange={(e) => handleFieldSelect(e.target.value)}
          >
            <option value="">Field…</option>
            {officialFields.map((f) => (
              <option key={f.id} value={f.name}>
                {f.name}
              </option>
            ))}
            <option value={CUSTOM}>Custom…</option>
          </select>
        ) : null}
        {selectedLoc && !fieldIsOfficial && field !== "" && (
          <input
            className={cn(inputCls, "w-24")}
            placeholder="Field"
            value={field}
            onChange={(e) =>
              onChange({ locationId, location, field: e.target.value })
            }
          />
        )}
      </span>
    );
  }

  // ── Default (full-size) mode ──

  return (
    <div className="space-y-2">
      <select
        className={selectCls}
        value={locSelectValue}
        onChange={(e) => handleLocationSelect(e.target.value)}
      >
        <option value="">Select a location…</option>
        {locations.map((l) => (
          <option key={l.id} value={String(l.id)}>
            {l.name}
            {l.address ? ` — ${l.address}, ${l.city}` : ""}
          </option>
        ))}
        <option value={CUSTOM}>Custom location…</option>
      </select>

      {locSelectValue === CUSTOM && (
        <div className="grid grid-cols-2 gap-2">
          <input
            className={inputCls}
            placeholder="Location name"
            value={location}
            onChange={(e) =>
              onChange({ locationId: null, location: e.target.value, field })
            }
          />
          <input
            className={inputCls}
            placeholder="Field / court"
            value={field}
            onChange={(e) =>
              onChange({ locationId: null, location, field: e.target.value })
            }
          />
        </div>
      )}

      {selectedLoc && (
        <div className="space-y-2">
          <select
            className={selectCls}
            value={fieldIsOfficial ? field : showFieldFreeform ? CUSTOM : ""}
            onChange={(e) => handleFieldSelect(e.target.value)}
          >
            <option value="">Select a field…</option>
            {officialFields.map((f) => (
              <option key={f.id} value={f.name}>
                {f.name}
              </option>
            ))}
            {officialFields.length > 0 && (
              <option value={CUSTOM}>Custom field…</option>
            )}
          </select>
          {showFieldFreeform && (
            <input
              className={inputCls}
              placeholder="Field / court name"
              value={field}
              onChange={(e) =>
                onChange({ locationId, location, field: e.target.value })
              }
            />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Display helper for read-only location rendering ────────────────────────────

export function LocationDisplay({
  locationId,
  location,
  field,
  className,
}: {
  locationId: number | null;
  location: string | null;
  field: string | null;
  className?: string;
}) {
  if (!location && !field) return null;
  const text = [location, field].filter(Boolean).join(" \u00B7 ");
  const isOfficial = locationId != null;

  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {isOfficial && (
        <MapPin className="h-3 w-3 shrink-0 text-primary" />
      )}
      <span>{text}</span>
    </span>
  );
}
