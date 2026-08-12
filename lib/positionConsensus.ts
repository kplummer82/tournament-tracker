import { POSITIONS, type Position, type Priority } from "@/lib/positions";

/**
 * Position ratings are per-author: every coach/admin keeps their own set. The
 * consensus view rolls those sets up into one, and is deliberately explicit
 * about disagreement rather than inventing a winner — a split renders as its
 * own chip, never as a silently-picked priority.
 */
export type ConsensusPriority = Priority | "split";

/** How the raters of one player voted on one position. */
export type PositionTally = {
  primary: number;
  secondary: number;
  /** Raters of this player who did NOT give them this position at all. */
  none: number;
};

export type ConsensusEntry = { position: Position; priority: ConsensusPriority };

export type ConsensusResult = {
  /** Distinct authors with at least one rating for this player. */
  raters: number;
  positions: ConsensusEntry[];
  /** Only for positions that made the cut — powers the chip tooltips. */
  tallies: Partial<Record<Position, PositionTally>>;
};

/**
 * Majority wins, ties flagged. For each position, `raters` is the number of
 * coaches who rated this *player* at all (not just this position), so staying
 * silent on a position counts as a "no" vote.
 *
 *   assigned <  none                        → hidden (minority)
 *   assigned === none                       → split (divided on whether they play it)
 *   assigned >  none, primary > secondary   → primary
 *   assigned >  none, secondary > primary   → secondary
 *   assigned >  none, primary === secondary → split (agreed they play it, split on how well)
 */
export function computeConsensus(
  ratingsByAuthor: Map<string, Map<Position, Priority>>
): ConsensusResult {
  const raters = ratingsByAuthor.size;
  if (raters === 0) return { raters: 0, positions: [], tallies: {} };

  const positions: ConsensusEntry[] = [];
  const tallies: Partial<Record<Position, PositionTally>> = {};

  for (const position of POSITIONS) {
    let primary = 0;
    let secondary = 0;
    for (const ratings of ratingsByAuthor.values()) {
      const p = ratings.get(position);
      if (p === "primary") primary++;
      else if (p === "secondary") secondary++;
    }

    const assigned = primary + secondary;
    if (assigned === 0) continue;
    const none = raters - assigned;
    if (assigned < none) continue;

    let priority: ConsensusPriority;
    if (assigned === none) priority = "split";
    else if (primary > secondary) priority = "primary";
    else if (secondary > primary) priority = "secondary";
    else priority = "split";

    positions.push({ position, priority });
    tallies[position] = { primary, secondary, none };
  }

  return { raters, positions, tallies };
}

/** Human-readable breakdown for a chip's `title`, e.g. for a no-consensus tooltip. */
export function describeTally(
  position: string,
  tally: PositionTally,
  priority: ConsensusPriority
): string {
  const parts: string[] = [];
  if (tally.primary > 0) parts.push(`${tally.primary} primary`);
  if (tally.secondary > 0) parts.push(`${tally.secondary} secondary`);
  if (tally.none > 0) parts.push(`${tally.none} not assigned`);
  const raters = tally.primary + tally.secondary + tally.none;
  const lead = priority === "split" ? "no consensus" : `consensus ${priority}`;
  return `${position} — ${lead}: ${parts.join(" · ")} (${raters} ${raters === 1 ? "coach" : "coaches"})`;
}

/** Sort helper shared by the roster chips and the Defense-tab dropdown. */
export function positionOrder(position: string): number {
  const i = (POSITIONS as readonly string[]).indexOf(position);
  return i === -1 ? POSITIONS.length : i;
}

/** primary → split → secondary → unrated. Drives the Defense-tab player sort. */
export function priorityRank(priority: ConsensusPriority | null | undefined): number {
  if (priority === "primary") return 0;
  if (priority === "split") return 1;
  if (priority === "secondary") return 2;
  return 3;
}
