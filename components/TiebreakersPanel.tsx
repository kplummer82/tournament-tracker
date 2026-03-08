import React, { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

/* dnd-kit for drag-and-drop reordering in the Selected list */
import { DndContext, closestCenter } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowRight,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Save,
  RotateCcw,
  GripVertical,
  PlusCircle,
  MinusCircle,
  Info,
} from "lucide-react";

/* shadcn tooltips */
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/* ---------- types ---------- */
type SortDir = "ASC" | "DESC";
type Tiebreaker = { id: number; code: string; displayName?: string | null; description?: string | null; sortDirection: SortDir };
type SelectedTB = { tiebreakerId: number; priority: number };

/* ---------- small helpers ---------- */
const byPriority = (a: SelectedTB, b: SelectedTB) => a.priority - b.priority;
const toIdSet = (arr: number[]) => new Set(arr);
const notIn = (ids: Set<number>) => (tb: Tiebreaker) => !ids.has(tb.id);

/* ---------- little UI bits ---------- */
function DirBadge({ dir }: { dir: SortDir }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        dir === "ASC" ? "bg-primary/20 text-primary" : "bg-accent/20 text-accent"
      )}
    >
      {dir === "ASC" ? (
        <><ArrowDown className="w-3 h-3" /> Lower is better</>
      ) : (
        <><ArrowUp className="w-3 h-3" /> Higher is better</>
      )}
    </span>
  );
}

