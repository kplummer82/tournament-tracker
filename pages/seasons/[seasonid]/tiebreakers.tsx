// pages/seasons/[seasonid]/tiebreakers.tsx
import SeasonProvider, { useSeason } from "@/components/seasons/SeasonProvider";
import SeasonShell from "@/components/seasons/SeasonShell";
import React, { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowUp, ArrowDown, Save, RotateCcw, GripVertical,
  X, Plus, Loader2, CheckCircle2,
} from "lucide-react";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";

type SortDir = "ASC" | "DESC";
type Tiebreaker = {
  id: number;
  code: string;
  displayName?: string | null;
  description?: string | null;
  sortDirection: SortDir;
};
type SelectedTB = { tiebreakerId: number; priority: number };

const byPriority = (a: SelectedTB, b: SelectedTB) => a.priority - b.priority;

// Direction badge — fixed light-mode contrast: amber text on amber bg instead of yellow-on-white
function DirBadge({ dir }: { dir: SortDir }) {
  const isHigher = dir === "DESC";
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap",
      isHigher
        ? "bg-amber-100 text-amber-800 dark:bg-yellow-400/20 dark:text-yellow-300"
        : "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400"
    )}>
      {isHigher ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
      {isHigher ? "Higher is better" : "Lower is better"}
    </span>
  );
}

// A single draggable row in the active priority list
function ActiveTiebreakerRow({
  tb,
  priority,
  isFirst,
  isLast,
  canEdit,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  tb: Tiebreaker;
  priority: number;
  isFirst: boolean;
  isLast: boolean;
  canEdit: boolean;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: `s-${tb.id}` });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  const name = tb.displayName || tb.code;

  const row = (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group flex items-center gap-3 px-3 py-3 rounded-lg border transition-all",
        isDragging
          ? "border-primary/40 bg-primary/5 shadow-md"
          : "border-border bg-card hover:bg-muted/40"
      )}
    >
      {/* Drag handle */}
      {canEdit && (
        <div
          {...attributes}
          {...listeners}
          className="shrink-0 cursor-grab active:cursor-grabbing touch-none text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors"
          title="Drag to reorder"
        >
          <GripVertical className="w-4 h-4" />
        </div>
      )}

      {/* Priority pill */}
      <div className="shrink-0 w-6 h-6 rounded-full bg-muted flex items-center justify-center">
        <span className="text-[11px] font-bold text-muted-foreground tabular-nums leading-none">
          {priority}
        </span>
      </div>

      {/* Name */}
      <span className="flex-1 min-w-0 font-medium text-sm text-foreground truncate">{name}</span>

      {/* Direction badge */}
      <DirBadge dir={tb.sortDirection} />

      {/* Up / Down arrows */}
      {canEdit && (
        <div className="flex flex-col gap-0.5 shrink-0">
          <button
            title="Move up"
            onClick={onMoveUp}
            disabled={isFirst}
            className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
          >
            <ArrowUp className="w-3 h-3" />
          </button>
          <button
            title="Move down"
            onClick={onMoveDown}
            disabled={isLast}
            className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
          >
            <ArrowDown className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Remove button */}
      {canEdit && (
        <button
          title="Remove"
          onClick={onRemove}
          className="shrink-0 p-1.5 rounded-md text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-all opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );

  if (!tb.description?.trim()) return row;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{row}</TooltipTrigger>
      <TooltipContent side="top" align="start" sideOffset={6} className="max-w-xs leading-snug z-50">
        <p className="text-sm">{tb.description}</p>
      </TooltipContent>
    </Tooltip>
  );
}

// Clickable row for an available (not-yet-added) tiebreaker — matches the style of active rows
function AvailableChip({ tb, onClick }: { tb: Tiebreaker; onClick: () => void }) {
  const name = tb.displayName || tb.code;
  const content = (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group w-full flex items-center gap-3 px-3 py-3 rounded-lg border text-sm text-left",
        "border-border bg-card text-foreground",
        "hover:border-primary/40 hover:bg-primary/5",
        "transition-all"
      )}
    >
      {/* Spacer to align with drag handle width */}
      <div className="shrink-0 w-4" />

      {/* Plus icon where the priority number goes */}
      <div className="shrink-0 w-6 h-6 rounded-full bg-muted flex items-center justify-center">
        <Plus className="w-3 h-3 text-muted-foreground group-hover:text-primary transition-colors" />
      </div>

      <span className="flex-1 min-w-0 font-medium text-sm truncate">{name}</span>

      <DirBadge dir={tb.sortDirection} />

      {/* Spacer to align with up/down + remove button widths */}
      <div className="shrink-0 w-14" />
    </button>
  );

  if (!tb.description?.trim()) return content;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{content}</TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs z-50">
        <p className="text-sm">{tb.description}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function EmptyPriorityState({ canEdit }: { canEdit: boolean }) {
  return (
    <div className="rounded-lg border-2 border-dashed border-border/40 px-6 py-10 text-center">
      <p className="text-sm font-medium text-muted-foreground">
        {canEdit ? "No tiebreakers configured yet." : "No tiebreakers have been set up."}
      </p>
      {canEdit && (
        <p className="text-xs text-muted-foreground/60 mt-1">
          Add tiebreakers below to define how ties are broken.
        </p>
      )}
    </div>
  );
}

