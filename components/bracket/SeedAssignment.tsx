import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BracketStructure } from "./types";

type TeamOpt = { id: number; name: string };

type SeedAssignmentProps = {
  structure: BracketStructure | null;
  /** Current assignments: seed index (1..n) -> team id */
  assignments: Record<number, number>;
  onChange: (assignments: Record<number, number>) => void;
  teams: TeamOpt[];
};

export default function SeedAssignment({
  structure,
  assignments,
  onChange,
  teams,
}: SeedAssignmentProps) {
  const numTeams = structure?.numTeams ?? 0;
  if (numTeams < 1) return null;

  const NONE_VALUE = "__none__";

  const handleSeed = (seedIndex: number, value: string) => {
    const next = { ...assignments };
    if (value === NONE_VALUE) {
      delete next[seedIndex];
    } else {
      next[seedIndex] = Number(value);
    }
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        {Array.from({ length: numTeams }, (_, i) => i + 1).map((seedIndex) => (
          <div key={seedIndex} className="flex items-center gap-2">
            <span className="w-16 shrink-0 text-sm text-muted-foreground">
              Seed {seedIndex}
            </span>
            <Select
              value={assignments[seedIndex] != null ? String(assignments[seedIndex]) : NONE_VALUE}
              onValueChange={(v) => handleSeed(seedIndex, v)}
            >
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Select team" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>— None —</SelectItem>
                {teams.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
    </div>
  );
}

export function seedLabelsFromAssignments(
  assignments: Record<number, number>,
  teams: TeamOpt[]
): Record<number, string> {
  const teamIdToName = Object.fromEntries(teams.map((t) => [t.id, t.name]));
  const out: Record<number, string> = {};
  for (const [seedStr, teamId] of Object.entries(assignments)) {
    const seed = parseInt(seedStr, 10);
    if (Number.isFinite(seed) && teamIdToName[teamId]) {
      out[seed] = teamIdToName[teamId];
    }
  }
  return out;
}
