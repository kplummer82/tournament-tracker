"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import MapboxCitySearch from "@/components/MapboxCitySearch";

// ─── Value ──────────────────────────────────────────────────────────────────────
// Flat rather than a discriminated union so it maps 1:1 onto the API payload and
// onto the `teams` columns the migration adds.

export type TeamLocation = {
  locationType: "home_field" | "city" | null;
  /** Set when locationType === "home_field" — a row in the shared directory. */
  homeLocationId: number | null;
  /** Display-only label for the chosen home field. */
  homeLocationName: string | null;
  /** Set when locationType === "city" — resolved through Mapbox. */
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
};

export const EMPTY_TEAM_LOCATION: TeamLocation = {
  locationType: null,
  homeLocationId: null,
  homeLocationName: null,
  city: null,
  state: null,
  latitude: null,
  longitude: null,
};

/** True once the user has made a complete choice in either mode. */
export function isTeamLocationComplete(v: TeamLocation): boolean {
  if (v.locationType === "home_field") return v.homeLocationId != null;
  if (v.locationType === "city") return !!v.city?.trim();
  return false;
}

/** The subset the teams API accepts on POST/PATCH. */
export function teamLocationPayload(v: TeamLocation) {
  if (v.locationType === "home_field") {
    return { locationType: "home_field" as const, homeLocationId: v.homeLocationId };
  }
  if (v.locationType === "city") {
    return {
      locationType: "city" as const,
      city: v.city,
      state: v.state,
      latitude: v.latitude,
      longitude: v.longitude,
    };
  }
  return { locationType: null };
}

/** Human-readable label, matching what the API derives for `location_label`. */
export function teamLocationLabel(v: TeamLocation): string | null {
  if (v.locationType === "home_field") return v.homeLocationName ?? null;
  if (v.locationType === "city") {
    return v.city ? [v.city, v.state].filter(Boolean).join(", ") : null;
  }
  return null;
}

// ─── Styles ─────────────────────────────────────────────────────────────────────

const INPUT =
  "w-full border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors";

// ─── Home-field typeahead ───────────────────────────────────────────────────────
// Selection-only: a home field must resolve to a row in the shared directory, so
// there is deliberately no freeform escape hatch here (unlike LocationPicker,
// which allows one-off game venues).

type LocRow = {
  id: number;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
};

function HomeFieldSearch({
  selectedName,
  onSelect,
  onClear,
}: {
  selectedName: string | null;
  onSelect: (row: LocRow) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LocRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedName) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      setSearching(true);
      fetch(`/api/locations?q=${encodeURIComponent(q)}&pageSize=20`)
        .then((r) => (r.ok ? r.json() : { rows: [] }))
        .then((d) => {
          if (cancelled) return;
          setResults(Array.isArray(d.rows) ? d.rows : []);
          setOpen(true);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, selectedName]);

  // Close the popover on outside click.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  if (selectedName) {
    return (
      <div className="flex items-center justify-between gap-2 border border-border bg-input px-3 py-2 text-sm text-foreground">
        <span className="inline-flex min-w-0 items-center gap-2">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="truncate">{selectedName}</span>
        </span>
        <button
          type="button"
          aria-label="Clear home field"
          className="text-muted-foreground hover:text-foreground transition-colors"
          onClick={onClear}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          className={cn(INPUT, "pl-8")}
          placeholder="Search fields (e.g. &quot;Mission Sports Park&quot;)"
          value={query}
          onFocus={() => results.length > 0 && setOpen(true)}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
        />
        {searching && (
          <div className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin rounded-full border-2 border-border border-t-primary" />
        )}
      </div>
      {open && (results.length > 0 || (!searching && query.trim().length >= 2)) && (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto border border-border bg-card shadow-md">
          {results.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              No fields match &quot;{query.trim()}&quot;. Try the City option instead.
            </div>
          ) : (
            results.map((r) => {
              const sub = [r.address, r.city, r.state].filter(Boolean).join(", ");
              return (
                <button
                  key={r.id}
                  type="button"
                  className="w-full border-b border-border/30 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-elevated transition-colors"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setOpen(false);
                    setQuery("");
                    onSelect(r);
                  }}
                >
                  <span className="block font-medium">{r.name}</span>
                  {sub && <span className="block truncate text-xs text-muted-foreground">{sub}</span>}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────────

export default function TeamLocationInput({
  value,
  onChange,
  idPrefix = "team-location",
}: {
  value: TeamLocation;
  onChange: (next: TeamLocation) => void;
  /** Distinguishes the radio group when create and edit forms coexist. */
  idPrefix?: string;
}) {
  // The toggle defaults to "home_field" so the field search is what a coach
  // sees first; picking "city" is the fallback for teams without a home venue.
  const mode: "home_field" | "city" = value.locationType ?? "home_field";

  const setMode = (next: "home_field" | "city") => {
    if (next === mode && value.locationType != null) return;
    // Switching modes discards the other mode's value so we never persist both.
    onChange({ ...EMPTY_TEAM_LOCATION, locationType: next });
  };

  return (
    <div className="grid gap-2">
      <div className="flex" role="radiogroup" aria-label="Team location">
        {(
          [
            ["home_field", "Home field"],
            ["city", "City"],
          ] as const
        ).map(([key, label], i) => (
          <button
            key={key}
            id={`${idPrefix}-${key}`}
            type="button"
            role="radio"
            aria-checked={mode === key}
            onClick={() => setMode(key)}
            className={cn(
              "px-3 py-1.5 text-[11px] uppercase tracking-[0.08em] border transition-colors duration-100",
              i > 0 && "-ml-px",
              mode === key
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            )}
            style={{ fontFamily: "var(--font-body)" }}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "home_field" ? (
        <HomeFieldSearch
          selectedName={value.homeLocationId != null ? value.homeLocationName : null}
          onSelect={(row) =>
            onChange({
              ...EMPTY_TEAM_LOCATION,
              locationType: "home_field",
              homeLocationId: row.id,
              homeLocationName: row.name,
            })
          }
          onClear={() => onChange({ ...EMPTY_TEAM_LOCATION, locationType: "home_field" })}
        />
      ) : (
        <MapboxCitySearch
          value={value.city ? { city: value.city, state: value.state ?? "" } : null}
          onSelect={(r) =>
            onChange({
              ...EMPTY_TEAM_LOCATION,
              locationType: "city",
              city: r.city,
              state: r.stateCode || null,
              latitude: r.latitude,
              longitude: r.longitude,
            })
          }
          onClear={() => onChange({ ...EMPTY_TEAM_LOCATION, locationType: "city" })}
        />
      )}

      <p className="text-xs text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
        {mode === "home_field"
          ? "Pick the team's home venue from the shared field directory."
          : "Search for the team's home city — results come from Mapbox."}
      </p>
    </div>
  );
}
