"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CitySearchResult {
  city: string;
  stateCode: string;
  latitude: number | null;
  longitude: number | null;
}

interface MapboxCitySearchProps {
  /** When set, renders a chip with the chosen city/state instead of the search input. */
  value: { city: string; state: string } | null;
  /** Called when the user picks a suggestion (after `retrieve`). */
  onSelect: (result: CitySearchResult) => void;
  /** Called when the user clicks the chip's ✕ to fall back to manual entry. */
  onClear: () => void;
}

interface SuggestionItem {
  mapbox_id: string;
  name: string;
  place_formatted: string;
  context?: {
    place?: { name: string };
    region?: { name: string; region_code: string };
    country?: { name: string; country_code: string };
  };
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
const INPUT =
  "w-full border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors";

export default function MapboxCitySearch({ value, onSelect, onClear }: MapboxCitySearchProps) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionToken = useRef<string>(crypto.randomUUID());

  useEffect(() => {
    if (value) return; // chip mode — no searching
    if (query.trim().length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    const id = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          q: query,
          types: "place,locality",
          access_token: MAPBOX_TOKEN,
          session_token: sessionToken.current,
        });
        const res = await fetch(
          `https://api.mapbox.com/search/searchbox/v1/suggest?${params}`
        );
        if (!res.ok) throw new Error(`Mapbox error: ${res.status}`);
        const data = await res.json();
        const items: SuggestionItem[] = data.suggestions ?? [];
        setSuggestions(items);
        setOpen(items.length > 0);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Search failed");
        setSuggestions([]);
        setOpen(false);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(id);
  }, [query, value]);

  const handleSelect = async (suggestion: SuggestionItem) => {
    setOpen(false);
    setError(null);
    try {
      const params = new URLSearchParams({
        access_token: MAPBOX_TOKEN,
        session_token: sessionToken.current,
      });
      const res = await fetch(
        `https://api.mapbox.com/search/searchbox/v1/retrieve/${suggestion.mapbox_id}?${params}`
      );
      if (!res.ok) throw new Error(`Mapbox retrieve error: ${res.status}`);
      const data = await res.json();
      const feature = data.features?.[0];
      if (!feature) return;
      const p = feature.properties ?? {};
      const ctx = p.context ?? suggestion.context ?? {};
      const coords = feature.geometry?.coordinates;
      // Rotate session token — each retrieve ends the billing session
      sessionToken.current = crypto.randomUUID();
      setQuery("");
      onSelect({
        city: p.name ?? ctx.place?.name ?? suggestion.name,
        stateCode: ctx.region?.region_code ?? "",
        latitude: Array.isArray(coords) ? coords[1] ?? null : null,
        longitude: Array.isArray(coords) ? coords[0] ?? null : null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to retrieve location");
    }
  };

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 border border-border bg-input px-3 py-2 text-sm text-foreground">
        <span className="truncate">
          {value.city}
          {value.state ? `, ${value.state}` : ""}
        </span>
        <button
          type="button"
          aria-label="Clear city"
          className="text-muted-foreground hover:text-foreground transition-colors"
          onClick={onClear}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <input
          className={cn(INPUT, "pl-8")}
          placeholder='Search city (e.g. "San Marcos")'
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          autoComplete="off"
        />
        {loading && (
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin rounded-full border-2 border-border border-t-primary" />
        )}
      </div>
      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 border border-border bg-card shadow-md max-h-60 overflow-y-auto">
          {suggestions.map((s) => (
            <li key={s.mapbox_id}>
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-muted/60 transition-colors"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(s)}
              >
                <span className="font-medium">{s.name}</span>
                {s.place_formatted && (
                  <span className="block text-xs text-muted-foreground">
                    {s.place_formatted}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-xs text-destructive mt-1">{error}</p>}
    </div>
  );
}
