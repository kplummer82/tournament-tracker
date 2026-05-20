"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapPin, Search, X } from "lucide-react";
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

// ─── Per-id detail cache ────────────────────────────────────────────────────────
// Avoids refetching the same location across many picker instances on a page.

const detailCache = new Map<number, LocOption>();
const detailInFlight = new Map<number, Promise<LocOption | null>>();

function fetchLocationById(id: number): Promise<LocOption | null> {
  const cached = detailCache.get(id);
  if (cached) return Promise.resolve(cached);
  const pending = detailInFlight.get(id);
  if (pending) return pending;
  const p = fetch(`/api/locations/${id}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      if (!d || typeof d.id !== "number") return null;
      const opt: LocOption = {
        id: d.id,
        name: d.name,
        address: d.address ?? null,
        city: d.city ?? null,
        state: d.state ?? null,
        zip: d.zip ?? null,
        fields: Array.isArray(d.fields)
          ? d.fields.map((f: any) => ({ id: f.id, name: f.name }))
          : [],
      };
      detailCache.set(id, opt);
      return opt;
    })
    .catch(() => null)
    .finally(() => {
      detailInFlight.delete(id);
    });
  detailInFlight.set(id, p);
  return p;
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

export default function LocationPicker({
  locationId,
  location,
  field,
  onChange,
  compact = false,
}: LocationPickerProps) {
  const [selectedLoc, setSelectedLoc] = useState<LocOption | null>(
    locationId != null ? detailCache.get(locationId) ?? null : null
  );

  // Typeahead state
  const [mode, setMode] = useState<"selected" | "searching" | "custom">(
    locationId != null
      ? "selected"
      : location !== "" || field !== ""
        ? "custom"
        : "searching"
  );
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [results, setResults] = useState<LocOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Resolve the selected location's detail (incl. fields) when locationId changes.
  useEffect(() => {
    if (locationId == null) {
      setSelectedLoc(null);
      return;
    }
    if (selectedLoc?.id === locationId) return;
    let cancelled = false;
    fetchLocationById(locationId).then((opt) => {
      if (!cancelled && opt) setSelectedLoc(opt);
    });
    return () => {
      cancelled = true;
    };
  }, [locationId, selectedLoc?.id]);

  // Debounce query.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  // Fetch search results.
  useEffect(() => {
    if (mode !== "searching") {
      setResults([]);
      return;
    }
    if (!debouncedQuery) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const params = new URLSearchParams({
      q: debouncedQuery,
      pageSize: "20",
      include: "fields",
    });
    fetch(`/api/locations?${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const rows: LocOption[] = Array.isArray(d.rows)
          ? d.rows.map((r: any) => ({
              id: r.id,
              name: r.name,
              address: r.address ?? null,
              city: r.city ?? null,
              state: r.state ?? null,
              zip: r.zip ?? null,
              fields: Array.isArray(r.fields)
                ? r.fields.map((f: any) => ({ id: f.id, name: f.name }))
                : [],
            }))
          : [];
        // Warm the per-id cache so later mounts skip the round-trip.
        for (const row of rows) detailCache.set(row.id, row);
        setResults(rows);
      })
      .catch(() => {
        if (!cancelled) setResults([]);
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, mode]);

  // Close popover on outside click. If the user opened the typeahead from a
  // freeform slot (via "Find match") and dismissed without picking, restore
  // the custom view so their typed values come back unchanged.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) {
        setOpen(false);
        if (mode === "searching" && locationId == null && (location || field)) {
          setMode("custom");
          setQuery("");
        }
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open, mode, locationId, location, field]);

  const handleSelect = (opt: LocOption) => {
    setSelectedLoc(opt);
    setMode("selected");
    setOpen(false);
    setQuery("");
    onChange({ locationId: opt.id, location: opt.name, field: "" });
  };

  const handleClearSelection = () => {
    setSelectedLoc(null);
    setMode("searching");
    setQuery("");
    setResults([]);
    onChange({ locationId: null, location: "", field: "" });
  };

  // Enter freeform mode. If invoked from a fresh selection or empty state we
  // clear values; if we already have preserved freeform text (e.g. user came
  // here from "Find match" then declined), keep what they had.
  const handleUseCustom = () => {
    setSelectedLoc(null);
    setMode("custom");
    setOpen(false);
    setQuery("");
    if (locationId != null || (!location && !field)) {
      onChange({ locationId: null, location: "", field: "" });
    }
  };

  // Search for an official match using the current freeform text as the query.
  // Preserves location/field on the parent so dismissing the popover (or returning
  // via the back arrow) restores the custom inputs unchanged.
  const handleFindMatch = () => {
    setMode("searching");
    setQuery(location);
    setDebouncedQuery(location.trim());
    setOpen(true);
  };

  const handleFieldSelect = (val: string) => {
    onChange({ locationId, location, field: val });
  };

  const officialFields = selectedLoc?.fields ?? [];
  const fieldIsOfficial = officialFields.some((f) => f.name === field);
  const inputCls = compact ? INPUT_COMPACT : INPUT;
  const selectCls = compact ? SELECT_COMPACT : SELECT;

  const sizeClass = compact ? "w-40" : "w-full";
  const popoverClass = compact ? "min-w-[18rem]" : "w-full";

  // ── Selected: show pill with name + clear button + field selector ──
  const SelectedBlock = useMemo(() => {
    if (mode !== "selected" || !selectedLoc) return null;
    const subtitle = [selectedLoc.address, selectedLoc.city, selectedLoc.state]
      .filter(Boolean)
      .join(", ");
    return (
      <div className={cn("space-y-1.5", compact ? "inline-flex flex-col items-stretch" : "")}>
        <div
          className={cn(
            "inline-flex items-center gap-2 border border-border bg-elevated px-2 py-1 text-sm",
            compact ? "text-xs" : ""
          )}
        >
          <MapPin className="h-3 w-3 shrink-0 text-primary" />
          <span className="truncate font-medium">{selectedLoc.name}</span>
          {subtitle && !compact && (
            <span className="truncate text-xs text-muted-foreground">— {subtitle}</span>
          )}
          <button
            type="button"
            onClick={handleClearSelection}
            className="text-muted-foreground hover:text-destructive transition-colors"
            title="Clear location"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
        {officialFields.length > 0 ? (
          <select
            className={cn(selectCls, sizeClass)}
            value={fieldIsOfficial ? field : ""}
            onChange={(e) => handleFieldSelect(e.target.value)}
          >
            <option value="">Select a field…</option>
            {officialFields.map((f) => (
              <option key={f.id} value={f.name}>
                {f.name}
              </option>
            ))}
          </select>
        ) : (
          <input
            className={cn(inputCls, sizeClass)}
            placeholder="Field / court (optional)"
            value={field}
            onChange={(e) =>
              onChange({ locationId, location, field: e.target.value })
            }
          />
        )}
      </div>
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, selectedLoc, field, fieldIsOfficial, officialFields, compact]);

  // ── Custom: free-form location + field, framed as an "unverified" chip ──
  // Mirrors the SelectedBlock pill so freeform vs official is legible at a glance.
  // Search-icon button promotes the typed text into a typeahead search without
  // discarding the user's values.
  const CustomBlock =
    mode === "custom" ? (
      <div
        className={cn(
          "inline-flex items-center gap-1.5 border border-dashed border-amber-500/50 bg-amber-500/5 px-2 py-1",
          compact ? "text-xs" : "text-sm w-full"
        )}
        title="Custom location — not linked to the official directory"
      >
        <MapPin className="h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" />
        <input
          className={cn(
            "bg-transparent border-0 focus:outline-none placeholder:text-muted-foreground italic",
            compact ? "text-xs w-28" : "text-sm flex-1 min-w-0"
          )}
          placeholder="Custom location"
          value={location}
          onChange={(e) =>
            onChange({ locationId: null, location: e.target.value, field })
          }
        />
        <span className="text-muted-foreground/40 select-none">·</span>
        <input
          className={cn(
            "bg-transparent border-0 focus:outline-none placeholder:text-muted-foreground italic",
            compact ? "text-xs w-24" : "text-sm w-36"
          )}
          placeholder="Field / court"
          value={field}
          onChange={(e) =>
            onChange({ locationId: null, location, field: e.target.value })
          }
        />
        <button
          type="button"
          onClick={handleFindMatch}
          className="text-muted-foreground hover:text-primary transition-colors shrink-0"
          title="Find a matching official location"
        >
          <Search className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={handleUseCustom}
          className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
          title="Clear"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    ) : null;

  // ── Searching: typeahead input + popover ──
  const SearchingBlock =
    mode === "searching" ? (
      <div ref={wrapperRef} className={cn("relative", compact ? "inline-block" : "")}>
        <input
          className={cn(inputCls, sizeClass)}
          placeholder="Search location…"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
        />
        {open && (debouncedQuery || results.length > 0 || searching) && (
          <div
            className={cn(
              "absolute z-20 mt-1 border border-border bg-card shadow-lg max-h-72 overflow-y-auto",
              popoverClass
            )}
          >
            {searching ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">Searching…</div>
            ) : results.length === 0 && debouncedQuery ? (
              <>
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  No matches for "{debouncedQuery}".
                </div>
                <button
                  type="button"
                  onClick={handleUseCustom}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-elevated border-t border-border/50 text-primary"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  Use a custom location instead →
                </button>
              </>
            ) : (
              <>
                {results.map((r) => {
                  const sub = [r.address, r.city, r.state].filter(Boolean).join(", ");
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => handleSelect(r)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-elevated border-b border-border/30 last:border-b-0"
                    >
                      <div className="font-medium">{r.name}</div>
                      {sub && (
                        <div className="text-xs text-muted-foreground truncate">{sub}</div>
                      )}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={handleUseCustom}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-elevated border-t border-border/50 text-primary"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  Use a custom location instead →
                </button>
              </>
            )}
          </div>
        )}
      </div>
    ) : null;

  if (compact) {
    return (
      <span className="inline-flex items-center gap-1 align-middle">
        {SelectedBlock}
        {SearchingBlock}
        {CustomBlock}
      </span>
    );
  }

  return (
    <div className="space-y-2">
      {SelectedBlock}
      {SearchingBlock}
      {CustomBlock}
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
  const text = [location, field].filter(Boolean).join(" · ");
  const isOfficial = locationId != null;

  return (
    <span
      className={cn("inline-flex items-center gap-1", className)}
      title={isOfficial ? undefined : "Custom location — not linked to the official directory"}
    >
      <MapPin
        className={cn(
          "h-3 w-3 shrink-0",
          isOfficial ? "text-primary" : "text-amber-600 dark:text-amber-400"
        )}
      />
      <span className={cn(!isOfficial && "italic text-muted-foreground")}>{text}</span>
    </span>
  );
}
