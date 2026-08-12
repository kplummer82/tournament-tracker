"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { POSITIONS, emptyPositionMap, type Position, type Priority, type PositionMap } from "@/lib/positions";
import type { PositionTally } from "@/lib/positionConsensus";
import type { PositionAuthor, PositionEntry } from "@/lib/rosterPositions";
import type { PlayerPositionsAllResponse } from "@/pages/api/teams/[teamId]/roster/[rosterId]/positions";
import PositionChips, { type ChipEntry } from "./PositionChips";
import { authorLabel } from "./PositionSourcePicker";

const POS_LABELS: Record<Position, string> = {
  P: "Pitcher", C: "Catcher", "1B": "First Base", "2B": "Second Base",
  "3B": "Third Base", SS: "Shortstop", LF: "Left Field", CF: "Center Field",
  RF: "Right Field",
};

function cycleNext(current: Priority | null): Priority | null {
  if (current === null) return "primary";
  if (current === "primary") return "secondary";
  return null;
}

function toMap(entries: PositionEntry[]): PositionMap {
  const map = emptyPositionMap();
  for (const { position, priority } of entries) {
    // "split" only ever comes back on the consensus set, never a single author's.
    if (position in map && (priority === "primary" || priority === "secondary")) {
      map[position as Position] = priority;
    }
  }
  return map;
}

function toEntries(map: PositionMap): { position: Position; priority: Priority }[] {
  return (Object.entries(map) as [Position, Priority | null][])
    .filter(([, p]) => p !== null)
    .map(([position, priority]) => ({ position, priority: priority as Priority }));
}

function PositionTile({
  pos,
  priority,
  saving,
  onClick,
}: {
  pos: Position;
  priority: Priority | null;
  saving: boolean;
  onClick: () => void;
}) {
  const isPrimary = priority === "primary";
  const isSecondary = priority === "secondary";
  const isAssigned = isPrimary || isSecondary;

  return (
    <button
      type="button"
      title={POS_LABELS[pos]}
      aria-label={`${POS_LABELS[pos]}: ${priority ?? "unassigned"}`}
      onClick={onClick}
      disabled={saving}
      className={cn(
        "relative flex flex-col items-center justify-center w-12 h-12 border transition-all duration-100 select-none cursor-pointer",
        isPrimary && "bg-primary/15 border-primary text-primary",
        isSecondary && "bg-primary/5 border-primary/40 text-primary/70",
        !isAssigned && "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
        saving && "opacity-60"
      )}
    >
      <span
        className="text-[11px] font-bold tracking-[0.06em] leading-none"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {pos}
      </span>

      {isAssigned && (
        <span
          className={cn(
            "mt-0.5 text-[9px] font-semibold leading-none tracking-[0.05em]",
            isPrimary ? "text-primary" : "text-primary/60"
          )}
          style={{ fontFamily: "var(--font-body)" }}
        >
          {isPrimary ? "1°" : "2°"}
        </span>
      )}

      {isAssigned && (
        <span
          className={cn(
            "absolute top-1 right-1 w-1.5 h-1.5 rounded-full",
            isPrimary ? "bg-primary" : "border border-primary/60"
          )}
        />
      )}
    </button>
  );
}

/** One read-only row in the "What other coaches say" comparison strip. */
function ComparisonRow({
  label,
  sublabel,
  entries,
  tallies,
  onCopy,
  copying,
}: {
  label: string;
  sublabel?: string;
  entries: ChipEntry[];
  tallies?: Partial<Record<string, PositionTally>>;
  onCopy?: () => void;
  copying: boolean;
}) {
  return (
    <div className="flex items-center gap-3 py-2 border-t border-border/60 flex-wrap">
      <div className="min-w-[140px]">
        <p className="text-xs font-medium" style={{ fontFamily: "var(--font-body)" }}>{label}</p>
        {sublabel && (
          <p className="text-[10px] text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
            {sublabel}
          </p>
        )}
      </div>
      <div className="flex-1 min-w-[120px]">
        <PositionChips entries={entries} tallies={tallies} emptyText="No positions assigned." />
      </div>
      {onCopy && entries.length > 0 && (
        <button
          type="button"
          onClick={onCopy}
          disabled={copying}
          className="px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.07em] border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors duration-100 disabled:opacity-50"
          style={{ fontFamily: "var(--font-body)" }}
        >
          Copy to mine
        </button>
      )}
    </div>
  );
}

/**
 * Every coach keeps their own position ratings for a player. The tile grid
 * always edits the signed-in coach's set; other coaches' sets and the consensus
 * roll-up are shown read-only underneath.
 *
 * Only mounted for users with team access — these are staff-only evaluations.
 */
