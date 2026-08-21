import { POSITIONS } from "@/lib/positions";

/**
 * One defensive alignment: every one of the nine positions mapped to a player,
 * or to null for an unfilled slot. Anyone on the roster who isn't in here sits.
 *
 * This is the unit a saved team lineup stores and the unit the Defense tab
 * imports into a single inning. The tab's own state is a flat
 * `"{inning}-{position}" → roster_id` map covering every inning at once; slice
 * one inning out of it with `defenseForInning` to get back to this shape.
 */
export type DefenseAssignment = Record<string, number | null>;

/** All nine keys present, unknown keys dropped, non-positive ids nulled. */
export function normalizeDefense(partial: Record<string, unknown> | null | undefined): DefenseAssignment {
  const out: DefenseAssignment = {};
  for (const pos of POSITIONS) {
    const raw = partial?.[pos];
    out[pos] = typeof raw === "number" && Number.isInteger(raw) && raw > 0 ? raw : null;
  }
  return out;
}

/** Distinct players on the field in this alignment. */
export function assignedIds(defense: DefenseAssignment): Set<number> {
  const ids = new Set<number>();
  for (const pos of POSITIONS) {
    const id = defense[pos];
    if (id != null) ids.add(id);
  }
  return ids;
}

/** Players occupying more than one position — a lineup can't be saved with any. */
export function duplicateIds(defense: DefenseAssignment): Set<number> {
  const seen = new Set<number>();
  const dupes = new Set<number>();
  for (const pos of POSITIONS) {
    const id = defense[pos];
    if (id == null) continue;
    if (seen.has(id)) dupes.add(id);
    else seen.add(id);
  }
  return dupes;
}

/** How many of the nine slots are filled. */
export function filledCount(defense: DefenseAssignment): number {
  return POSITIONS.reduce((n, pos) => (defense[pos] != null ? n + 1 : n), 0);
}

/** Pull one inning out of the Defense tab's flat `"{inning}-{position}"` map. */
export function defenseForInning(
  lineup: Record<string, number>,
  inning: number
): DefenseAssignment {
  const out: DefenseAssignment = {};
  for (const pos of POSITIONS) {
    out[pos] = lineup[`${inning}-${pos}`] ?? null;
  }
  return out;
}
