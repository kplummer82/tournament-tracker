// components/standings/CoinTossResolver.tsx
//
// Surfaces coin-toss ties on a standings page. A "coin-toss group" is a set of teams
// that remained tied after every configured tiebreaker except the coin toss — in real
// life these are seeded by an actual coin toss (which may involve 3+ teams, and there
// may be several independent groups at once). This component lets an admin enter the
// real-world finishing order so displayed standings match reality.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowUp, ArrowDown, GripVertical, Coins, Loader2, CheckCircle2, RotateCcw, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type CoinTossTeam = { teamid: number; team: string; seedOrder: number | null };
export type CoinTossGroup = {
  groupSig: string;
  pool_group: string | null;
  resolved: boolean;
  teams: CoinTossTeam[];
};

type Props = {
  scope: "season" | "tournament";
  scopeId: number;
  groups: CoinTossGroup[];
  canEdit: boolean;
  onSaved: () => void;
};

const apiBase = (scope: Props["scope"], scopeId: number) =>
  scope === "season" ? `/api/seasons/${scopeId}/coin-toss` : `/api/tournaments/${scopeId}/coin-toss`;

/* ── A single draggable team row inside one group ───────────────────── */
function SortableTeamRow({
  team, position, isFirst, isLast, onMoveUp, onMoveDown,
}: {
  team: CoinTossTeam;
  position: number;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: `t-${team.teamid}` });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 10 : undefined,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all",
        isDragging ? "border-primary/40 bg-primary/5 shadow-md" : "border-border bg-card hover:bg-muted/40"
      )}
    >
      <div
        {...attributes}
        {...listeners}
        className="shrink-0 cursor-grab active:cursor-grabbing touch-none text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors"
        title="Drag to reorder"
      >
        <GripVertical className="w-4 h-4" />
      </div>

      {/* Seed position */}
      <div className="shrink-0 w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
        <span className="text-xs font-bold text-primary tabular-nums leading-none">{position}</span>
      </div>

      <span className="flex-1 min-w-0 font-medium text-sm text-foreground truncate">{team.team}</span>

      <div className="flex flex-col gap-0.5 shrink-0">
        <button
          title="Move up" onClick={onMoveUp} disabled={isFirst}
          className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
        >
          <ArrowUp className="w-3 h-3" />
        </button>
        <button
          title="Move down" onClick={onMoveDown} disabled={isLast}
          className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
        >
          <ArrowDown className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

