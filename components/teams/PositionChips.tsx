"use client";

import { cn } from "@/lib/utils";
import { POSITIONS } from "@/lib/positions";
import {
  describeTally,
  type ConsensusPriority,
  type PositionTally,
} from "@/lib/positionConsensus";

export type ChipEntry = { position: string; priority: ConsensusPriority };

/**
 * A "split" chip means the coaching staff disagrees — it is never resolved into
 * a priority behind the scenes. Distinguished by a dashed border and a "?"
 * glyph as well as color, so it doesn't rely on color alone.
 */
function chipClass(priority: ConsensusPriority): string {
  if (priority === "primary") return "border-primary bg-primary/15 text-primary";
  if (priority === "secondary") return "border-primary/40 bg-primary/5 text-primary/70";
  return "border-dashed border-primary/50 bg-transparent text-primary/60";
}

function chipSuffix(priority: ConsensusPriority): string {
  if (priority === "primary") return "";
  if (priority === "secondary") return "";
  return "?";
}

function defaultTitle(position: string, priority: ConsensusPriority): string {
  if (priority === "primary") return `${position} (Primary)`;
  if (priority === "secondary") return `${position} (Secondary)`;
  return `${position} — no consensus among coaches`;
}

/**
 * Read-only position chips. Renders in canonical position order, primaries
 * first, then splits, then secondaries.
 */
export default function PositionChips({
  entries,
  tallies,
  emptyText,
  className,
}: {
  entries: ChipEntry[];
  /** Consensus view only — turns each chip's tooltip into a vote breakdown. */
  tallies?: Partial<Record<string, PositionTally>>;
  emptyText?: string;
  className?: string;
}) {
  if (entries.length === 0) {
    return emptyText ? (
      <span className="text-[11px] text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
        {emptyText}
      </span>
    ) : null;
  }

  const order = POSITIONS as readonly string[];
  const rank: Record<ConsensusPriority, number> = { primary: 0, split: 1, secondary: 2 };
  const sorted = [...entries].sort(
    (a, b) =>
      rank[a.priority] - rank[b.priority] ||
      order.indexOf(a.position) - order.indexOf(b.position)
  );

  return (
    <div className={cn("flex flex-wrap gap-0.5", className)}>
      {sorted.map(({ position, priority }) => {
        const tally = tallies?.[position];
        return (
          <span
            key={`${priority}-${position}`}
            title={tally ? describeTally(position, tally, priority) : defaultTitle(position, priority)}
            className={cn(
              "inline-flex items-center justify-center w-7 h-5 text-[9px] font-bold tracking-[0.04em] border leading-none",
              chipClass(priority)
            )}
            style={{ fontFamily: "var(--font-display)" }}
          >
            {position}
            {chipSuffix(priority) && (
              <span className="ml-0.5 font-normal">{chipSuffix(priority)}</span>
            )}
          </span>
        );
      })}
    </div>
  );
}
