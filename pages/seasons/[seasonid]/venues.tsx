// pages/seasons/[seasonid]/venues.tsx
import SeasonProvider, { useSeason } from "@/components/seasons/SeasonProvider";
import SeasonShell from "@/components/seasons/SeasonShell";
import VenuesPanel from "@/components/venues/VenuesPanel";

function VenuesInner() {
  const { seasonId, canEdit } = useSeason();
  if (!seasonId) return null;
  return (
    <VenuesPanel
      basePath={`/api/seasons/${seasonId}/venues`}
      canEdit={canEdit}
      scopeNoun="season"
    />
  );
}

export default function SeasonVenuesPage() {
  return (
    <SeasonProvider>
      <SeasonShell tab="venues">
        <VenuesInner />
      </SeasonShell>
    </SeasonProvider>
  );
}
