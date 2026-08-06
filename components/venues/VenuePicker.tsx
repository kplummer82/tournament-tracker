// components/venues/VenuePicker.tsx
// Scope-agnostic venue → field dependent selects, backed by a venues API at
// `basePath`. Emits a neutral value; callers map venueId to their column
// (tournament_venue_id / season_venue_id).
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { VenueDTO } from "@/components/venues/types";
import { TBD_FIELD } from "@/components/venues/types";
import FieldAvailabilityNotice from "@/components/FieldAvailabilityNotice";

export interface VenuePickerValue {
  venueId: number | null;
  locationId: number | null;
  location: string; // human label used by legacy display code
  field: string;
}

interface Props {
  basePath: string;   // e.g. /api/seasons/10/venues
  setupHref: string;  // e.g. /seasons/10/venues
  value: VenuePickerValue;
  onChange: (v: VenuePickerValue) => void;
  /**
   * Games must always name a field, so picking a venue pre-selects TBD rather
   * than leaving the field blank. Callers still validate before saving.
   */
  requireField?: boolean;
}

const SELECT =
  "w-full border border-border bg-input px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors";

export default function VenuePicker({ basePath, setupHref, value, onChange, requireField = false }: Props) {
  const [venues, setVenues] = useState<VenueDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${basePath}`);
        const json = await res.json();
        if (!cancelled) setVenues(Array.isArray(json.venues) ? json.venues : []);
      } catch (e: any) {
        if (!cancelled) setError(e.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [basePath]);

  if (venues == null) {
    return <div className="h-9 bg-elevated animate-pulse" />;
  }

  if (venues.length === 0) {
    return (
      <div className="border border-dashed border-border p-3 text-sm">
        <p className="text-muted-foreground mb-1">No venues set up yet.</p>
        <Link className="text-primary underline" href={setupHref}>
          Set up venues
        </Link>
      </div>
    );
  }

  const selected = venues.find((v) => v.id === value.venueId) ?? null;

  return (
    <div className="grid grid-cols-2 gap-2">
      <select
        className={SELECT}
        value={value.venueId ?? ""}
        onChange={(e) => {
          const raw = e.target.value;
          if (!raw) {
            onChange({ venueId: null, locationId: null, location: "", field: "" });
            return;
          }
          const v = venues.find((x) => x.id === Number(raw));
          if (!v) return;
          onChange({
            venueId: v.id,
            locationId: v.locationId,
            location: v.name,
            field: requireField ? TBD_FIELD : "",
          });
        }}
      >
        <option value="">— Select venue —</option>
        {venues.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name}
          </option>
        ))}
      </select>
      <select
        className={SELECT}
        // Legacy rows carry a free-text location with no venue row — still let
        // those pick a field (TBD at minimum) rather than dead-ending.
        disabled={!selected && !value.location}
        value={value.field}
        onChange={(e) => onChange({ ...value, field: e.target.value })}
      >
        <option value="">— Select field —</option>
        {/* Always available so a game can be set before the field is known. */}
        <option value={TBD_FIELD}>TBD</option>
        {selected?.fields
          .filter((f) => f.name !== TBD_FIELD)
          .map((f) => (
            <option key={f.id} value={f.name}>
              {f.name}
            </option>
          ))}
      </select>
      {error && <p className="col-span-2 text-xs text-destructive">{error}</p>}
      <FieldAvailabilityNotice className="col-span-2" />
    </div>
  );
}
