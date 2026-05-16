import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";
import { computeStandings } from "@/lib/standings/ranker";
import type { GameRecord, TeamRecord, TiebreakerConfig, SeasonConfig } from "@/lib/standings/types";

// Pythagorean stats (pure, no DB)
type PytStats = { teamId: number; rsPer: number; raPer: number; pytWinPct: number };

function buildPytStats(games: GameRecord[], teams: TeamRecord[]): Map<number, PytStats> {
  const rs = new Map<number, number>();
  const ra = new Map<number, number>();
  const gp = new Map<number, number>();
  for (const t of teams) { rs.set(t.teamid, 0); ra.set(t.teamid, 0); gp.set(t.teamid, 0); }
  for (const g of games) {
    if (g.homescore === null || g.awayscore === null) continue;
    rs.set(g.home, (rs.get(g.home) ?? 0) + g.homescore);
    ra.set(g.home, (ra.get(g.home) ?? 0) + g.awayscore);
    gp.set(g.home, (gp.get(g.home) ?? 0) + 1);
    rs.set(g.away, (rs.get(g.away) ?? 0) + g.awayscore);
    ra.set(g.away, (ra.get(g.away) ?? 0) + g.homescore);
    gp.set(g.away, (gp.get(g.away) ?? 0) + 1);
  }
  const result = new Map<number, PytStats>();
  for (const t of teams) {
    const g = gp.get(t.teamid) ?? 0;
    const r = rs.get(t.teamid) ?? 0;
    const a = ra.get(t.teamid) ?? 0;
    const rsPer = g > 0 ? r / g : 0;
    const raPer = g > 0 ? a / g : 0;
    const pytWinPct = r * r + a * a > 0 ? (r * r) / (r * r + a * a) : 0.5;
    result.set(t.teamid, { teamId: t.teamid, rsPer, raPer, pytWinPct });
  }
  return result;
}

function log5(wA: number, wB: number): number {
  const den = wA + wB - 2 * wA * wB;
  if (den === 0) return 0.5;
  return (wA - wA * wB) / den;
}

function projectGame(
  home: number, away: number,
  statsMap: Map<number, PytStats>,
  leagueRA: number,
): { homescore: number; awayscore: number } {
  const hs = statsMap.get(home);
  const as_ = statsMap.get(away);
  const homeWinProb = log5(hs?.pytWinPct ?? 0.5, as_?.pytWinPct ?? 0.5);
  const homeWins = homeWinProb >= 0.5;
  const safe = leagueRA > 0 ? leagueRA : 1;
  let homescore = Math.max(0, Math.round((hs?.rsPer ?? 1) * ((as_?.raPer ?? safe) / safe)));
  let awayscore = Math.max(0, Math.round((as_?.rsPer ?? 1) * ((hs?.raPer ?? safe) / safe)));
  if (homeWins) { if (homescore <= awayscore) homescore = awayscore + 1; }
  else { if (awayscore <= homescore) awayscore = homescore + 1; }
  return { homescore, awayscore };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const raw = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  const seasonId = raw != null ? parseInt(String(raw), 10) : NaN;
  if (!Number.isFinite(seasonId)) return res.status(400).json({ error: "Invalid season id" });

  const rawDate = Array.isArray(req.query.asOfDate) ? req.query.asOfDate[0] : req.query.asOfDate;
  if (!rawDate || !/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    return res.status(400).json({ error: "asOfDate (YYYY-MM-DD) is required" });
  }
  const asOfDate = rawDate;

  try {
    const [teamRows, tbRows, configRows, completedRows, remainingRows] = await Promise.all([
      sql`
        SELECT st.team_id AS teamid, t.name AS team
        FROM season_teams st
        JOIN teams t ON t.teamid = st.team_id
        WHERE st.season_id = ${seasonId}
      `,
      sql`
        SELECT tb.tiebreaker AS code, tb."SortDirection" AS sort_direction, st.priority
        FROM season_tiebreakers st
        JOIN tiebreakers tb ON tb.id = st.tiebreaker_id
        WHERE st.season_id = ${seasonId}
        ORDER BY st.priority ASC
      `,
      sql`SELECT maxrundiff, COALESCE(forfeit_run_diff, 0) AS forfeit_run_diff FROM seasons WHERE id = ${seasonId}`,
      // Games completed on or before the cutoff (mirrors the existing standings as-of query)
      sql`
        SELECT id AS gameid, home, away, homescore, awayscore, gamestatusid
        FROM season_games
        WHERE season_id = ${seasonId}
          AND game_type = 'regular'
          AND gamestatusid IN (4, 6, 7)
          AND gamedate <= ${asOfDate}
      `,
      // Games NOT yet completed as of the cutoff (future or undated games to simulate)
      sql`
        SELECT home, away
        FROM season_games
        WHERE season_id = ${seasonId}
          AND game_type = 'regular'
          AND (gamestatusid IS NULL OR gamestatusid NOT IN (4, 6, 7))
          AND (gamedate IS NULL OR gamedate > ${asOfDate})
          AND home IS NOT NULL AND away IS NOT NULL
      `,
    ]);

    const teams = teamRows as TeamRecord[];
    const completedGames: GameRecord[] = (completedRows as {
      gameid: number; home: number; away: number;
      homescore: number | null; awayscore: number | null; gamestatusid: number;
    }[]).map((g) => ({
      gameid: Number(g.gameid),
      home: Number(g.home),
      away: Number(g.away),
      homescore: g.homescore != null ? Number(g.homescore) : null,
      awayscore: g.awayscore != null ? Number(g.awayscore) : null,
      winnerSide:
        g.gamestatusid === 6 ? "away"
        : g.gamestatusid === 7 ? "home"
        : null,
    }));

    const remaining = remainingRows as { home: number; away: number }[];

    const tiebreakers: TiebreakerConfig[] = (tbRows as {
      code: string; sort_direction: string; priority: number;
    }[]).map((r) => ({
      code: r.code,
      sortDirection: r.sort_direction === "ASC" ? "ASC" : "DESC",
      priority: Number(r.priority),
    }));

    const cfg = configRows[0] as { maxrundiff: number; forfeit_run_diff: number } | undefined;
    const config: SeasonConfig = {
      maxrundiff: Number(cfg?.maxrundiff ?? 10),
      forfeit_run_diff: Number(cfg?.forfeit_run_diff ?? 0),
    };

    const statsMap = buildPytStats(completedGames, teams);
    const teamsWithGames = [...statsMap.values()].filter((s) => s.rsPer > 0 || s.raPer > 0);
    const leagueRA = teamsWithGames.length > 0
      ? teamsWithGames.reduce((sum, s) => sum + s.raPer, 0) / teamsWithGames.length
      : 1;

    // Project remaining games
    const projectedGames: GameRecord[] = remaining.map((g, i) => {
      const { homescore, awayscore } = projectGame(Number(g.home), Number(g.away), statsMap, leagueRA);
      return {
        gameid: -(i + 1), // synthetic negative IDs to avoid conflicts
        home: Number(g.home),
        away: Number(g.away),
        homescore,
        awayscore,
        winnerSide: null,
      };
    });

    const allGames = [...completedGames, ...projectedGames];
    const rows = computeStandings(allGames, teams, tiebreakers, config);
    const standings = [...rows].sort((a, b) => a.rank_final - b.rank_final);

    return res.status(200).json({
      standings,
      projectedGamesCount: remaining.length,
      completedGamesCount: completedGames.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("[projected-standings]", err);
    return res.status(500).json({ error: message });
  }
}
