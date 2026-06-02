// components/tournaments/TournamentProvider.tsx
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { usePermissions } from "@/lib/hooks/usePermissions";
import type { Tournament, LookupRow, BatRow } from "./types";

export type SetupChecklistItem = {
  key: "venues" | "teams" | "pool-coverage" | "game-venues" | "schedule" | "tiebreakers" | "brackets";
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
  /** Bracket games still missing date/time or venue/field, by bracket. */
  unscheduledBracketGames: Array<{ bracketId: number; bracketName: string; gameId: string | null }>;
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
          pool_play_games_per_team: t.pool_play_games_per_team ?? null,
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
  const [teamIds, setTeamIds] = useState<number[] | null>(null);
  const [poolGames, setPoolGames] = useState<
    | Array<{
        id: number;
        home: number | null;
        away: number | null;
        tournament_venue_id: number | null;
        field: string | null;
        location_id: number | null;
        location: string | null;
        gamedate: string | null;
        gametime: string | null;
      }>
    | null
  >(null);
  const [tiebreakerCount, setTiebreakerCount] = useState<number | null>(null);
  // Bracket setup: total first-round seed slots across all brackets (incl. byes),
  // plus every bracket game's scheduling state (date/time + venue/field).
  const [bracketSetup, setBracketSetup] = useState<{
    firstRoundSlots: number;
    games: Array<{
      bracketId: number;
      bracketName: string;
      gameId: string | null;
      tournament_venue_id: number | null;
      field: string | null;
      location_id: number | null;
      location: string | null;
      gamedate: string | null;
      gametime: string | null;
    }>;
  } | null>(null);
  const [setupBump, setSetupBump] = useState(0);
  const refreshSetup = useCallback(() => setSetupBump((n) => n + 1), []);

  useEffect(() => {
    if (!tid) return;
    let cancelled = false;
    (async () => {
      try {
        const [venuesRes, teamsRes, poolRes, tbRes, bracketsRes] = await Promise.all([
          fetch(`/api/tournaments/${tid}/venues`).then((r) => r.json()).catch(() => ({ venues: [] })),
          fetch(`/api/tournaments/${tid}/teams`).then((r) => r.json()).catch(() => ({ teams: [] })),
          fetch(`/api/tournaments/${tid}/poolgames`).then((r) => r.json()).catch(() => ({ games: [] })),
          fetch(`/api/tournaments/${tid}/tiebreakers`).then((r) => r.json()).catch(() => ({ selected: [] })),
          fetch(`/api/tournaments/${tid}/brackets`).then((r) => r.json()).catch(() => ({ brackets: [] })),
        ]);
        if (cancelled) return;

        const venues: Array<{ id: number; fields?: Array<{ id: number; name: string }> }> = Array.isArray(
          venuesRes?.venues,
        )
          ? venuesRes.venues
          : [];
        setVenuesWithFields(venues.filter((v) => Array.isArray(v.fields) && v.fields.length > 0).length);

        const teams: any[] = Array.isArray(teamsRes?.teams) ? teamsRes.teams : Array.isArray(teamsRes) ? teamsRes : [];
        setTeamsCount(teams.length);
        setTeamIds(teams.map((t) => Number(t.id)).filter((n) => Number.isFinite(n)));

        const games: any[] = Array.isArray(poolRes?.games) ? poolRes.games : [];
        setPoolGames(
          games.map((g) => ({
            id: Number(g.id),
            home: g.home != null ? Number(g.home) : null,
            away: g.away != null ? Number(g.away) : null,
            tournament_venue_id: g.tournament_venue_id ?? null,
            field: g.field ?? null,
            location_id: g.location_id ?? null,
            location: g.location ?? null,
            gamedate: g.gamedate ?? null,
            gametime: g.gametime ?? null,
          })),
        );

        const selectedTb: any[] = Array.isArray(tbRes?.selected) ? tbRes.selected : [];
        setTiebreakerCount(selectedTb.length);

        // Brackets: sum first-round seed slots (structure.numTeams counts every
        // round-0 slot, including byes) and gather every bracket game so we can
        // confirm each is scheduled (date/time + venue/field).
        const brackets: Array<{ id: number; name?: string; structure: { numTeams?: number } | null }> = Array.isArray(
          bracketsRes?.brackets,
        )
          ? bracketsRes.brackets
          : [];
        const firstRoundSlots = brackets.reduce(
          (sum, b) => sum + (b.structure?.numTeams ?? 0),
          0,
        );
        const gameLists = await Promise.all(
          brackets.map((b) =>
            fetch(`/api/tournaments/${tid}/brackets/${b.id}/games`)
              .then((r) => r.json())
              .then((d) =>
                (Array.isArray(d?.games) ? d.games : []).map((g: any) => ({
                  ...g,
                  __bracketId: b.id,
                  __bracketName: b.name ?? `Bracket ${b.id}`,
                })),
              )
              .catch(() => [] as any[]),
          ),
        );
        if (cancelled) return;
        const bracketGames = gameLists.flat().map((g: any) => ({
          bracketId: g.__bracketId as number,
          bracketName: g.__bracketName as string,
          gameId: g.bracket_game_id ?? null,
          tournament_venue_id: g.tournament_venue_id ?? null,
          field: g.field ?? null,
          location_id: g.location_id ?? null,
          location: g.location ?? null,
          gamedate: g.gamedate ?? null,
          gametime: g.gametime ?? null,
        }));
        setBracketSetup({ firstRoundSlots, games: bracketGames });
      } catch {
        // swallow — checklist will simply show pending entries until data arrives
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tid, setupBump]);

  const setupChecklist: SetupChecklistItem[] = useMemo(() => {
    const ready =
      venuesWithFields != null &&
      teamsCount != null &&
      teamIds != null &&
      poolGames != null &&
      tiebreakerCount != null &&
      bracketSetup != null;
    const minTeams = Math.max(2, (t?.num_pool_groups ?? 1) * 2);

    const hasVenueWithField = (venuesWithFields ?? 0) >= 1;
    const games = poolGames ?? [];
    const gamesWithVenue = games.filter(
      (g) =>
        g.tournament_venue_id != null &&
        ((g.field != null && g.field.trim() !== "") || g.location_id != null || (g.location ?? "").trim() !== ""),
    ).length;
    const gamesScheduled = games.filter((g) => g.gamedate != null && g.gametime != null).length;

    // Per-team pool-play coverage: every team must have exactly N pool games.
    const perTeamTarget = t?.pool_play_games_per_team ?? null;
    const ids = teamIds ?? [];
    const gameCountByTeam = new Map<number, number>();
    for (const g of games) {
      if (g.home != null) gameCountByTeam.set(g.home, (gameCountByTeam.get(g.home) ?? 0) + 1);
      if (g.away != null) gameCountByTeam.set(g.away, (gameCountByTeam.get(g.away) ?? 0) + 1);
    }
    const teamsAtTarget =
      perTeamTarget != null
        ? ids.filter((id) => (gameCountByTeam.get(id) ?? 0) === perTeamTarget).length
        : 0;
    const teamsOverTarget =
      perTeamTarget != null
        ? ids.filter((id) => (gameCountByTeam.get(id) ?? 0) > perTeamTarget).length
        : 0;

    const teamsProgress = ready ? Math.min(1, (teamsCount ?? 0) / minTeams) : 0;
    const venuesProgress = ready ? (hasVenueWithField ? 1 : 0) : 0;
    // Coverage is gated on the setting being present (blank = required, never complete).
    const coverageProgress =
      ready && perTeamTarget != null && ids.length > 0 ? teamsAtTarget / ids.length : 0;
    const gameVenuesProgress = ready && games.length > 0 ? gamesWithVenue / games.length : 0;
    const scheduleProgress = ready && games.length > 0 ? gamesScheduled / games.length : 0;
    const tiebreakersProgress = ready && (tiebreakerCount ?? 0) >= 1 ? 1 : 0;

    // ── Bracket setup ─────────────────────────────────────────────────────────
    // Required first-round capacity = teams advancing total = advances_per_group × groups.
    // The brackets must collectively provide exactly that many first-round seed slots
    // (including byes), and every bracket game must be scheduled (date/time + venue/field).
    // Seeds need not be assigned yet — only the structure and scheduling.
    const advancesPerGroup = t?.advances_per_group ?? null;
    const requiredAdvancing =
      advancesPerGroup != null ? advancesPerGroup * Math.max(1, t?.num_pool_groups ?? 1) : null;
    const firstRoundSlots = bracketSetup?.firstRoundSlots ?? 0;
    const bracketGames = bracketSetup?.games ?? [];
    const isBracketGameScheduled = (g: (typeof bracketGames)[number]) =>
      g.gamedate != null &&
      g.gametime != null &&
      g.tournament_venue_id != null &&
      ((g.field != null && g.field.trim() !== "") || g.location_id != null || (g.location ?? "").trim() !== "");
    const unscheduledBracketGames = bracketGames.filter((g) => !isBracketGameScheduled(g));
    const bracketGamesScheduled = bracketGames.length - unscheduledBracketGames.length;
    const slotsMatch = requiredAdvancing != null && requiredAdvancing > 0 && firstRoundSlots === requiredAdvancing;
    const allBracketGamesScheduled =
      bracketGames.length > 0 && bracketGamesScheduled === bracketGames.length;
    const bracketsProgress = ready && slotsMatch && allBracketGamesScheduled ? 1 : 0;

    const bracketsDetail = !ready
      ? "Loading…"
      : requiredAdvancing == null
        ? "Set “Teams advancing per group” in Overview"
        : !slotsMatch
          ? `Bracket seats: ${firstRoundSlots} of ${requiredAdvancing} required`
          : bracketGames.length === 0
            ? "Apply a bracket template first"
            : allBracketGamesScheduled
              ? undefined
              : (() => {
                  const base = `${bracketGamesScheduled} of ${bracketGames.length} bracket games scheduled`;
                  const named = unscheduledBracketGames
                    .slice(0, 3)
                    .map((g) => `${g.bracketName}${g.gameId ? ` ${g.gameId}` : ""}`)
                    .join(", ");
                  const more = unscheduledBracketGames.length > 3 ? `, +${unscheduledBracketGames.length - 3} more` : "";
                  return named ? `${base} — needs ${named}${more}` : base;
                })();

    const coverageDetail = !ready
      ? "Loading…"
      : perTeamTarget == null
        ? "Set “Pool play games / team” in Overview"
        : ids.length === 0
          ? "Add teams first"
          : coverageProgress === 1
            ? undefined
            : teamsOverTarget > 0
              ? `${teamsAtTarget} of ${ids.length} teams at ${perTeamTarget} (${teamsOverTarget} over)`
              : `${teamsAtTarget} of ${ids.length} teams have ${perTeamTarget} games`;

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
        key: "pool-coverage",
        label: "Build the full pool schedule (games per team)",
        done: coverageProgress === 1,
        progress: coverageProgress,
        href: tid ? `/tournaments/${tid}/pool` : null,
        detail: coverageDetail,
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
      {
        key: "tiebreakers",
        label: "Establish at least one tiebreaker",
        done: tiebreakersProgress === 1,
        progress: tiebreakersProgress,
        href: tid ? `/tournaments/${tid}/tiebreakers` : null,
        detail: ready
          ? tiebreakersProgress === 1
            ? undefined
            : "No tiebreakers selected yet"
          : "Loading…",
      },
      {
        key: "brackets",
        label: "Build & schedule every bracket game",
        done: bracketsProgress === 1,
        progress: bracketsProgress,
        href: tid ? `/tournaments/${tid}/bracket` : null,
        detail: bracketsDetail,
      },
    ];
  }, [
    tid,
    t?.num_pool_groups,
    t?.pool_play_games_per_team,
    t?.advances_per_group,
    venuesWithFields,
    teamsCount,
    teamIds,
    poolGames,
    tiebreakerCount,
    bracketSetup,
  ]);

  const unscheduledBracketGames = useMemo(() => {
    const bracketGames = bracketSetup?.games ?? [];
    return bracketGames
      .filter(
        (g) =>
          !(
            g.gamedate != null &&
            g.gametime != null &&
            g.tournament_venue_id != null &&
            ((g.field != null && g.field.trim() !== "") || g.location_id != null || (g.location ?? "").trim() !== "")
          ),
      )
      .map((g) => ({ bracketId: g.bracketId, bracketName: g.bracketName, gameId: g.gameId }));
  }, [bracketSetup]);

  const setupReady =
    venuesWithFields != null &&
    teamsCount != null &&
    teamIds != null &&
    poolGames != null &&
    tiebreakerCount != null &&
    bracketSetup != null;
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
        unscheduledBracketGames,
      }}
    >
      {children}
    </C.Provider>
  );
}
