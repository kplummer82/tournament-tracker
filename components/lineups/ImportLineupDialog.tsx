"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { POSITIONS } from "@/lib/positions";
import { playerLabel, type LineupPlayer } from "@/lib/lineups/player";
import { filledCount, type DefenseAssignment } from "@/lib/lineups/defense";
import type { LineupTemplate } from "@/lib/lineupTemplates";

/**
 * Import one of the team's saved defensive alignments into a game.
 *
 * The coach picks a lineup and then which innings to apply it to — a pitching
 * stint usually spans two or three, so applying one at a time would mean
 * repeating the whole interaction. The preview is the point of the dialog: it
 * shows, before anything is applied, which of the lineup's players can't
 * actually take the field in this game.
 */

type SlotState = "ok" | "unconfirmed" | "gone" | "empty";

export default function ImportLineupDialog({
  open,
  onOpenChange,
  teamId,
  activeInnings,
  players,
  confirmedIds,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: number;
  activeInnings: number[];
  /** Everyone on the roster for this game, confirmed or not — so the warning can name them. */
  players: LineupPlayer[];
  confirmedIds: Set<number>;
  onApply: (defense: DefenseAssignment, innings: number[]) => void;
}) {
  const [templates, setTemplates] = useState<LineupTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [innings, setInnings] = useState<Set<number>>(new Set());

  // Fetched on open, not on tab mount — most visits to the Defense tab never
  // open this.
  useEffect(() => {
    if (!open) return;
    setSelectedId(null);
    setInnings(new Set());
    setError(null);
    setLoading(true);
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/teams/${teamId}/lineup-templates`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        const list: LineupTemplate[] = Array.isArray(data.templates) ? data.templates : [];
        setTemplates(list);
        if (list.length > 0) setSelectedId(list[0].id);
      } catch {
        if (!cancelled) setError("Couldn't load saved lineups.");
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, teamId]);

  const selected = templates.find((t) => t.id === selectedId) ?? null;

  const nameOf = (id: number) => {
    const p = players.find((x) => x.roster_id === id);
    return p ? playerLabel(p) : `#${id}`;
  };

  const slotState = (id: number | null): SlotState => {
    if (id == null) return "empty";
    if (!confirmedIds.has(id)) return "unconfirmed";
    return "ok";
  };

  // Players the lineup names who can't take the field: either not confirmed for
  // this game, or no longer on the roster at all.
  const unavailable = useMemo(() => {
    if (!selected) return { unconfirmed: [] as number[], gone: [] as number[] };
    const unconfirmed: number[] = [];
    for (const pos of POSITIONS) {
      const id = selected.defense[pos];
      if (id != null && !confirmedIds.has(id)) unconfirmed.push(id);
    }
    return { unconfirmed, gone: selected.missing_roster_ids };
  }, [selected, confirmedIds]);

  const toggleInning = (inn: number) => {
    setInnings((prev) => {
      const next = new Set(prev);
      if (next.has(inn)) next.delete(inn);
      else next.add(inn);
      return next;
    });
  };

  const canApply = selected != null && innings.size > 0;

  const apply = () => {
    if (!selected) return;
    onApply(selected.defense, [...innings].sort((a, b) => a - b));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import a saved lineup</DialogTitle>
          <DialogDescription>
            Applying a lineup replaces the whole inning — positions it leaves empty are cleared.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
        ) : error ? (
          <p className="text-sm text-destructive py-6 text-center">{error}</p>
        ) : templates.length === 0 ? (
          <div className="py-6 text-center space-y-2">
            <p className="text-sm text-muted-foreground">No saved lineups for this team yet.</p>
            <Link
              href={`/teams/${teamId}?tab=lineups`}
              className="text-xs uppercase tracking-[0.08em] font-semibold text-primary hover:underline"
            >
              Build one
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              {/* Picker */}
              <div className="border border-border max-h-64 overflow-y-auto">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedId(t.id)}
                    className={cn(
                      "w-full text-left px-3 py-2 border-b border-border/40 last:border-0 transition-colors",
                      t.id === selectedId ? "bg-primary/10" : "hover:bg-elevated/50"
                    )}
                  >
                    <span
                      className={cn(
                        "block text-sm",
                        t.id === selectedId ? "text-foreground font-medium" : "text-muted-foreground"
                      )}
                    >
                      {t.name}
                    </span>
                    <span className="block text-[10px] text-muted-foreground tabular-nums">
                      {filledCount(t.defense)}/{POSITIONS.length} set
                    </span>
                  </button>
                ))}
              </div>

              {/* Preview */}
              <div className="border border-border p-2">
                {selected ? (
                  <table className="w-full text-xs">
                    <tbody>
                      {POSITIONS.map((pos) => {
                        const id = selected.defense[pos];
                        const state = slotState(id);
                        return (
                          <tr key={pos}>
                            <td
                              className="py-0.5 pr-2 font-bold text-muted-foreground w-8"
                              style={{ fontFamily: "var(--font-display)" }}
                            >
                              {pos}
                            </td>
                            <td
                              className={cn(
                                "py-0.5",
                                state === "ok" && "text-foreground",
                                state === "unconfirmed" && "text-warning",
                                state === "empty" && "text-muted-foreground"
                              )}
                            >
                              {id == null ? (
                                "—"
                              ) : (
                                <>
                                  {nameOf(id)}
                                  {state === "unconfirmed" && (
                                    <span className="text-[10px]"> · not confirmed</span>
                                  )}
                                </>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-xs text-muted-foreground">Pick a lineup.</p>
                )}
              </div>
            </div>

            {/* Innings */}
            <div>
              <div className="flex items-center gap-3 mb-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  Apply to innings
                </p>
                <button
                  type="button"
                  onClick={() => setInnings(new Set(activeInnings))}
                  className="text-[10px] uppercase tracking-[0.06em] text-primary hover:underline"
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setInnings(new Set())}
                  className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground hover:underline"
                >
                  None
                </button>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {activeInnings.map((inn) => (
                  <button
                    key={inn}
                    type="button"
                    aria-pressed={innings.has(inn)}
                    onClick={() => toggleInning(inn)}
                    className={cn(
                      "h-7 w-7 text-[11px] font-bold border transition-colors",
                      innings.has(inn)
                        ? "bg-primary/15 text-primary border-primary/40"
                        : "text-muted-foreground border-border hover:border-foreground/30"
                    )}
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {inn}
                  </button>
                ))}
              </div>
            </div>

            {selected && (unavailable.unconfirmed.length > 0 || unavailable.gone.length > 0) && (
              <div className="border border-warning/40 bg-warning/10 px-3 py-2">
                <p className="text-[11px] text-warning">
                  {[
                    unavailable.unconfirmed.length > 0 &&
                      `${unavailable.unconfirmed.map(nameOf).join(", ")} ${unavailable.unconfirmed.length === 1 ? "isn't" : "aren't"} confirmed for this game`,
                    unavailable.gone.length > 0 &&
                      `${unavailable.gone.length} ${unavailable.gone.length === 1 ? "player is" : "players are"} no longer on the roster`,
                  ]
                    .filter(Boolean)
                    .join("; ")}
                  . Those spots will be left empty.
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.07em] border border-border text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={apply}
            disabled={!canApply}
            className={cn(
              "px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.07em] border transition-colors",
              canApply
                ? "border-primary text-primary hover:bg-primary/10"
                : "border-border text-muted-foreground cursor-not-allowed opacity-50"
            )}
          >
            Apply
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
