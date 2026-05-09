import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { POSITIONS, emptyPositionMap, type Position, type Priority, type PositionMap } from "@/lib/positions";
import type { PositionEntry } from "@/pages/api/teams/[teamId]/roster/[rosterId]/positions";

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

function PositionTile({
  pos,
  priority,
  canEdit,
  saving,
  onClick,
}: {
  pos: Position;
  priority: Priority | null;
  canEdit: boolean;
  saving: boolean;
  onClick: () => void;
}) {
  const isPrimary = priority === "primary";
  const isSecondary = priority === "secondary";
  const isAssigned = isPrimary || isSecondary;

  if (!canEdit && !isAssigned) return null;

  return (
    <button
      type="button"
      title={POS_LABELS[pos]}
      aria-label={`${POS_LABELS[pos]}: ${priority ?? "unassigned"}`}
      onClick={canEdit ? onClick : undefined}
      disabled={saving && canEdit}
      className={cn(
        "relative flex flex-col items-center justify-center w-12 h-12 border transition-all duration-100 select-none",
        canEdit ? "cursor-pointer" : "cursor-default",
        isPrimary && "bg-primary/15 border-primary text-primary",
        isSecondary && "bg-primary/5 border-primary/40 text-primary/70",
        !isAssigned && canEdit && "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
        !isAssigned && !canEdit && "border-border/40 text-muted-foreground/40",
        saving && canEdit && "opacity-60"
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

export default function PlayerPositionsCard({
  rosterId,
  teamId,
  canEdit,
}: {
  rosterId: number;
  teamId: number;
  canEdit: boolean;
}) {
  const [posMap, setPosMap] = useState<PositionMap>(emptyPositionMap);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/teams/${teamId}/roster/${rosterId}/positions`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: { positions: PositionEntry[] } = await res.json();
        if (cancelled) return;
        const map = emptyPositionMap();
        for (const { position, priority } of data.positions) {
          if (position in map) map[position as Position] = priority;
        }
        setPosMap(map);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load positions");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [teamId, rosterId]);

  const handleToggle = useCallback(
    async (pos: Position) => {
      if (!canEdit || saving) return;

      const nextPriority = cycleNext(posMap[pos]);
      const prevMap = { ...posMap };
      const nextMap = { ...posMap, [pos]: nextPriority };
      setPosMap(nextMap);
      setSaving(true);
      setError(null);

      try {
        const positions = (Object.entries(nextMap) as [Position, Priority | null][])
          .filter(([, p]) => p !== null)
          .map(([position, priority]) => ({ position, priority: priority as Priority }));

        const res = await fetch(`/api/teams/${teamId}/roster/${rosterId}/positions`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ positions }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        const data: { positions: PositionEntry[] } = await res.json();
        const confirmedMap = emptyPositionMap();
        for (const { position, priority } of data.positions) {
          if (position in confirmedMap) confirmedMap[position as Position] = priority;
        }
        setPosMap(confirmedMap);
      } catch (e) {
        setPosMap(prevMap);
        setError(e instanceof Error ? e.message : "Failed to save");
      } finally {
        setSaving(false);
      }
    },
    [canEdit, saving, posMap, teamId, rosterId]
  );

  const assignedCount = POSITIONS.filter((p) => posMap[p] !== null).length;
  const primaryCount = POSITIONS.filter((p) => posMap[p] === "primary").length;
  const secondaryCount = POSITIONS.filter((p) => posMap[p] === "secondary").length;

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2
              className="uppercase"
              style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "18px", letterSpacing: "-0.01em" }}
            >
              Positions
            </h2>
            {!loading && assignedCount > 0 && (
              <p className="text-[11px] text-muted-foreground mt-0.5" style={{ fontFamily: "var(--font-body)" }}>
                {primaryCount > 0 && `${primaryCount} primary`}
                {primaryCount > 0 && secondaryCount > 0 && " · "}
                {secondaryCount > 0 && `${secondaryCount} secondary`}
              </p>
            )}
          </div>
          {canEdit && (
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
          )}
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>Loading…</p>
        ) : (
          <>
            {!canEdit && assignedCount === 0 && (
              <p className="text-sm text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
                No positions assigned.
              </p>
            )}

            {(canEdit || assignedCount > 0) && (
              <div className="flex flex-wrap gap-1.5">
                {POSITIONS.map((pos) => (
                  <PositionTile
                    key={pos}
                    pos={pos}
                    priority={posMap[pos]}
                    canEdit={canEdit}
                    saving={saving}
                    onClick={() => handleToggle(pos)}
                  />
                ))}
              </div>
            )}

            {canEdit && (
              <p className="text-[10px] text-muted-foreground mt-3" style={{ fontFamily: "var(--font-body)" }}>
                Click a position to mark it primary, click again for secondary, click once more to clear.
              </p>
            )}

            {error && (
              <p className="text-xs text-destructive mt-2" style={{ fontFamily: "var(--font-body)" }}>{error}</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
