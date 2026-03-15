import { useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ChevronUp, ChevronDown, Info } from "lucide-react";

export type SosGameRow = {
  id: number;
  home: number | null;
  away: number | null;
  homescore: number | null;
  awayscore: number | null;
  gamestatusid: number | null;
  game_type: string;
};

export type StandingsRowInput = {
  teamid: number;
  team: string;
  wins: number;
  games: number;
  wltpct: number | null;
  rank_final: number;
};

type SosRow = {
  teamid: number;
  team: string;
  rank: number;
  wpct: number;
  owp: number;
  oowp: number;
  rpi: number;
};

type SortKey = "rank" | "team" | "owp" | "oowp" | "rpi";
type SortDir = "asc" | "desc";

const COMPLETED_STATUSES = new Set([4, 6, 7]);

function formatPct(n: number): string {
  const s = n.toFixed(3);
  return s.startsWith("0.") ? s.slice(1) : s;
}

function computeSos(
  standings: StandingsRowInput[],
  games: SosGameRow[],
  mode: "full" | "remaining"
): SosRow[] {
  const regular = games.filter((g) => g.game_type === "regular");
  const completed = regular.filter(
    (g) => g.gamestatusid !== null && COMPLETED_STATUSES.has(g.gamestatusid)
  );
  const unplayed = regular.filter(
    (g) => g.gamestatusid === null || !COMPLETED_STATUSES.has(g.gamestatusid)
  );

  // Build per-team records from completed games
  // Track wins and games per team, and also per-matchup for H2H exclusion
  const teamRecord = new Map<number, { wins: number; games: number }>();
  // h2h[teamA][teamB] = { wins: teamA's wins vs B, games: total }
  const h2h = new Map<number, Map<number, { wins: number; games: number }>>();

  function ensureTeam(id: number) {
    if (!teamRecord.has(id)) teamRecord.set(id, { wins: 0, games: 0 });
    if (!h2h.has(id)) h2h.set(id, new Map());
  }

  function ensureH2H(a: number, b: number) {
    const mapA = h2h.get(a)!;
    if (!mapA.has(b)) mapA.set(b, { wins: 0, games: 0 });
  }

  for (const g of completed) {
    if (g.home === null || g.away === null) continue;
    const home = g.home;
    const away = g.away;
    ensureTeam(home);
    ensureTeam(away);
    ensureH2H(home, away);
    ensureH2H(away, home);

    const homeRec = teamRecord.get(home)!;
    const awayRec = teamRecord.get(away)!;
    const h2hHome = h2h.get(home)!.get(away)!;
    const h2hAway = h2h.get(away)!.get(home)!;

    homeRec.games++;
    awayRec.games++;
    h2hHome.games++;
    h2hAway.games++;

    if (g.gamestatusid === 6) {
      // Home forfeit → away wins
      awayRec.wins++;
      h2hAway.wins++;
    } else if (g.gamestatusid === 7) {
      // Away forfeit → home wins
      homeRec.wins++;
      h2hHome.wins++;
    } else {
      // Status 4 (Final)
      const hs = g.homescore ?? 0;
      const as = g.awayscore ?? 0;
      if (hs > as) {
        homeRec.wins++;
        h2hHome.wins++;
      } else if (as > hs) {
        awayRec.wins++;
        h2hAway.wins++;
      } else {
        // Tie
        homeRec.wins += 0.5;
        awayRec.wins += 0.5;
        h2hHome.wins += 0.5;
        h2hAway.wins += 0.5;
      }
    }
  }

  // Build opponent lists based on mode
  const sourceGames = mode === "full" ? completed : unplayed;
  const opponentLists = new Map<number, number[]>();

  for (const g of sourceGames) {
    if (g.home === null || g.away === null) continue;
    if (!opponentLists.has(g.home)) opponentLists.set(g.home, []);
    if (!opponentLists.has(g.away)) opponentLists.set(g.away, []);
    opponentLists.get(g.home)!.push(g.away);
    opponentLists.get(g.away)!.push(g.home);
  }

  // Ensure all standings teams are present
  for (const s of standings) {
    ensureTeam(s.teamid);
    if (!opponentLists.has(s.teamid)) opponentLists.set(s.teamid, []);
  }

  // Compute OWP for each team
  // OWP(team) = avg of each opponent's WPct excluding games vs team
  const owpMap = new Map<number, number>();

  for (const s of standings) {
    const opponents = opponentLists.get(s.teamid) ?? [];
    if (opponents.length === 0) {
      owpMap.set(s.teamid, 0);
      continue;
    }

    let sum = 0;
    for (const oppId of opponents) {
      const oppRec = teamRecord.get(oppId);
      if (!oppRec || oppRec.games === 0) {
        sum += 0.5;
        continue;
      }
      // Exclude H2H games vs this team
      const matchup = h2h.get(oppId)?.get(s.teamid);
      const adjWins = oppRec.wins - (matchup?.wins ?? 0);
      const adjGames = oppRec.games - (matchup?.games ?? 0);
      if (adjGames === 0) {
        sum += 0.5;
      } else {
        sum += adjWins / adjGames;
      }
    }
    owpMap.set(s.teamid, sum / opponents.length);
  }

  // Compute OOWP for each team
  // OOWP(team) = avg of each opponent's OWP
  const oowpMap = new Map<number, number>();

  for (const s of standings) {
    const opponents = opponentLists.get(s.teamid) ?? [];
    if (opponents.length === 0) {
      oowpMap.set(s.teamid, 0);
      continue;
    }
    let sum = 0;
    for (const oppId of opponents) {
      sum += owpMap.get(oppId) ?? 0;
    }
    oowpMap.set(s.teamid, sum / opponents.length);
  }

  // Compute RPI and build rows
  return standings.map((s) => {
    const wpct = s.games > 0 ? (s.wltpct ?? 0) : 0;
    const owp = owpMap.get(s.teamid) ?? 0;
    const oowp = oowpMap.get(s.teamid) ?? 0;
    const rpi = 0.25 * wpct + 0.5 * owp + 0.25 * oowp;

    return {
      teamid: s.teamid,
      team: s.team,
      rank: s.rank_final,
      wpct,
      owp,
      oowp,
      rpi,
    };
  });
}

