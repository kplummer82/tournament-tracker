// components/venues/VenuesPanel.tsx
// Scope-agnostic venues tab body (list + map toggle + add modals), shared by
// the tournament and season venues pages. `basePath` is the venues API prefix
// (e.g. `/api/tournaments/123/venues` or `/api/seasons/10/venues`).
"use client";
import { useCallback, useEffect, useState } from "react";
import { Plus, List, Map as MapIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import VenueCard from "@/components/venues/VenueCard";
import VenuesMap from "@/components/venues/VenuesMap";
import AddPredefinedVenueModal from "@/components/venues/AddPredefinedVenueModal";
import AddCustomVenueModal from "@/components/venues/AddCustomVenueModal";
import type { VenueDTO } from "@/components/venues/types";

interface Props {
  basePath: string;
  canEdit: boolean;
  scopeNoun?: string; // "tournament" | "season" — tunes copy
  onChanged?: () => void; // extra callback after a refresh (e.g. tournament setup badge)
}

const TOGGLE_BTN =
  "inline-flex items-center gap-1.5 border px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors";

export default function VenuesPanel({ basePath, canEdit, scopeNoun = "tournament", onChanged }: Props) {
  const [venues, setVenues] = useState<VenueDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openPredefined, setOpenPredefined] = useState(false);
  const [openCustom, setOpenCustom] = useState(false);
  const [view, setView] = useState<"list" | "map">("list");

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`${basePath}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load");
      setVenues(json.venues ?? []);
      onChanged?.();
    } catch (e: any) {
      setError(e.message);
    }
  }, [basePath, onChanged]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* List / Map toggle */}
        <div className="inline-flex">
          <button
            type="button"
            onClick={() => setView("list")}
            className={cn(
              TOGGLE_BTN,
              view === "list"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            <List className="h-3.5 w-3.5" /> List
          </button>
          <button
            type="button"
            onClick={() => setView("map")}
            className={cn(
              TOGGLE_BTN,
              "border-l-0",
              view === "map"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            <MapIcon className="h-3.5 w-3.5" /> Map
          </button>
        </div>

        {canEdit && (
          <div className="flex gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 border border-border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em]"
              onClick={() => setOpenPredefined(true)}
            >
              <Plus className="h-3 w-3" /> Add Predefined
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 border border-primary bg-primary text-primary-foreground px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em]"
              onClick={() => setOpenCustom(true)}
            >
              <Plus className="h-3 w-3" /> Add Custom
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {venues == null ? (
        <div className="space-y-2">
          <div className="h-20 bg-elevated animate-pulse" />
          <div className="h-20 bg-elevated animate-pulse" />
        </div>
      ) : venues.length === 0 ? (
        <div className="border border-dashed border-border p-8 text-center">
          <h2
            className="mb-1"
            style={{
              fontFamily: "var(--font-display)",
              textTransform: "uppercase",
              fontSize: "16px",
              letterSpacing: "0.02em",
            }}
          >
            No venues yet
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Add at least one venue so games can be scheduled. Pick from the existing locations directory or create a custom venue that lives only on this {scopeNoun}.
          </p>
          {canEdit && (
            <div className="flex justify-center gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 border border-border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em]"
                onClick={() => setOpenPredefined(true)}
              >
                <Plus className="h-3 w-3" /> Add Predefined
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 border border-primary bg-primary text-primary-foreground px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em]"
                onClick={() => setOpenCustom(true)}
              >
                <Plus className="h-3 w-3" /> Add Custom
              </button>
            </div>
          )}
        </div>
      ) : view === "map" ? (
        <VenuesMap venues={venues} />
      ) : (
        <div className="flex flex-col gap-3">
          {venues.map((v) => (
            <VenueCard
              key={v.id}
              basePath={basePath}
              venue={v}
              canEdit={canEdit}
              scopeNoun={scopeNoun}
              onChanged={refresh}
            />
          ))}
        </div>
      )}

      <AddPredefinedVenueModal
        open={openPredefined}
        onOpenChange={setOpenPredefined}
        basePath={basePath}
        onCreated={refresh}
      />
      <AddCustomVenueModal
        open={openCustom}
        onOpenChange={setOpenCustom}
        basePath={basePath}
        scopeNoun={scopeNoun}
        onCreated={refresh}
      />
    </div>
  );
}
