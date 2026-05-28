// components/tournaments/types.ts
export type TabKey =
  | "overview"
  | "teams"
  | "venues"
  | "pool"
  | "standings"
  | "bracket"
  | "tiebreakers"
  | "scenarios";

export type Tournament = {
  tournamentid: number;
  name: string | null;
  city: string | null;
  state: string | null;
  year: number | null;
  maxrundiff: number | null;
  forfeit_run_diff: number | null;
  advances_per_group: number | null;
  num_pool_groups: number | null;
  divisionid: number | null;
  sportid: number | null;
  statusid: number | null;
  visibilityid: number | null;
  bats: { id: number; name: string }[];
  // optional labels if your API returns them
  division?: string | null;
  sport?: string | null;
  tournamentstatus?: string | null;
  tournamentvisibility?: string | null;
};

export type LookupRow = { id: number | string; name: string };
export type BatRow = { id: number; name: string; sport_id: number };