const METRIC_TOOLTIPS: Record<string, string> = {
  owp: "Opponent Win Percentage — average win% of opponents, excluding games against this team. Higher = stronger schedule.",
  oowp: "Opponents' Opponent Win Percentage — average OWP of opponents. Higher = opponents also faced tougher teams.",
  rpi: "Rating Percentage Index — 25% team win%, 50% OWP, 25% OOWP. Higher = stronger overall rating.",
};

function MetricInfo({ metric }: { metric: string }) {
  const tip = METRIC_TOOLTIPS[metric];
  if (!tip) return null;
  return (
    <span
      className="relative inline-flex ml-1 align-middle group/tip"
      onClick={(e) => e.stopPropagation()}
    >
      <Info className="w-3 h-3 text-muted-foreground/50 group-hover/tip:text-muted-foreground transition-colors" />
      <span
        className="pointer-events-none absolute top-full right-0 mt-1.5 w-56 px-2.5 py-1.5 text-[11px] leading-snug font-normal normal-case tracking-normal text-left text-foreground bg-surface border border-border shadow-lg opacity-0 group-hover/tip:opacity-100 transition-opacity z-50"
        style={{ fontFamily: "var(--font-body)" }}
      >
        {tip}
      </span>
    </span>
  );
}

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronDown className="inline w-3 h-3 opacity-0 group-hover:opacity-30" />;
  return sortDir === "asc"
    ? <ChevronUp className="inline w-3 h-3 text-primary" />
    : <ChevronDown className="inline w-3 h-3 text-primary" />;
}

