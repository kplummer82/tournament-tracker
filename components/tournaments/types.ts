// components/tournaments/types.ts
export type TabKey =
  | "overview"
  | "teams"
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
  statusid: number | null;
  visibilityid: number | null;
  // optional labels if your API returns them
  division?: string | null;
  tournamentstatus?: string | null;
  tournamentvisibility?: string | null;
};

export type LookupRow = { id: number | string; name: string };
