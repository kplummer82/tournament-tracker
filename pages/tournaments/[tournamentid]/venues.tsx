// pages/tournaments/[tournamentid]/venues.tsx
import { useCallback, useEffect, useState } from "react";
import TournamentProvider, { useTournament } from "@/components/tournaments/TournamentProvider";
import TournamentShell from "@/components/tournaments/TournamentShell";
import VenueCard, { type VenueDTO } from "@/components/tournaments/venues/VenueCard";
import AddPredefinedVenueModal from "@/components/tournaments/venues/AddPredefinedVenueModal";
import AddCustomVenueModal from "@/components/tournaments/venues/AddCustomVenueModal";
import { Plus } from "lucide-react";

function VenuesInner() {
  const { tid, canEdit } = useTournament();
  const [venues, setVenues] = useState<VenueDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openPredefined, setOpenPredefined] = useState(false);
  const [openCustom, setOpenCustom] = useState(false);

  const refresh = useCallback(async () => {
    if (!tid) return;
    setError(null);
    try {
      const res = await fetch(`/api/tournaments/${tid}/venues`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load");
      setVenues(json.venues ?? []);
    } catch (e: any) {
      setError(e.message);
    }
  }, [tid]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!tid) return null;

  return (
    <div className="flex flex-col gap-4">
      {canEdit && (
        <div className="flex justify-end gap-2">
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
            Add at least one venue so games can be scheduled. Pick from the existing locations directory or create a custom venue that lives only on this tournament.
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
      ) : (
        <div className="flex flex-col gap-3">
          {venues.map((v) => (
            <VenueCard
              key={v.id}
              tournamentId={tid}
              venue={v}
              canEdit={canEdit}
              onChanged={refresh}
            />
          ))}
        </div>
      )}

      <AddPredefinedVenueModal
        open={openPredefined}
        onOpenChange={setOpenPredefined}
        tournamentId={tid}
        onCreated={refresh}
      />
      <AddCustomVenueModal
        open={openCustom}
        onOpenChange={setOpenCustom}
        tournamentId={tid}
        onCreated={refresh}
      />
    </div>
  );
}

export default function VenuesPage() {
  return (
    <TournamentProvider>
      <TournamentShell tab="venues">
        <VenuesInner />
      </TournamentShell>
    </TournamentProvider>
  );
}