function SosTable({
  rows,
  seasonId,
  sortKey,
  sortDir,
  onSort,
}: {
  rows: SosRow[];
  seasonId: string;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const thClass = "p-3 text-right label-section cursor-pointer select-none group";

  return (
    <div className="border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-surface">
            <th className="p-3 pl-4 text-left label-section cursor-pointer select-none group" onClick={() => onSort("rank")}>
              Rank <SortIcon col="rank" sortKey={sortKey} sortDir={sortDir} />
            </th>
            <th className="p-3 text-left label-section cursor-pointer select-none group" onClick={() => onSort("team")}>
              Team <SortIcon col="team" sortKey={sortKey} sortDir={sortDir} />
            </th>
            <th className={cn(thClass, "overflow-visible")} onClick={() => onSort("owp")}>
              OWP<MetricInfo metric="owp" /> <SortIcon col="owp" sortKey={sortKey} sortDir={sortDir} />
            </th>
            <th className={cn(thClass, "overflow-visible")} onClick={() => onSort("oowp")}>
              OOWP<MetricInfo metric="oowp" /> <SortIcon col="oowp" sortKey={sortKey} sortDir={sortDir} />
            </th>
            <th className={cn(thClass, "pr-4 overflow-visible")} onClick={() => onSort("rpi")}>
              RPI<MetricInfo metric="rpi" /> <SortIcon col="rpi" sortKey={sortKey} sortDir={sortDir} />
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.teamid}
              className="border-b border-border/50 last:border-0 hover:bg-elevated transition-colors duration-100"
            >
              <td className="p-3 pl-4 w-14">
                <span
                  className="tabular-nums leading-none text-muted-foreground"
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 800,
                    fontSize: "26px",
                    letterSpacing: "-0.03em",
                  }}
                >
                  {r.rank}
                </span>
              </td>
              <td className="p-3 font-semibold text-foreground" style={{ fontFamily: "var(--font-body)" }}>
                <Link
                  href={`/teams/${r.teamid}?returnTo=/seasons/${seasonId}/standings`}
                  className="hover:text-primary transition-colors"
                >
                  {r.team ?? "—"}
                </Link>
              </td>
              <td className="p-3 text-right tabular-nums" style={{ fontFamily: "var(--font-body)" }}>
                {formatPct(r.owp)}
              </td>
              <td className="p-3 text-right tabular-nums" style={{ fontFamily: "var(--font-body)" }}>
                {formatPct(r.oowp)}
              </td>
              <td className="p-3 pr-4 text-right tabular-nums font-medium" style={{ fontFamily: "var(--font-body)" }}>
                {formatPct(r.rpi)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SosCardList({
  rows,
  seasonId,
}: {
  rows: SosRow[];
  seasonId: string;
}) {
  return (
    <div className="border border-border divide-y divide-border/50">
      {rows.map((r) => (
        <div key={r.teamid} className="flex gap-3 px-3 py-3">
          {/* Rank */}
          <span
            className="tabular-nums leading-none shrink-0 w-8 text-center text-muted-foreground"
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              fontSize: "22px",
              letterSpacing: "-0.03em",
            }}
          >
            {r.rank}
          </span>

          {/* Details */}
          <div className="flex-1 min-w-0">
            {/* Row 1: Team + RPI */}
            <div className="flex items-baseline justify-between gap-2">
              <Link
                href={`/teams/${r.teamid}?returnTo=/seasons/${seasonId}/standings`}
                className="font-semibold text-sm text-foreground truncate hover:text-primary transition-colors"
                style={{ fontFamily: "var(--font-body)" }}
              >
                {r.team ?? "—"}
              </Link>
              <span className="tabular-nums text-sm font-medium shrink-0" style={{ fontFamily: "var(--font-body)" }}>
                {formatPct(r.rpi)}
              </span>
            </div>

            {/* Row 2: OWP / OOWP */}
            <div className="flex items-center gap-2.5 mt-0.5 text-xs text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
              <span className="tabular-nums">OWP {formatPct(r.owp)}</span>
              <span className="text-border">·</span>
              <span className="tabular-nums">OOWP {formatPct(r.oowp)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function SosView({
  standings,
  games,
  mode,
  seasonId,
}: {
  standings: StandingsRowInput[];
  games: SosGameRow[];
  mode: "full" | "remaining";
  seasonId: string;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("rpi");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sosRows = useMemo(
    () => computeSos(standings, games, mode),
    [standings, games, mode]
  );

  const sorted = useMemo(() => {
    const copy = [...sosRows];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "team") {
        cmp = (a.team ?? "").localeCompare(b.team ?? "");
      } else {
        cmp = (a[sortKey] as number) - (b[sortKey] as number);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [sosRows, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "team" || key === "rank" ? "asc" : "desc");
    }
  };

  // Check if remaining mode has any unplayed games
  const hasData = mode === "remaining"
    ? games.some(
        (g) =>
          g.game_type === "regular" &&
          (g.gamestatusid === null || !COMPLETED_STATUSES.has(g.gamestatusid))
      )
    : games.some(
        (g) =>
          g.game_type === "regular" &&
          g.gamestatusid !== null &&
          COMPLETED_STATUSES.has(g.gamestatusid)
      );

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border/60">
        <p className="text-sm font-medium text-foreground mb-1" style={{ fontFamily: "var(--font-display)", textTransform: "uppercase" }}>
          {mode === "remaining" ? "No Remaining Games" : "No Completed Games"}
        </p>
        <p className="text-xs text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
          {mode === "remaining"
            ? "All regular season games have been completed."
            : "Complete some regular season games to see strength of schedule."}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="hidden md:block">
        <SosTable rows={sorted} seasonId={seasonId} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
      </div>
      <div className="md:hidden">
        <SosCardList rows={sorted} seasonId={seasonId} />
      </div>
    </>
  );
}
