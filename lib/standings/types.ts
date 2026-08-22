export type GameRecord = {
  gameid: number;
  home: number;        // teamid
  away: number;        // teamid
  homescore: number | null;
  awayscore: number | null;
  winnerSide: "home" | "away" | null; // null = scored game; 'home'/'away' = forfeit winner
  // Optional timestamp fields for tiebreakers that need chronological ordering
  // (e.g. last_game_actual_rundiff). Tournaments use gamedate + gametime; seasons
  // may only populate gamedate. May be omitted when not needed.
  gamedate?: string | null;
  gametime?: string | null;
};

export type TeamRecord = { teamid: number; team: string };

export type TiebreakerConfig = {
  code: string;
  sortDirection: "ASC" | "DESC";
  priority: number;
};

export type SeasonConfig = {
  maxrundiff: number;
  forfeit_run_diff: number;
};

export type TeamStats = {
  teamid: number;
  team: string;
  wins: number;   // win_pts (1 per win, 0.5 per tie) — used for PCT/tiebreakers
  losses: number; // integer loss count — display only
  ties: number;   // integer tie count — display only
  games: number;
  wltpct: number;
  runsscored: number;
  runsagainst: number;
  rundifferential: number;
  average_run_differential: number;
  average_runs_scored: number;
  average_runs_against: number;
};

export type StandingsRow = TeamStats & {
  rank_final: number;
  lexi_key: number;
  details: Record<string, number | null>;
};

/**
 * How actionable a coin toss is right now.
 *
 *   none        — nothing to show: no games settled yet, or this season/tournament
 *                 doesn't use the coin_toss tiebreaker at all.
 *   provisional — ties exist but games remain (or you're viewing a historical
 *                 snapshot), so a real coin toss can't be recorded yet.
 *   final       — every game is settled; ties are ready to be resolved.
 */
export type CoinTossPhase = "none" | "provisional" | "final";
