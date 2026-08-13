"use client";

import { cn } from "@/lib/utils";
import type { PositionAuthor } from "@/lib/rosterPositions";
import type { PositionSource } from "@/lib/hooks/usePositionSource";

const MINE = "mine";
const CONSENSUS = "consensus";
const AUTHOR_PREFIX = "author:";

export function authorLabel(author: PositionAuthor): string {
  return author.name || author.email || "Unnamed coach";
}

function toValue(source: PositionSource): string {
  return source.view === "author" ? `${AUTHOR_PREFIX}${source.authorId}` : source.view;
}

function fromValue(value: string): PositionSource {
  if (value === CONSENSUS) return { view: "consensus" };
  if (value.startsWith(AUTHOR_PREFIX)) {
    return { view: "author", authorId: value.slice(AUTHOR_PREFIX.length) };
  }
  return { view: "mine" };
}

/**
 * Switches a screen between the viewer's own position ratings, another coach's,
 * and the consensus roll-up. Used by the roster list and the game Defense tab.
 *
 * `canAuthor` is false for admins who can read but keep no set of their own —
 * they get the coaches and the consensus, but no "My assignments".
 */
export default function PositionSourcePicker({
  authors,
  value,
  onChange,
  canAuthor = true,
  className,
  id,
}: {
  authors: PositionAuthor[];
  value: PositionSource;
  onChange: (next: PositionSource) => void;
  canAuthor?: boolean;
  className?: string;
  id?: string;
}) {
  // Only hide my own row when "My assignments" is covering it. A read-only
  // admin who authored ratings before losing team_manager still has a set, and
  // with no "My assignments" option it would otherwise be unreachable.
  const others = canAuthor ? authors.filter((a) => !a.is_me) : authors;
  // Everyone with ratings counts as a voice, plus me once I've saved any.
  const raterCount = authors.filter((a) => a.rated_players > 0).length;

  return (
    <select
      id={id}
      aria-label="Position assignments to show"
      value={toValue(value)}
      onChange={(e) => onChange(fromValue(e.target.value))}
      className={cn(
        "px-2 py-1 text-[11px] bg-input-bg border border-border focus:outline-none focus:border-primary transition-colors duration-100",
        className
      )}
    >
      {canAuthor && <option value={MINE}>My assignments</option>}
      <option value={CONSENSUS}>
        {raterCount > 0
          ? `Consensus (${raterCount} ${raterCount === 1 ? "coach" : "coaches"})`
          : "Consensus"}
      </option>
      {others.length > 0 && (
        <optgroup label={canAuthor ? "Other coaches" : "Coaches"}>
          {others.map((a) => (
            <option key={a.user_id} value={`${AUTHOR_PREFIX}${a.user_id}`}>
              {a.is_me ? `${authorLabel(a)} (you)` : authorLabel(a)}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}
