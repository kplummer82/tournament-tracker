// pages/tournaments/[tournamentid]/venues.tsx
import TournamentProvider, { useTournament } from "@/components/tournaments/TournamentProvider";
import TournamentShell from "@/components/tournaments/TournamentShell";
import VenuesPanel from "@/components/venues/VenuesPanel";

function VenuesInner() {
  const { tid, canEdit, refreshSetup } = useTournament();
  if (!tid) return null;
  return (
    <VenuesPanel
      basePath={`/api/tournaments/${tid}/venues`}
      canEdit={canEdit}
      scopeNoun="tournament"
      onChanged={refreshSetup}
    />
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
