// components/tournaments/TournamentProvider.tsx
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { usePermissions } from "@/lib/hooks/usePermissions";
import type { Tournament, LookupRow, BatRow } from "./types";

export type SetupChecklistItem = {
  key: "venues" | "teams" | "game-venues" | "schedule";
  label: string;
  done: boolean;
  progress: number;
  href: string | null;
  detail?: string;
};

type Ctx = {
  tid: number | null;
  t: Tournament | null;
  setT: React.Dispatch<React.SetStateAction<Tournament | null>>;
  divisions: LookupRow[];
  statuses: LookupRow[];
  visibilities: LookupRow[];
  bats: BatRow[];
  loading: boolean;
  error: string | null;
  saving: boolean;
  save: () => Promise<void>;
  remove: () => Promise<void>;
  canEdit: boolean;
  setupChecklist: SetupChecklistItem[];
  setupPercent: number;
  setupReady: boolean;
  refreshSetup: () => void;
};

const C = createContext<Ctx | undefined>(undefined);
export const useTournament = () => {
  const ctx = useContext(C);
  if (!ctx) throw new Error("useTournament must be used within TournamentProvider");
  return ctx;
};

export default function TournamentProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const tid = useMemo(() => {
    const raw = Array.isArray(router.query.tournamentid) ? router.query.tournamentid[0] : router.query.tournamentid;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }, [router.query.tournamentid]);

  const [t, setT] = useState<Tournament | null>(null);
  const [divisions, setDivisions] = useState<LookupRow[]>([]);
  const [statuses, setStatuses] = useState<LookupRow[]>([]);
  const [visibilities, setVisibilities] = useState<LookupRow[]>([]);
  const [bats, setBats] = useState<BatRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!router.isReady || !tid) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [lk, tr] = await Promise.all([
          fetch("/api/lookups").then((r) => r.json()),
          fetch(`/api/tournaments/${tid}`).then((r) => r.json()),
        ]);
        if (cancelled) return;
        setDivisions(Array.isArray(lk?.divisions) ? lk.divisions : []);
        setStatuses(Array.isArray(lk?.tournamentstatus) ? lk.tournamentstatus : lk?.statuses ?? []);
        setVisibilities(Array.isArray(lk?.tournamentvisibility) ? lk.tournamentvisibility : lk?.visibilities ?? []);
        setBats(Array.isArray(lk?.bats) ? lk.bats : []);
        setT(tr as Tournament);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => void (cancelled = true);
  }, [router.isReady, tid]);

  const permissions = usePermissions();
  const canEdit = useMemo(() => {
    if (permissions.loading || !tid) return false;
    return permissions.canEditTournament(tid);
  }, [permissions, tid]);

  const save = async () => {
    if (!tid || !t) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/tournaments/${tid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: t.name,
          city: t.city,
          state: t.state,
          year: t.year,
          maxrundiff: t.maxrundiff,
          forfeit_run_diff: t.forfeit_run_diff ?? null,
          advances_per_group: t.advances_per_group ?? null,
          num_pool_groups: t.num_pool_groups ?? null,
          divisionid: t.divisionid,
          statusid: t.statusid,
          visibilityid: t.visibilityid,
          bat_ids: (t.bats ?? []).map((b) => b.id),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Save failed");
      setT(json as Tournament);
    } finally {
      setSaving(false);
    }
  };

  // ── Setup completion checklist ──────────────────────────────────────────────
  const [venuesWithFields, setVenuesWithFields] = useState<number | null>(null);
  const [teamsCount, setTeamsCount] = useState<number | null>(null);
  const [poolGames, setPoolGames] = useState<
    | Array<{
        id: number;
        tournament_venue_id: number | null;
        field: string | null;
        location_id: number | null;
        location: string | null;
        gamedate: string | null;
        gametime: string | null;
      }>
    | null
  >(null);
  const [setupBump, setSetupBump] = useState(0);
  const refreshSetup = useCallback(() => setSetupBump((n) => n + 1), []);

  useEffect(() => {
    if (!tid) return;
    let cancelled = false;
    (async () => {
      try {
        const [venuesRes, teamsRes, poolRes] = await Promise.all([
          fetch(`/api/tournaments/${tid}/venues`).then((r) => r.json()).catch(() => ({ venues: [] })),
          fetch(`/api/tournaments/${tid}/teams`).then((r) => r.json()).catch(() => ({ teams: [] })),
          fetch(`/api/tournaments/${tid}/poolgames`).then((r) => r.json()).catch(() => ({ games: [] })),
        ]);
        if (cancelled) return;

        const venues: Array<{ id: number; fields?: Array<{ id: number; name: string }> }> = Array.isArray(
          venuesRes?.venues,
        )
          ? venuesRes.venues
          : [];
        setVenuesWithFields(venues.filter((v) => Array.isArray(v.fields) && v.fields.length > 0).length);

        const teams: unknown[] = Array.isArray(teamsRes?.teams) ? teamsRes.teams : Array.isArray(teamsRes) ? teamsRes : [];
        setTeamsCount(teams.length);

        const games: any[] = Array.isArray(poolRes?.games) ? poolRes.games : [];
        setPoolGames(
          games.map((g) => ({
            id: Number(g.id),
            tournament_venue_id: g.tournament_venue_id ?? null,
            field: g.field ?? null,
            location_id: g.location_id ?? null,
            location: g.location ?? null,
            gamedate: g.gamedate ?? null,
            gametime: g.gametime ?? null,
          })),
        );
      } catch {
        // swallow — checklist will simply show pending entries until data arrives
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tid, setupBump]);

  const setupChecklist: SetupChecklistItem[] = useMemo(() => {
    const ready = venuesWithFields != null && teamsCount != null && poolGames != null;
    const minTeams = Math.max(2, (t?.num_pool_groups ?? 1) * 2);

    const hasVenueWithField = (venuesWithFields ?? 0) >= 1;
    const games = poolGames ?? [];
    const gamesWithVenue = games.filter(
      (g) =>
        g.tournament_venue_id != null &&
        ((g.field != null && g.field.trim() !== "") || g.location_id != null || (g.location ?? "").trim() !== ""),
    ).length;
    const gamesScheduled = games.filter((g) => g.gamedate != null && g.gametime != null).length;

    const teamsProgress = ready ? Math.min(1, (teamsCount ?? 0) / minTeams) : 0;
    const venuesProgress = ready ? (hasVenueWithField ? 1 : 0) : 0;
    const gameVenuesProgress = ready && games.length > 0 ? gamesWithVenue / games.length : 0;
    const scheduleProgress = ready && games.length > 0 ? gamesScheduled / games.length : 0;

    return [
      {
        key: "venues",
        label: "Add a venue with at least one field",
        done: venuesProgress === 1,
        progress: venuesProgress,
        href: tid ? `/tournaments/${tid}/venues` : null,
        detail: ready
          ? hasVenueWithField
            ? undefined
            : "No venues with fields yet"
          : "Loading…",
      },
      {
        key: "teams",
        label: "Add teams to fill pool groups",
        done: teamsProgress === 1,
        progress: teamsProgress,
        href: tid ? `/tournaments/${tid}/teams` : null,
        detail: ready
          ? teamsProgress === 1
            ? undefined
            : `${teamsCount ?? 0} of ${minTeams} teams`
          : "Loading…",
      },
      {
        key: "game-venues",
        label: "Assign venue & field to every game",
        done: gameVenuesProgress === 1,
        progress: gameVenuesProgress,
        href: tid ? `/tournaments/${tid}/pool` : null,
        detail: ready
          ? games.length === 0
            ? "No games yet"
            : gameVenuesProgress === 1
              ? undefined
              : `${gamesWithVenue} of ${games.length} assigned`
          : "Loading…",
      },
      {
        key: "schedule",
        label: "Schedule every game (date & time)",
        done: scheduleProgress === 1,
        progress: scheduleProgress,
        href: tid ? `/tournaments/${tid}/pool` : null,
        detail: ready
          ? games.length === 0
            ? "No games yet"
            : scheduleProgress === 1
              ? undefined
              : `${gamesScheduled} of ${games.length} scheduled`
          : "Loading…",
      },
    ];
  }, [tid, t?.num_pool_groups, venuesWithFields, teamsCount, poolGames]);

  const setupReady = venuesWithFields != null && teamsCount != null && poolGames != null;
  const setupPercent = useMemo(() => {
    if (!setupReady) return 0;
    const total = setupChecklist.reduce((sum, i) => sum + i.progress, 0);
    return Math.round((total / setupChecklist.length) * 100);
  }, [setupChecklist, setupReady]);

  const remove = async () => {
    if (!tid) return;
    if (!confirm("Delete this tournament? This cannot be undone.")) return;
    const res = await fetch(`/api/tournaments/${tid}`, { method: "DELETE" });
    if (res.ok) router.push("/tournaments");
    else {
      const j = await res.json().catch(() => ({}));
      alert(j?.error || "Delete failed");
    }
  };

  return (
    <C.Provider
      value={{
        tid,
        t,
        setT,
        divisions,
        statuses,
        visibilities,
        bats,
        loading,
        error,
        saving,
        save,
        remove,
        canEdit,
        setupChecklist,
        setupPercent,
        setupReady,
        refreshSetup,
      }}
    >
      {children}
    </C.Provider>
  );
}
