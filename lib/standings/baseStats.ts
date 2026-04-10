import type { GameRecord, SeasonConfig, TeamRecord, TeamStats } from "./types";

/**
 * Compute aggregate stats for every team from a set of game records.
 * Mirrors the per_team_union + season_results CTEs from the old DB function.
 *
 * Forfeit rules (matching DB function behavior):
 *   winnerSide = 'home' (away forfeited) → home wins 1, away wins 0
 *   winnerSide = 'away' (home forfeited) → away wins 1, home wins 0
 *   Forfeit run differential = ±forfeit_run_diff (from config)
 *   Forfeit runs scored/against = 0 for both teams
 *
 * Normal games:
 *   Run differential capped at ±maxrundiff
 *   Ties count as 0.5 wins each
 */
export function computeBaseStats(
  games: GameRecord[],
  teams: TeamRecord[],
  config: SeasonConfig
): Map<number, TeamStats> {
  const { maxrundiff, forfeit_run_diff } = config;

  // Initialize counters for every team (includes teams with zero games)
  const acc = new Map<
    number,
    { team: string; wins: number; games: number; scored: number; against: number; rundiff: number }
  >();
  for (const t of teams) {
    acc.set(t.teamid, { team: t.team, wins: 0, games: 0, scored: 0, against: 0, rundiff: 0 });
  }

  for (const g of games) {
    const home = acc.get(g.home);
    const away = acc.get(g.away);

    if (g.winnerSide === "home") {
      // Away team forfeited — home wins
      if (home) {
        home.wins += 1;
        home.games += 1;
        home.rundiff += forfeit_run_diff;
        // runs scored/against stay 0 for forfeits
      }
      if (away) {
        away.wins += 0;
        away.games += 1;
        away.rundiff -= forfeit_run_diff;
      }
    } else if (g.winnerSide === "away") {
      // Home team forfeited — away wins
      if (home) {
        home.wins += 0;
        home.games += 1;
        home.rundiff -= forfeit_run_diff;
      }
      if (away) {
        away.wins += 1;
        away.games += 1;
        away.rundiff += forfeit_run_diff;
      }
    } else {
      // Normal scored game
      const hs = g.homescore ?? 0;
      const as_ = g.awayscore ?? 0;
      const rawDiff = hs - as_;
      const cappedDiff = Math.max(-maxrundiff, Math.min(maxrundiff, rawDiff));

      const homeWins = hs > as_ ? 1 : hs === as_ ? 0.5 : 0;
      const awayWins = 1 - homeWins;

      if (home) {
        home.wins += homeWins;
        home.games += 1;
        home.scored += hs;
        home.against += as_;
        home.rundiff += cappedDiff;
      }
      if (away) {
        away.wins += awayWins;
        away.games += 1;
        away.scored += as_;
        away.against += hs;
        away.rundiff -= cappedDiff;
      }
    }
  }

  const result = new Map<number, TeamStats>();
  for (const [teamid, c] of acc) {
    const wltpct = c.games > 0 ? c.wins / c.games : 0;
    const avgRd = c.games > 0 ? c.rundiff / c.games : 0;
    const avgScored = c.games > 0 ? c.scored / c.games : 0;
    const avgAgainst = c.games > 0 ? c.against / c.games : 0;
    result.set(teamid, {
      teamid,
      team: c.team,
      wins: c.wins,
      games: c.games,
      wltpct,
      runsscored: c.scored,
      runsagainst: c.against,
      rundifferential: c.rundiff,
      average_run_differential: avgRd,
      average_runs_scored: avgScored,
      average_runs_against: avgAgainst,
    });
  }
  return result;
}
