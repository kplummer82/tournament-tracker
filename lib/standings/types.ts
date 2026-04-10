export type GameRecord = {
  gameid: number;
  home: number;        // teamid
  away: number;        // teamid
  homescore: number | null;
  awayscore: number | null;
  winnerSide: "home" | "away" | null; // null = scored game; 'home'/'away' = forfeit winner
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