function SeasonTiebreakersPanel({ seasonId, canEdit }: { seasonId: number; canEdit: boolean }) {
  const [available, setAvailable] = useState<Tiebreaker[]>([]);
  const [selected, setSelected] = useState<SelectedTB[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialSelected, setInitialSelected] = useState<SelectedTB[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/seasons/${seasonId}/tiebreakers`);
        if (!res.ok) throw new Error(`Failed to load: ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        setAvailable(data.available ?? []);
        const sel = (data.selected ?? []).slice().sort(byPriority);
        setSelected(sel);
        setInitialSelected(sel);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [seasonId]);

  const selectedIdSet = useMemo(() => new Set(selected.map((s) => s.tiebreakerId)), [selected]);
  const availFiltered = useMemo(() => available.filter((tb) => !selectedIdSet.has(tb.id)), [available, selectedIdSet]);
  const hasChanges = useMemo(() => JSON.stringify(initialSelected) !== JSON.stringify(selected), [initialSelected, selected]);
  const sortedSelected = useMemo(() => selected.slice().sort(byPriority), [selected]);
  const sortableIds = useMemo(() => sortedSelected.map((s) => `s-${s.tiebreakerId}`), [sortedSelected]);

  const addTiebreaker = (id: number) => {
    const maxPri = selected.length > 0 ? Math.max(...selected.map((s) => s.priority)) : 0;
    setSelected([...selected, { tiebreakerId: id, priority: maxPri + 1 }]);
  };

  const addAll = () => {
    if (availFiltered.length === 0) return;
    const start = selected.length > 0 ? Math.max(...selected.map((s) => s.priority)) : 0;
    setSelected([...selected, ...availFiltered.map((tb, i) => ({ tiebreakerId: tb.id, priority: start + i + 1 }))]);
  };

  const removeTiebreaker = (id: number) => {
    setSelected(
      selected.filter((s) => s.tiebreakerId !== id).map((s, i) => ({ ...s, priority: i + 1 }))
    );
  };

  const moveByIndex = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= sortedSelected.length || to >= sortedSelected.length) return;
    setSelected(
      arrayMove(sortedSelected, from, to).map((s, i) => ({ ...s, priority: i + 1 }))
    );
  };

  const onDragEnd = (evt: DragEndEvent) => {
    const { active, over } = evt;
    if (!over || active.id === over.id) return;
    const fromIdx = sortableIds.indexOf(active.id as string);
    const toIdx = sortableIds.indexOf(over.id as string);
    if (fromIdx !== -1 && toIdx !== -1) moveByIndex(fromIdx, toIdx);
  };

  const onSave = async () => {
    try {
      setSaving(true);
      setError(null);
      const res = await fetch(`/api/seasons/${seasonId}/tiebreakers`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tiebreakerIds: sortedSelected.map((s) => s.tiebreakerId) }),
      });
      if (!res.ok) throw new Error(`Save failed: ${res.status}`);
      setInitialSelected(selected);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const onCancel = () => {
    setSelected(initialSelected);
    setError(null);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading tiebreakers…
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-5 max-w-xl">
        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 text-destructive px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* Active priority list */}
        <div>
          <DndContext collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
              <div className="space-y-1.5">
                {sortedSelected.length === 0
                  ? <EmptyPriorityState canEdit={canEdit} />
                  : sortedSelected.map((s, idx) => {
                      const tb = available.find((a) => a.id === s.tiebreakerId);
                      if (!tb) return null;
                      return (
                        <ActiveTiebreakerRow
                          key={`s-${s.tiebreakerId}`}
                          tb={tb}
                          priority={s.priority}
                          isFirst={idx === 0}
                          isLast={idx === sortedSelected.length - 1}
                          canEdit={canEdit}
                          onRemove={() => removeTiebreaker(s.tiebreakerId)}
                          onMoveUp={() => moveByIndex(idx, idx - 1)}
                          onMoveDown={() => moveByIndex(idx, idx + 1)}
                        />
                      );
                    })
                }
              </div>
            </SortableContext>
          </DndContext>
        </div>

        {/* Available tiebreakers to add */}
        {canEdit && availFiltered.length > 0 && (
          <div>
            <div className="flex items-center gap-3 mb-2.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Add to order
              </span>
              <div className="flex-1 h-px bg-border/50" />
              <button
                onClick={addAll}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Add all
              </button>
            </div>
            <div className="space-y-1.5">
              {availFiltered.map((tb) => (
                <AvailableChip key={tb.id} tb={tb} onClick={() => addTiebreaker(tb.id)} />
              ))}
            </div>
          </div>
        )}

        {/* All tiebreakers active */}
        {canEdit && availFiltered.length === 0 && sortedSelected.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CheckCircle2 className="w-3.5 h-3.5 text-success" />
            All available tiebreakers are active.
          </div>
        )}

        {/* Save / Cancel footer */}
        {canEdit && (
          <div className="flex items-center gap-3 pt-3 border-t border-border/50">
            <button
              onClick={onSave}
              disabled={saving || !hasChanges}
              className={cn(
                "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                saving || !hasChanges
                  ? "bg-muted text-muted-foreground cursor-not-allowed"
                  : "bg-primary text-primary-foreground hover:opacity-90"
              )}
            >
              {saving ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
              ) : saveSuccess ? (
                <><CheckCircle2 className="w-4 h-4" /> Saved</>
              ) : (
                <><Save className="w-4 h-4" /> Save</>
              )}
            </button>
            <button
              onClick={onCancel}
              disabled={!hasChanges}
              className={cn(
                "inline-flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all",
                !hasChanges
                  ? "border-border text-muted-foreground cursor-not-allowed"
                  : "border-border text-foreground hover:bg-muted"
              )}
            >
              <RotateCcw className="w-4 h-4" /> Cancel
            </button>
            <span className="ml-auto text-xs text-muted-foreground">
              First item has highest priority.
            </span>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

function TiebreakersBody() {
  const { seasonId, canEdit } = useSeason();
  if (!seasonId) return <div className="text-sm text-muted-foreground">Invalid season id.</div>;
  return (
    <div>
      <div className="mb-6">
        <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "20px", textTransform: "uppercase", letterSpacing: "-0.01em" }}>
          Tiebreakers
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5" style={{ fontFamily: "var(--font-body)" }}>
          When teams are tied in the standings, these rules are applied in order until the tie is broken.
        </p>
      </div>
      <SeasonTiebreakersPanel seasonId={seasonId} canEdit={canEdit} />
    </div>
  );
}

export default function TiebreakersPage() {
  return (
    <SeasonProvider>
      <SeasonShell tab="tiebreakers">
        <TiebreakersBody />
      </SeasonShell>
    </SeasonProvider>
  );
}
