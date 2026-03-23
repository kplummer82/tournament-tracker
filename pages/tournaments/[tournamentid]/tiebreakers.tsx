// pages/tournaments/[tournamentid]/tiebreakers.tsx
import TournamentProvider, { useTournament } from "@/components/tournaments/TournamentProvider";
import TournamentShell from "@/components/tournaments/TournamentShell";
import TiebreakersPanel from "@/components/TiebreakersPanel";

function TiebreakersBody() {
  const { tid, canEdit } = useTournament();
  if (!tid) return <div className="text-sm text-muted-foreground">Invalid tournament id.</div>;
  return (
    <div>
      <div className="mb-5">
        <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "20px", textTransform: "uppercase", letterSpacing: "-0.01em" }}>
          Tiebreakers
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5" style={{ fontFamily: "var(--font-body)" }}>
          Configure how teams are ranked when they have equal records.
        </p>
      </div>
      <TiebreakersPanel tournamentId={tid} readOnly={!canEdit} />
    </div>
  );
}

export default function TiebreakersPage() {
  return (
    <TournamentProvider>
      <TournamentShell tab="tiebreakers">
        <TiebreakersBody />
      </TournamentShell>
    </TournamentProvider>
  );
}