function TBLabel({ tb }: { tb: Tiebreaker }) {
  const name = tb.displayName || tb.code;
  const hasDesc = !!tb.description?.trim();

  if (!hasDesc) {
    return (
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-medium text-foreground truncate">{name}</span>
      </div>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="inline-flex items-center gap-2 min-w-0 cursor-help" title={tb.description || ""}>
          <span className="font-medium text-foreground truncate">{name}</span>
          <Info className="w-4 h-4 shrink-0 text-muted-foreground" />
        </div>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        align="start"
        sideOffset={6}
        className="max-w-sm leading-snug z-50
                  bg-card text-card-foreground border border-border shadow-md
                  dark:bg-neutral-900 dark:text-neutral-100 dark:border-neutral-700"
      >
        <p className="text-sm">{tb.description}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function SelectableRow({
  tb,
  selected,
  onToggle,
}: {
  tb: Tiebreaker;
  selected: boolean;
  onToggle: (id: number) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(tb.id)}
      className={cn(
        "w-full text-left px-3 py-2.5 rounded-lg border transition-colors",
        selected ? "border-primary/60 bg-primary/10" : "border-border hover:bg-muted/60"
      )}
    >
      <div className="flex items-start gap-2.5">
        <input type="checkbox" checked={selected} readOnly className="mt-1 shrink-0 accent-indigo-500" />
        <div className="flex-1 min-w-0">
          <TBLabel tb={tb} />
          <div className="mt-1.5">
            <DirBadge dir={tb.sortDirection} />
          </div>
        </div>
      </div>
    </button>
  );
}

function SortableSelectedItem({
  tb,
  priority,
  active,
  onToggle,
  onMoveUp,
  onMoveDown,
}: {
  tb: Tiebreaker;
  priority: number;
  active: boolean;
  onToggle: (id: number) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `s-${tb.id}` });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.8 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="flex items-stretch gap-1.5">
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing shrink-0 flex items-center px-1.5 rounded-md border border-border bg-card hover:bg-muted"
        title="Drag to reorder"
      >
        <GripVertical className="w-4 h-4 text-muted-foreground" />
      </div>
      <span className="flex items-center justify-center w-7 shrink-0 text-xs font-bold text-muted-foreground">
        #{priority}
      </span>
      <button
        type="button"
        onClick={() => onToggle(tb.id)}
        className={cn(
          "flex-1 min-w-0 text-left px-3 py-2 rounded-lg border transition-colors",
          active ? "border-indigo-500/60 bg-indigo-500/10" : "border-border hover:bg-muted/50"
        )}
      >
        <TBLabel tb={tb} />
        <div className="mt-1.5">
          <DirBadge dir={tb.sortDirection} />
        </div>
      </button>
      <div className="flex flex-col gap-1 shrink-0">
        <button title="Move up" onClick={onMoveUp} className="p-1.5 rounded-md border border-border hover:bg-muted">
          <ArrowUp className="w-3.5 h-3.5" />
        </button>
        <button title="Move down" onClick={onMoveDown} className="p-1.5 rounded-md border border-border hover:bg-muted">
          <ArrowDown className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

/* ---------- main panel (formerly TiebreakersManager) ---------- */
export default function TiebreakersPanel({ tournamentId }: { tournamentId: number }) {
  const [available, setAvailable] = useState<Tiebreaker[]>([]);
  const [selected, setSelected] = useState<SelectedTB[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // multi-select state
  const [availSel, setAvailSel] = useState<Set<number>>(new Set());
  const [chosenSel, setChosenSel] = useState<Set<number>>(new Set());
  const [initialSelected, setInitialSelected] = useState<SelectedTB[]>([]);

  // load available + selected
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/tournaments/${tournamentId}/tiebreakers`);
        if (!res.ok) throw new Error(`Failed to load: ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        setAvailable(data.available ?? []);
        const sel = (data.selected ?? []).slice().sort(byPriority);
        setSelected(sel);
        setInitialSelected(sel);
      } catch (e: any) {
        setError(e.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => void (cancelled = true);
  }, [tournamentId]);

  // derived
  const selectedIds = useMemo(() => selected.map((s) => s.tiebreakerId), [selected]);
  const selectedIdSet = useMemo(() => toIdSet(selectedIds), [selectedIds]);
  const availFiltered = useMemo(() => available.filter(notIn(selectedIdSet)), [available, selectedIdSet]);
  const hasChanges = useMemo(
    () => JSON.stringify(initialSelected) !== JSON.stringify(selected),
    [initialSelected, selected]
  );

  // add/remove
  const addSelected = () => {
    if (availSel.size === 0) return;
    const next = [...selected];
    const toAdd = availFiltered.filter((tb) => availSel.has(tb.id));
    const start = next.length;
    toAdd.forEach((tb, i) => next.push({ tiebreakerId: tb.id, priority: start + i + 1 }));
    setSelected(next);
    setAvailSel(new Set());
  };
  const addAll = () => {
    if (availFiltered.length === 0) return;
    const next = [...selected];
    const start = next.length;
    availFiltered.forEach((tb, i) => next.push({ tiebreakerId: tb.id, priority: start + i + 1 }));
    setSelected(next);
    setAvailSel(new Set());
  };
  const removeSelected = () => {
    if (chosenSel.size === 0) return;
    const kept = selected.filter((s) => !chosenSel.has(s.tiebreakerId));
    const renum = kept.map((s, i) => ({ ...s, priority: i + 1 }));
    setSelected(renum);
    setChosenSel(new Set());
  };
  const removeAll = () => {
    if (selected.length === 0) return;
    setSelected([]);
    setChosenSel(new Set());
  };

  // reordering helpers
  const moveByIndex = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= selected.length || to >= selected.length) return;
    const copy = arrayMove(selected, from, to);
    const renum = copy.map((s, i) => ({ ...s, priority: i + 1 }));
    setSelected(renum);
  };
  const moveUp = (id: number) => {
    const i = selected.findIndex((s) => s.tiebreakerId === id);
    moveByIndex(i, i - 1);
  };
  const moveDown = (id: number) => {
    const i = selected.findIndex((s) => s.tiebreakerId === id);
    moveByIndex(i, i + 1);
  };

  // dnd-kit
  const selectedSortableIds = useMemo(() => selected.map((s) => `s-${s.tiebreakerId}`), [selected]);
  const onDragEnd = (evt: any) => {
    const { active, over } = evt;
    if (!over) return;
    const fromIdx = selectedSortableIds.indexOf(active.id);
    const toIdx = selectedSortableIds.indexOf(over.id);
    if (fromIdx === -1 || toIdx === -1) return;
    moveByIndex(fromIdx, toIdx);
  };

  // save/cancel
  const onSave = async () => {
    try {
      setSaving(true);
      setError(null);
      const body = { tiebreakerIds: selected.map((s) => s.tiebreakerId) };
      const res = await fetch(`/api/tournaments/${tournamentId}/tiebreakers`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Save failed: ${res.status}`);
      setInitialSelected(selected);
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setSaving(false);
    }
  };
  const onCancel = () => {
    setSelected(initialSelected);
    setAvailSel(new Set());
    setChosenSel(new Set());
  };

  const toggleAvail = (id: number) => {
    const next = new Set(availSel);
    next.has(id) ? next.delete(id) : next.add(id);
    setAvailSel(next);
  };
  const toggleChosen = (id: number) => {
    const next = new Set(chosenSel);
    next.has(id) ? next.delete(id) : next.add(id);
    setChosenSel(next);
  };

  return (
    <TooltipProvider delayDuration={150}>
      <div>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading tiebreakers…</div>
        ) : (
          <>
            {error && (
              <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 text-destructive p-3 text-sm">{error}</div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-6 items-start">
              {/* Available list */}
              <div className="flex-1">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">Available</h3>
                  <button
                    onClick={addAll}
                    className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border hover:bg-muted"
                  >
                    <PlusCircle className="w-4 h-4" /> Add all
                  </button>
                </div>
                <div className="space-y-2 max-h-[560px] overflow-auto pr-1">
                  {availFiltered.length === 0 && <div className="text-sm text-muted-foreground">No more items</div>}
                  {availFiltered.map((tb) => (
                    <SelectableRow key={tb.id} tb={tb} selected={availSel.has(tb.id)} onToggle={toggleAvail} />
                  ))}
                </div>
              </div>

              {/* Middle controls */}
              <div className="flex flex-col justify-center items-center gap-2 py-4">
                <button
                  onClick={addSelected}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border hover:bg-muted text-sm whitespace-nowrap"
                >
                  <ArrowRight className="w-4 h-4" />
                  Add selected
                </button>
                <button
                  onClick={removeSelected}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border hover:bg-muted text-sm whitespace-nowrap"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Remove selected
                </button>
              </div>

              {/* Selected list with DnD reordering */}
              <div className="flex-1">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">Selected (drag to reorder)</h3>
                  <button
                    onClick={removeAll}
                    className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border hover:bg-muted"
                  >
                    <MinusCircle className="w-4 h-4" /> Remove all
                  </button>
                </div>

                <DndContext collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                  <SortableContext items={selectedSortableIds} strategy={rectSortingStrategy}>
                    <div className="space-y-2 max-h-[560px] overflow-auto pr-2">
                      {selected.length === 0 && <div className="text-sm text-muted-foreground">Nothing selected yet</div>}
                      {selected
                        .slice()
                        .sort(byPriority)
                        .map((s) => {
                          const tb = available.find((a) => a.id === s.tiebreakerId);
                          if (!tb) return null;
                          const active = chosenSel.has(s.tiebreakerId);
                          return (
                            <SortableSelectedItem
                              key={`s-${s.tiebreakerId}`}
                              tb={tb}
                              priority={s.priority}
                              active={active}
                              onToggle={toggleChosen}
                              onMoveUp={() => moveUp(s.tiebreakerId)}
                              onMoveDown={() => moveDown(s.tiebreakerId)}
                            />
                          );
                        })}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>
            </div>

            <div className="mt-6 flex items-center gap-3">
              <button
                onClick={onSave}
                disabled={saving || !hasChanges}
                className={cn(
                  "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white",
                  saving || !hasChanges ? "bg-indigo-300" : "bg-indigo-600 hover:bg-indigo-700"
                )}
              >
                <Save className="w-4 h-4" />
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                onClick={onCancel}
                disabled={!hasChanges}
                className={cn(
                  "inline-flex items-center gap-2 px-4 py-2 rounded-lg border",
                  !hasChanges ? "border-border text-muted-foreground" : "border-border hover:bg-muted"
                )}
              >
                <RotateCcw className="w-4 h-4" /> Cancel
              </button>
              <div className="ml-auto text-sm text-muted-foreground">
                First item has highest priority. No duplicates allowed.
              </div>
            </div>
          </>
        )}
      </div>
    </TooltipProvider>
  );
}
