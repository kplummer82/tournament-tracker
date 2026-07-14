import { POSITIONS } from "@/lib/positions";

export const OUTFIELD_POSITIONS = ["LF", "CF", "RF"] as const;

export type LineupRuleKey = "fair_sit" | "fair_outfield";
export type LineupRules = { fair_sit?: boolean; fair_outfield?: boolean };

export type RuleViolation = {
  rule: LineupRuleKey;
  inning: number;      // first complete inning where the rule breaks
  offenders: number[]; // roster_ids accruing their 2nd+ sit/OF appearance that inning
  waiting: number[];   // confirmed roster_ids still at 0 after that inning
};

/**
 * Validates the optional fairness rules over the defensive lineup.
 *
 * Only "complete" innings count: all 9 positions assigned with distinct
 * players. Incomplete innings are skipped so a half-filled inning doesn't
 * make everyone look benched while editing.
 */
export function validateLineupRules(opts: {
  lineup: Record<string, number>; // "inning-position" → roster_id
  confirmedIds: number[];
  activeInnings: number[];        // ascending
  rules: LineupRules;
}): RuleViolation[] {
  const { lineup, confirmedIds, activeInnings, rules } = opts;
  const confirmedSet = new Set(confirmedIds);

  const assignedIn = (inning: number): number[] => {
    const ids: number[] = [];
    for (const pos of POSITIONS) {
      const id = lineup[`${inning}-${pos}`];
      if (id != null) ids.push(id);
    }
    return ids;
  };

  const complete = activeInnings.filter((inn) => {
    const ids = assignedIn(inn);
    return ids.length === POSITIONS.length && new Set(ids).size === ids.length;
  });

  // Scan complete innings ascending; a violation is the first inning where a
  // member accrues a 2nd appearance while some confirmed player is still at 0.
  const scan = (rule: LineupRuleKey, membersOf: (inning: number) => number[]): RuleViolation | null => {
    const counts = new Map<number, number>();
    for (const id of confirmedIds) counts.set(id, 0);

    for (const inn of complete) {
      const members = membersOf(inn).filter((id) => confirmedSet.has(id));
      const memberSet = new Set(members);
      const offenders = members.filter((id) => (counts.get(id) ?? 0) >= 1);
      // Same-inning first-timers are no longer "waiting" — increments are simultaneous
      const waiting = confirmedIds.filter((id) => (counts.get(id) ?? 0) === 0 && !memberSet.has(id));
      if (offenders.length > 0 && waiting.length > 0) {
        return { rule, inning: inn, offenders, waiting };
      }
      for (const id of members) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return null;
  };

  const violations: RuleViolation[] = [];
  if (rules.fair_sit) {
    const v = scan("fair_sit", (inn) => {
      const onField = new Set(assignedIn(inn));
      return confirmedIds.filter((id) => !onField.has(id));
    });
    if (v) violations.push(v);
  }
  if (rules.fair_outfield) {
    const v = scan("fair_outfield", (inn) =>
      OUTFIELD_POSITIONS.map((pos) => lineup[`${inn}-${pos}`]).filter((id): id is number => id != null)
    );
    if (v) violations.push(v);
  }
  return violations;
}
