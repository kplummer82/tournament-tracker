/**
 * The three places a team's games live — scrimmages, league (season) games and
 * tournament games — plus the pure math for rolling any combination of them up
 * into a W-L-T record and the runs-scored/allowed that feed prediction.
 *
 * Deliberately free of `@/lib/db` imports so both API routes and browser code
 * can use it. The query that produces the aggregates lives in `./gameHistory`.
 */

export type GameSource = "scrimmage" | "season" | "tournament";

export const ALL_GAME_SOURCES: GameSource[] = ["scrimmage", "season", "tournament"];

/** Labels for the source toggles. "League" reads better than "Season" on screen. */
export const GAME_SOURCE_LABELS: Record<GameSource, string> = {
  scrimmage: "Scrimmages",
  season: "League",
  tournament: "Tournaments",
};

export type SourceAggregate = {
  team_id: number;
  source: GameSource;
  w: number;
  l: number;
  t: number;
  games: number;
  runs_scored: number;
  runs_against: number;
};

export type TeamWLT = { w: number; l: number; t: number };

export type TeamRunStats = {
  gamesPlayed: number;
  runsScored: number;
  runsAgainst: number;
  rsPer: number;
  raPer: number;
  pytWinPct: number;
};

/** Combined W-L-T over the selected sources. */
export function sumRecord(aggregates: SourceAggregate[], sources: GameSource[]): TeamWLT {
  const wanted = new Set(sources);
  const total: TeamWLT = { w: 0, l: 0, t: 0 };
  for (const a of aggregates) {
    if (!wanted.has(a.source)) continue;
    total.w += a.w;
    total.l += a.l;
    total.t += a.t;
  }
  return total;
}

/**
 * Combined runs scored/allowed over the selected sources, plus the Pythagorean
 * win expectation RS² / (RS² + RA²) those totals imply. A team with no history
 * lands at .500 so it projects as an average opponent rather than a guaranteed
 * loser.
 */
export function sumRunStats(aggregates: SourceAggregate[], sources: GameSource[]): TeamRunStats {
  const wanted = new Set(sources);
  let gamesPlayed = 0;
  let runsScored = 0;
  let runsAgainst = 0;
  for (const a of aggregates) {
    if (!wanted.has(a.source)) continue;
    gamesPlayed += a.games;
    runsScored += a.runs_scored;
    runsAgainst += a.runs_against;
  }
  const rs2 = runsScored * runsScored;
  const ra2 = runsAgainst * runsAgainst;
  return {
    gamesPlayed,
    runsScored,
    runsAgainst,
    rsPer: gamesPlayed > 0 ? runsScored / gamesPlayed : 0,
    raPer: gamesPlayed > 0 ? runsAgainst / gamesPlayed : 0,
    pytWinPct: rs2 + ra2 > 0 ? rs2 / (rs2 + ra2) : 0.5,
  };
}

/** `12-4-1`, or an em dash when the team has no completed games. */
export function formatRecord(record: TeamWLT | undefined): string {
  if (!record || record.w + record.l + record.t === 0) return "—";
  return `${record.w}-${record.l}-${record.t}`;
}

/** Serialize for a `?sources=` query string. */
export function gameSourcesQuery(sources: GameSource[]): string {
  return sources.join(",");
}

/**
 * Parse a `?sources=scrimmage,season` value. Anything unrecognised or missing
 * falls back to all three, which is also the UI default.
 */
export function parseGameSources(raw: string | string[] | undefined): GameSource[] {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return [...ALL_GAME_SOURCES];
  const parsed = value
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is GameSource => (ALL_GAME_SOURCES as string[]).includes(s));
  return parsed.length > 0 ? parsed : [...ALL_GAME_SOURCES];
}
