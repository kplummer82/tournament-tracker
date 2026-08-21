import type { ConsensusPriority } from "@/lib/positionConsensus";

/**
 * The minimum a screen needs to render a player in a lineup cell.
 *
 * Deliberately narrower than either source: a game's `ConfirmationRow` (which
 * adds `status`) and a team's roster row (which adds a dozen roster fields) are
 * both structurally assignable to it, so neither type has to change to share the
 * combobox between the Defense tab and the team lineup designer.
 */
export type LineupPlayer = {
  roster_id: number;
  first_name: string;
  last_name: string | null;
  jersey_number: number | null;
  /** Position abbreviation → priority, from whichever position source is active. */
  positionPriorities?: Record<string, ConsensusPriority>;
};

/** e.g. `#12 Jack Smith`, or `Jack` for a roster entry with no surname. */
export function playerLabel(p: LineupPlayer): string {
  const name = [p.first_name, p.last_name].filter(Boolean).join(" ");
  return p.jersey_number != null ? `#${p.jersey_number} ${name}` : name;
}
