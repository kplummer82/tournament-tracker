// pages/tournaments/[tournamentid]/index.tsx
import { useRouter } from "next/router";
import { useEffect } from "react";
export default function TournamentIndex() {
  const router = useRouter();
  useEffect(() => {
    const raw = Array.isArray(router.query.tournamentid) ? router.query.tournamentid[0] : router.query.tournamentid;
    if (raw) router.replace(`/tournaments/${raw}/overview`);
  }, [router.query.tournamentid]);
  return null;
}
