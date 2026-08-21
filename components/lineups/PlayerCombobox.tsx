import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { priorityRank, type ConsensusPriority } from "@/lib/positionConsensus";
import { playerLabel, type LineupPlayer } from "@/lib/lineups/player";

/**
 * The player picker used by every lineup grid — the per-inning Defense tab on a
 * game and the team's reusable lineup designer. Typeahead with full keyboard
 * navigation; options are ordered by how well the player fits this position
 * according to whichever position-rating source is active.
 */

/** primary → split → secondary → unrated, so the best fits surface first. */
function priorityOrder(p: LineupPlayer, position: string): number {
  return priorityRank(p.positionPriorities?.[position]);
}

function priorityBadge(priority: ConsensusPriority): string {
  if (priority === "primary") return "1°";
  if (priority === "secondary") return "2°";
  return "?";
}

export default function PlayerCombobox({
  players,
  position,
  value,
  usedIds,
  isDuplicate,
  cellKey,
  ariaLabel,
  onTab,
  onChange,
}: {
  players: LineupPlayer[];
  position: string;
  value: number | null;
  usedIds: Set<number>;
  isDuplicate: boolean;
  cellKey: string;
  /** Accessible name for the input — callers pass the position abbreviation. */
  ariaLabel?: string;
  onTab: (shiftKey: boolean) => void;
  onChange: (id: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hlIdx, setHlIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedPlayer = value != null ? players.find((p) => p.roster_id === value) : null;
  const displayText = selectedPlayer ? playerLabel(selectedPlayer) : "";

  const filtered = players
    .filter((p) => {
      if (!query) return true;
      const q = query.toLowerCase();
      const full = `${p.first_name} ${p.last_name ?? ""}`.toLowerCase();
      const jersey = p.jersey_number != null ? `#${p.jersey_number}` : "";
      return (
        full.includes(q) ||
        jersey.startsWith(q) ||
        p.first_name.toLowerCase().startsWith(q) ||
        (p.last_name ?? "").toLowerCase().startsWith(q)
      );
    })
    .sort((a, b) => {
      const diff = priorityOrder(a, position) - priorityOrder(b, position);
      if (diff !== 0) return diff;
      return a.first_name.localeCompare(b.first_name);
    });

  const selectPlayer = (id: number | null) => {
    onChange(id);
    setOpen(false);
    setQuery("");
  };

  const handleFocus = () => {
    setOpen(true);
    setQuery("");
    setHlIdx(0);
    // Select all text on focus so typing replaces it
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const handleBlur = (e: React.FocusEvent) => {
    // Don't close if focus moves within the container (clicking dropdown items)
    if (containerRef.current?.contains(e.relatedTarget as Node)) return;
    setOpen(false);
    setQuery("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        e.preventDefault();
        setOpen(true);
        setHlIdx(0);
      } else if (e.key === "Tab") {
        e.preventDefault();
        onTab(e.shiftKey);
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHlIdx((prev) => Math.min(prev + 1, filtered.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setHlIdx((prev) => Math.max(prev - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (filtered.length > 0 && hlIdx < filtered.length) {
          selectPlayer(filtered[hlIdx].roster_id);
        }
        break;
      case "Escape":
        e.preventDefault();
        setOpen(false);
        setQuery("");
        break;
      case "Tab":
        if (filtered.length > 0 && hlIdx < filtered.length && query) {
          onChange(filtered[hlIdx].roster_id);
        }
        setOpen(false);
        setQuery("");
        e.preventDefault();
        onTab(e.shiftKey);
        break;
      case "Backspace":
        if (!query && value != null) {
          e.preventDefault();
          selectPlayer(null);
        }
        break;
    }
  };

  // Reset highlight when filter changes
  useEffect(() => { setHlIdx(0); }, [query]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (!open) return;
    const el = containerRef.current?.querySelector(`[data-hl="true"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [hlIdx, open]);

  return (
    <div ref={containerRef} data-cell={cellKey} className="relative">
      <input
        ref={inputRef}
        type="text"
        aria-label={ariaLabel}
        value={open ? query : displayText}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder="—"
        className={cn(
          "w-full px-1.5 py-1 text-xs border bg-transparent",
          "focus:outline-none transition-colors",
          isDuplicate
            ? "border-destructive text-destructive focus:border-destructive bg-transparent"
            : [
                "border-border focus:border-primary",
                value != null ? "text-foreground" : "text-muted-foreground",
              ]
        )}
      />
      {open && (
        <div className="absolute z-20 left-0 right-0 top-full mt-0.5 bg-card border border-border shadow-lg max-h-40 overflow-y-auto">
          {value != null && (
            <button
              type="button"
              tabIndex={-1}
              onMouseDown={(e) => { e.preventDefault(); selectPlayer(null); }}
              className="w-full text-left px-2 py-1 text-xs text-muted-foreground hover:bg-elevated/50 border-b border-border/40"
            >
              — Unassigned
            </button>
          )}
          {filtered.length === 0 ? (
            <div className="px-2 py-1.5 text-[10px] text-muted-foreground">No match</div>
          ) : (
            filtered.map((p, i) => {
              const isUsed = usedIds.has(p.roster_id) && p.roster_id !== value;
              const isHl = i === hlIdx;
              return (
                <button
                  key={p.roster_id}
                  type="button"
                  tabIndex={-1}
                  data-hl={isHl ? "true" : undefined}
                  onMouseDown={(e) => {
                    e.preventDefault(); // prevent blur
                    selectPlayer(p.roster_id);
                  }}
                  onMouseEnter={() => setHlIdx(i)}
                  className={cn(
                    "w-full text-left px-2 py-1 text-xs transition-colors flex items-center justify-between gap-2",
                    isHl && "bg-primary/25 text-foreground",
                    !isHl && "hover:bg-elevated/50",
                    isUsed && "line-through text-muted-foreground"
                  )}
                >
                  <span>{playerLabel(p)}</span>
                  {p.positionPriorities?.[position] && (
                    <span
                      title={
                        p.positionPriorities[position] === "split"
                          ? `${position} — coaches disagree on this player`
                          : undefined
                      }
                      className={cn(
                        "shrink-0 text-[9px] font-semibold tracking-[0.04em] tabular-nums",
                        p.positionPriorities[position] === "primary" ? "text-primary" : "text-primary/50"
                      )}
                      style={{ fontFamily: "var(--font-body)" }}
                    >
                      {priorityBadge(p.positionPriorities[position])}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