export default function PlayerPositionsCard({
  rosterId,
  teamId,
}: {
  rosterId: number;
  teamId: number;
}) {
  const [posMap, setPosMap] = useState<PositionMap>(emptyPositionMap);
  const [authors, setAuthors] = useState<PositionAuthor[]>([]);
  const [byAuthor, setByAuthor] = useState<Record<string, PositionEntry[]>>({});
  const [consensus, setConsensus] = useState<PlayerPositionsAllResponse["consensus"] | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  // Admins can read every coach's ratings but keep no set of their own; only a
  // coach/manager of this team may author. The API is the source of truth.
  const [canAuthor, setCanAuthor] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyAll = useCallback((data: PlayerPositionsAllResponse) => {
    const me = data.authors.find((a) => a.is_me) ?? null;
    setMeId(me?.user_id ?? null);
    setCanAuthor(!!data.canAuthor);
    setAuthors(data.authors);
    setByAuthor(data.byAuthor);
    setConsensus(data.consensus);
    if (me) setPosMap(toMap(data.byAuthor[me.user_id] ?? []));
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/teams/${teamId}/roster/${rosterId}/positions?view=all`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      applyAll((await res.json()) as PlayerPositionsAllResponse);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load positions");
    } finally {
      setLoading(false);
    }
  }, [teamId, rosterId, applyAll]);

  useEffect(() => { load(); }, [load]);

  /** Persist my set. Optimistic — `nextMap` is already on screen. */
  const save = useCallback(
    async (nextMap: PositionMap, prevMap: PositionMap) => {
      setSaving(true);
      setError(null);
      try {
        const res = await fetch(`/api/teams/${teamId}/roster/${rosterId}/positions`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ positions: toEntries(nextMap) }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        // Re-read everything so the consensus row reflects the new vote.
        await load();
      } catch (e) {
        setPosMap(prevMap);
        setError(e instanceof Error ? e.message : "Failed to save");
      } finally {
        setSaving(false);
      }
    },
    [teamId, rosterId, load]
  );

  const handleToggle = useCallback(
    (pos: Position) => {
      if (saving) return;
      const prevMap = { ...posMap };
      const nextMap = { ...posMap, [pos]: cycleNext(posMap[pos]) };
      setPosMap(nextMap);
      void save(nextMap, prevMap);
    },
    [saving, posMap, save]
  );

  const handleCopy = useCallback(
    (entries: PositionEntry[], sourceLabel: string) => {
      if (saving) return;
      const hasOwn = POSITIONS.some((p) => posMap[p] !== null);
      if (hasOwn && !window.confirm(`Replace your position assignments with ${sourceLabel}?`)) return;
      const prevMap = { ...posMap };
      const nextMap = toMap(entries);
      setPosMap(nextMap);
      void save(nextMap, prevMap);
    },
    [saving, posMap, save]
  );

  const primaryCount = POSITIONS.filter((p) => posMap[p] === "primary").length;
  const secondaryCount = POSITIONS.filter((p) => posMap[p] === "secondary").length;
  const assignedCount = primaryCount + secondaryCount;

  // For a coach, "others" excludes their own row (that's the grid above). For a
  // read-only admin there is no grid, so every rater is listed.
  const others = authors.filter((a) => (byAuthor[a.user_id]?.length ?? 0) > 0 && !(canAuthor && a.is_me));
  const showConsensus = (consensus?.raters ?? 0) > 1;

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
          <div>
            <h2
              className="uppercase"
              style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "18px", letterSpacing: "-0.01em" }}
            >
              {canAuthor ? "Positions — My Assignments" : "Positions"}
            </h2>
            <p className="text-[11px] text-muted-foreground mt-0.5" style={{ fontFamily: "var(--font-body)" }}>
              {!canAuthor ? (
                "Each coach keeps their own. Only this team's coaches and managers can change them."
              ) : !loading && assignedCount > 0 ? (
                <>
                  {primaryCount > 0 && `${primaryCount} primary`}
                  {primaryCount > 0 && secondaryCount > 0 && " · "}
                  {secondaryCount > 0 && `${secondaryCount} secondary`}
                </>
              ) : (
                "Only you can change these. Other coaches keep their own."
              )}
            </p>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-primary" />
              Primary
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-full border border-primary/60" />
              Secondary
            </span>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>Loading…</p>
        ) : (
          <>
            {canAuthor && (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {POSITIONS.map((pos) => (
                    <PositionTile
                      key={pos}
                      pos={pos}
                      priority={posMap[pos]}
                      saving={saving}
                      onClick={() => handleToggle(pos)}
                    />
                  ))}
                </div>

                <p className="text-[10px] text-muted-foreground mt-3" style={{ fontFamily: "var(--font-body)" }}>
                  Click a position to mark it primary, click again for secondary, click once more to clear.
                </p>
              </>
            )}

            {error && (
              <p className="text-xs text-destructive mt-2" style={{ fontFamily: "var(--font-body)" }}>{error}</p>
            )}

            {(others.length > 0 || showConsensus) && (
              <div className={canAuthor ? "mt-6" : ""}>
                <p
                  className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground mb-1"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  {canAuthor ? "Other coaches" : "Coaches"}
                </p>

                {showConsensus && consensus && (
                  <ComparisonRow
                    label="Consensus"
                    sublabel={`${consensus.raters} ${consensus.raters === 1 ? "coach" : "coaches"} · dashed = no agreement`}
                    entries={consensus.positions}
                    tallies={consensus.tallies}
                    copying={saving}
                    onCopy={
                      canAuthor
                        ? () =>
                            handleCopy(
                              // A split has no agreed priority, so it can't be copied.
                              consensus.positions.filter((p) => p.priority !== "split"),
                              "the consensus (positions with no agreement are skipped)"
                            )
                        : undefined
                    }
                  />
                )}

                {others.map((a) => (
                  <ComparisonRow
                    key={a.user_id}
                    label={a.is_me ? `${authorLabel(a)} (you)` : authorLabel(a)}
                    entries={byAuthor[a.user_id] ?? []}
                    copying={saving}
                    onCopy={
                      canAuthor
                        ? () => handleCopy(byAuthor[a.user_id] ?? [], `${authorLabel(a)}'s`)
                        : undefined
                    }
                  />
                ))}
              </div>
            )}

            {others.length === 0 && !showConsensus && (canAuthor ? !!meId : true) && (
              <p
                className={cn("text-[10px] text-muted-foreground", canAuthor && "mt-4")}
                style={{ fontFamily: "var(--font-body)" }}
              >
                {canAuthor
                  ? "No other coach has rated this player yet."
                  : authors.length === 0
                    ? "No one has Coach / Manager access to this team yet, so there are no position assignments."
                    : "No coach has assigned positions for this player yet."}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