/* ── One group: its own ordered list + Save / Reset ─────────────────── */
function GroupEditor({
  scope, scopeId, group, canEdit, onSaved,
}: {
  scope: Props["scope"];
  scopeId: number;
  group: CoinTossGroup;
  canEdit: boolean;
  onSaved: () => void;
}) {
  // Local working order of teamids (initialized from saved order / detection order)
  const [order, setOrder] = useState<number[]>(group.teams.map((t) => t.teamid));
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);

  // Re-sync when the group prop changes (e.g. membership changed / after save refresh)
  useEffect(() => {
    setOrder(group.teams.map((t) => t.teamid));
    setError(null);
    setSavedOk(false);
  }, [group.groupSig, group.resolved, group.teams]);

  const teamById = useMemo(
    () => new Map(group.teams.map((t) => [t.teamid, t])),
    [group.teams]
  );
  const sortableIds = order.map((id) => `t-${id}`);

  const move = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= order.length || to >= order.length) return;
    setOrder((prev) => arrayMove(prev, from, to));
    setSavedOk(false);
  };

  const onDragEnd = (evt: DragEndEvent) => {
    const { active, over } = evt;
    if (!over || active.id === over.id) return;
    const fromIdx = sortableIds.indexOf(active.id as string);
    const toIdx = sortableIds.indexOf(over.id as string);
    if (fromIdx !== -1 && toIdx !== -1) move(fromIdx, toIdx);
  };

  const onSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(apiBase(scope, scopeId), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupSig: group.groupSig, order }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      setSavedOk(true);
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const onReset = async () => {
    setResetting(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase(scope, scopeId)}?groupSig=${encodeURIComponent(group.groupSig)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      setSavedOk(false);
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to clear");
    } finally {
      setResetting(false);
    }
  };

  const label =
    group.pool_group != null ? `Group ${group.pool_group}` : "Tied teams";

  return (
    <div className="border border-border rounded-lg p-4">
      <div className="flex items-center gap-2 mb-1">
        <h4 className="text-sm font-semibold text-foreground">{label}</h4>
        {group.resolved ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-success">
            <CheckCircle2 className="w-3 h-3" /> Resolved
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-yellow-300">
            <AlertTriangle className="w-3 h-3" /> Needs coin toss
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        {group.teams.length} teams tied after all other tiebreakers. Drag into the finishing
        order from the real coin toss (top = best seed).
      </p>

      {error && (
        <div className="mb-3 rounded-lg border border-destructive/40 bg-destructive/10 text-destructive px-3 py-2 text-xs">
          {error}
        </div>
      )}

      {canEdit ? (
        <DndContext collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            <div className="space-y-1.5">
              {order.map((id, idx) => {
                const t = teamById.get(id);
                if (!t) return null;
                return (
                  <SortableTeamRow
                    key={id}
                    team={t}
                    position={idx + 1}
                    isFirst={idx === 0}
                    isLast={idx === order.length - 1}
                    onMoveUp={() => move(idx, idx - 1)}
                    onMoveDown={() => move(idx, idx + 1)}
                  />
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        // Read-only list (non-editors)
        <div className="space-y-1.5">
          {order.map((id, idx) => {
            const t = teamById.get(id);
            if (!t) return null;
            return (
              <div key={id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border bg-card">
                <div className="shrink-0 w-7 h-7 rounded-full bg-muted flex items-center justify-center">
                  <span className="text-xs font-bold text-muted-foreground tabular-nums leading-none">{idx + 1}</span>
                </div>
                <span className="flex-1 min-w-0 font-medium text-sm text-foreground truncate">{t.team}</span>
              </div>
            );
          })}
        </div>
      )}

      {canEdit && (
        <div className="flex items-center gap-3 mt-3">
          <button
            onClick={onSave}
            disabled={saving}
            className={cn(
              "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
              saving ? "bg-muted text-muted-foreground cursor-not-allowed" : "bg-primary text-primary-foreground hover:opacity-90"
            )}
          >
            {saving ? (<><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>)
              : savedOk ? (<><CheckCircle2 className="w-4 h-4" /> Saved</>)
              : (<><Coins className="w-4 h-4" /> Save result</>)}
          </button>
          {group.resolved && (
            <button
              onClick={onReset}
              disabled={resetting}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted transition-all disabled:opacity-50"
            >
              {resetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
              Redo
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Banner + modal entry point ─────────────────────────────────────── */
export default function CoinTossResolver({ scope, scopeId, groups, canEdit, onSaved }: Props) {
  const [open, setOpen] = useState(false);
  // Hold the last non-empty groups so a transient refetch (which can briefly empty
  // `groups`) doesn't unmount the open modal or make the banner flicker.
  const lastGroups = useRef<CoinTossGroup[]>([]);
  if (groups && groups.length > 0) lastGroups.current = groups;
  const view = groups && groups.length > 0 ? groups : open ? lastGroups.current : [];

  if (view.length === 0) return null;

  const unresolved = view.filter((g) => !g.resolved).length;
  const allResolved = unresolved === 0;

  return (
    <>
      <div
        className={cn(
          "mb-4 flex items-center gap-3 px-4 py-3 rounded-lg border",
          allResolved
            ? "border-border bg-muted/40"
            : "border-amber-300 bg-amber-50 dark:border-yellow-500/30 dark:bg-yellow-500/10"
        )}
      >
        <Coins className={cn("w-4 h-4 shrink-0", allResolved ? "text-muted-foreground" : "text-amber-700 dark:text-yellow-300")} />
        <div className="flex-1 min-w-0 text-sm">
          {allResolved ? (
            <span className="text-muted-foreground">
              Coin toss applied to {view.length} tie{view.length !== 1 ? "s" : ""}.
            </span>
          ) : (
            <span className="font-medium text-amber-800 dark:text-yellow-200">
              {unresolved} tie{unresolved !== 1 ? "s" : ""} need{unresolved === 1 ? "s" : ""} a coin toss to set final seeds.
            </span>
          )}
        </div>
        <button
          onClick={() => setOpen(true)}
          className={cn(
            "shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
            allResolved
              ? "border border-border text-foreground hover:bg-muted"
              : "bg-primary text-primary-foreground hover:opacity-90"
          )}
        >
          {canEdit ? (allResolved ? "Edit" : "Resolve") : "View"}
        </button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Coins className="w-5 h-5 text-primary" /> Coin Toss Results
            </DialogTitle>
            <DialogDescription>
              These teams are tied after every other tiebreaker. Enter the finishing order
              from the real-world coin toss. Each group is independent.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            {view.map((g) => (
              <GroupEditor
                key={g.groupSig}
                scope={scope}
                scopeId={scopeId}
                group={g}
                canEdit={canEdit}
                onSaved={onSaved}
              />
            ))}
          </div>

          <DialogFooter className="mt-4">
            <button
              onClick={() => setOpen(false)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted transition-all"
            >
              Done
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
