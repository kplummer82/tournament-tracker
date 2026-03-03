// pages/tournaments/[tournamentid]/index.tsx
import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { cn } from "@/lib/utils";
import AddTeamsModal from "@/components/AddTeamsModal";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import AddGameModal from "@/components/AddGameModal";
import PoolGameDeleteButton from "@/components/PoolGameDeleteButton";

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
} from "lucide-react";

// Simple pencil-in-a-square icon
function EditIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" {...props}>
      <path d="M15.7 3.3a1 1 0 0 1 1.4 0l3.6 3.6a1 1 0 0 1 0 1.4l-9.9 9.9a1 1 0 0 1-.5.3l-5 1.1a1 1 0 0 1-1.2-1.2l1.1-5a1 1 0 0 1 .3-.5l9.9-9.9zM6.6 14.5 9.5 17l8.4-8.4-2.9-2.9L6.6 14.5zM4 20h16a1 1 0 1 1 0 2H4a3 3 0 0 1-3-3V4a1 1 0 1 1 2 0v15a1 1 0 0 0 1 1z" />
    </svg>
  );
}

/* ---------------- robust date/time formatting helpers ---------------- */
const DT_LOCALE = "en-US";
const DT_TIMEZONE: string | undefined = undefined; // or a specific TZ string if you need one

function parseYMD(dateStr?: string): Date | null {
  if (!dateStr) return null;
  const ymd = dateStr.slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (!Number.isNaN(y) && !Number.isNaN(mo) && !Number.isNaN(d)) {
      return new Date(y, mo - 1, d);
    }
  }
  const dt = new Date(dateStr);
  return isNaN(dt.getTime()) ? null : dt;
}
function parseYMD_HMS(dateStr?: string, timeStr?: string): Date | null {
  const base = parseYMD(dateStr);
  if (!base) return null;
  let hh = 0, mm = 0, ss = 0;
  if (timeStr) {
    const parts = timeStr.split(":").map((n) => Number(n));
    if (parts.length >= 2) {
      hh = Number.isFinite(parts[0]) ? parts[0] : 0;
      mm = Number.isFinite(parts[1]) ? parts[1] : 0;
      if (parts.length >= 3 && Number.isFinite(parts[2])) ss = parts[2];
    }
  }
  base.setHours(hh, mm, ss, 0);
  return base;
}
export function formatMMDDYY(dateStr?: string): string {
  const d = parseYMD(dateStr);
  if (!d) return "";
  return d.toLocaleDateString(DT_LOCALE, { year: "2-digit", month: "2-digit", day: "2-digit", timeZone: DT_TIMEZONE });
}
export function formatHHMMAMPM(dateStr?: string, timeStr?: string): string {
  const d = parseYMD_HMS(dateStr, timeStr) ?? parseYMD(dateStr);
  if (!d) return "";
  return d
    .toLocaleTimeString(DT_LOCALE, { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: DT_TIMEZONE })
    .replace(/\s/g, "")
    .toUpperCase();
}

/* ---------------- types ---------------- */
type TabKey = "overview" | "teams" | "pool" | "standings" | "bracket" | "tiebreakers";
type Tournament = {
  id?: number;
  tournamentid: number;
  name: string | null;
  city: string | null;
  state: string | null;
  year: number | null;
  maxrundiff: number | null;
  divisionid: number | null;
  statusid: number | null;
  visibilityid: number | null;
  division?: string | null;
  tournamentstatus?: string | null;
  tournamentvisibility?: string | null;
};
type TeamRow = { id?: number; name: string; season: string };
type PoolGameRow = {
  id: number;
  tournamentid: number;
  hometeam: string;
  awayteam: string;
  gamedate: string;
  gametime: string;
  homescore: number | null;
  awayscore: number | null;
  gamestatus: string | null;
  gamestatusid?: number | null;
};
type LookupRow = { id: number | string; name: string };
type AddModalInitial = {
  id?: number;
  gamedate?: string;
  gametime?: string;
  hometeam?: string;
  awayteam?: string;
  homescore?: number | null;
  awayscore?: number | null;
  gamestatusid?: number | null;
};

/* ---------------- UI helpers ---------------- */
const CARD = "rounded-xl border bg-muted/30 p-4 text-foreground";
const INPUT = "w-full rounded-md border px-3 py-2 bg-background text-foreground";
const BTN = "rounded-lg bg-primary px-3 py-2 font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50";
const BTN_DANGER = "rounded-lg border border-destructive/60 bg-destructive/10 px-3 py-2 font-semibold text-destructive";

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center rounded-xl border px-4 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-muted text-foreground border-muted-foreground/20 hover:bg-accent hover:text-accent-foreground"
      )}
    >
      {children}
    </button>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
function nameById(value: string | number | null | undefined, list: LookupRow[]): string {
  if (value === null || value === undefined || value === "") return "";
  const s = String(value);
  const found = list.find((r) => String(r.id) === s);
  return found ? found.name : "";
}

/* ----------------------------- */
/*  TIEBREAKERS MANAGER (DnD inside Selected list)
 */
type SortDir = "ASC" | "DESC";
type Tiebreaker = { id: number; code: string; description?: string | null; sortDirection: SortDir };
type SelectedTB = { tiebreakerId: number; priority: number };

const byPriority = (a: SelectedTB, b: SelectedTB) => a.priority - b.priority;
const toIdSet = (arr: number[]) => new Set(arr);
const notIn = (ids: Set<number>) => (tb: Tiebreaker) => !ids.has(tb.id);

function DirBadge({ dir }: { dir: SortDir }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        dir === "ASC" ? "bg-sky-100 text-sky-800" : "bg-violet-100 text-violet-800"
      )}
    >
      {dir === "ASC" ? "ASC (low→high)" : "DESC (high→low)"}
    </span>
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
        "w-full text-left px-3 py-2 rounded-lg border flex items-center gap-3",
        selected ? "border-indigo-500 bg-indigo-50" : "border-gray-200 hover:bg-gray-50"
      )}
    >
      <input type="checkbox" checked={selected} readOnly className="accent-indigo-600" />
      <div className="flex-1">
        <div className="font-medium text-gray-900">{tb.code}</div>
        {tb.description && <div className="text-xs text-gray-500 line-clamp-2">{tb.description}</div>}
      </div>
      <DirBadge dir={tb.sortDirection} />
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
  const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.8 : 1 };
  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2">
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing shrink-0 p-2 rounded-md border border-gray-300 bg-white"
        title="Drag to reorder"
      >
        <GripVertical className="w-4 h-4 text-gray-500" />
      </div>
      <button
        type="button"
        onClick={() => onToggle(tb.id)}
        className={cn(
          "flex-1 text-left px-3 py-2 rounded-lg border",
          active ? "border-indigo-500 bg-indigo-50" : "border-gray-200 hover:bg-gray-50"
        )}
      >
        <div className="flex items-center gap-3">
          <input type="checkbox" checked={active} readOnly className="accent-indigo-600" />
          <div className="flex-1">
            <div className="font-medium text-gray-900">{tb.code}</div>
            {tb.description && <div className="text-xs text-gray-500 line-clamp-2">{tb.description}</div>}
          </div>
          <DirBadge dir={tb.sortDirection} />
          <span className="text-xs text-gray-400 ml-1">#{priority}</span>
        </div>
      </button>
      <div className="flex flex-col gap-1">
        <button title="Move up" onClick={onMoveUp} className="p-2 rounded-md border border-gray-300 hover:bg-gray-50">
          <ArrowUp className="w-4 h-4" />
        </button>
        <button title="Move down" onClick={onMoveDown} className="p-2 rounded-md border border-gray-300 hover:bg-gray-50">
          <ArrowDown className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
function TiebreakersManager({ tournamentId }: { tournamentId: number }) {
  const [available, setAvailable] = useState<Tiebreaker[]>([]);
  const [selected, setSelected] = useState<SelectedTB[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availSel, setAvailSel] = useState<Set<number>>(new Set());
  const [chosenSel, setChosenSel] = useState<Set<number>>(new Set());
  const [initialSelected, setInitialSelected] = useState<SelectedTB[]>([]);

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
    <div>
      {loading ? (
        <div className="text-sm text-muted-foreground">Loading tiebreakers…</div>
      ) : (
        <>
          {error && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 text-red-800 p-3 text-sm">{error}</div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
            {/* Available list */}
            <div className="flex-1">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700">Available</h3>
                <button
                  onClick={addAll}
                  className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded-md border border-gray-300 hover:bg-gray-50"
                >
                  <PlusCircle className="w-4 h-4" /> Add all
                </button>
              </div>
              <div className="space-y-2 max-h-[420px] overflow-auto pr-1">
                {availFiltered.length === 0 && <div className="text-sm text-gray-500">No more items</div>}
                {availFiltered.map((tb) => (
                  <SelectableRow key={tb.id} tb={tb} selected={availSel.has(tb.id)} onToggle={toggleAvail} />
                ))}
              </div>
            </div>

            {/* Middle controls */}
            <div className="flex flex-col justify-center items-center gap-2">
              <button
                onClick={addSelected}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-gray-300 hover:bg-gray-50"
              >
                <ArrowRight className="w-4 h-4" />
                Add selected
              </button>
              <button
                onClick={removeSelected}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-gray-300 hover:bg-gray-50"
              >
                <ArrowLeft className="w-4 h-4" />
                Remove selected
              </button>
            </div>

            {/* Selected list with DnD reordering */}
            <div className="flex-1">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700">Selected (drag to reorder)</h3>
                <button
                  onClick={removeAll}
                  className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded-md border border-gray-300 hover:bg-gray-50"
                >
                  <MinusCircle className="w-4 h-4" /> Remove all
                </button>
              </div>

              <DndContext collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={selectedSortableIds} strategy={rectSortingStrategy}>
                  <div className="space-y-2 max-h-[420px] overflow-auto pr-1">
                    {selected.length === 0 && <div className="text-sm text-gray-500">Nothing selected yet</div>}
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
                !hasChanges ? "border-gray-300 text-gray-400" : "border-gray-300 hover:bg-gray-50"
              )}
            >
              <RotateCcw className="w-4 h-4" /> Cancel
            </button>
            <div className="ml-auto text-sm text-gray-500">First item has highest priority. No duplicates allowed.</div>
          </div>
        </>
      )}
    </div>
  );
}
/* ----------------------------- */

export default function TournamentPage() {
  const router = useRouter();

  // robust numeric id from route
  const tid = useMemo(() => {
    const raw = Array.isArray(router.query.tournamentid)
      ? router.query.tournamentid[0]
      : router.query.tournamentid;
    const n = Number(raw);
    return Number.isFinite(n) ? n : NaN;
  }, [router.query.tournamentid]);

  const [tab, setTab] = useState<TabKey>("overview");

  // overview state
  const [t, setT] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // lookups
  const [divisions, setDivisions] = useState<LookupRow[]>([]);
  const [statuses, setStatuses] = useState<LookupRow[]>([]);
  const [visibilities, setVisibilities] = useState<LookupRow[]>([]);
  const [lookupsLoaded, setLookupsLoaded] = useState(false);

  // teams + pool
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [teamsErr, setTeamsErr] = useState<string | null>(null);
  const [teamsVersion, setTeamsVersion] = useState(0);

  const [pool, setPool] = useState<PoolGameRow[]>([]);
  const [poolLoading, setPoolLoading] = useState(false);
  const [poolErr, setPoolErr] = useState<string | null>(null);
  const [isAddGameOpen, setIsAddGameOpen] = useState(false);
  const [poolVersion, setPoolVersion] = useState(0);

  // EDIT modal state
  const [editOpen, setEditOpen] = useState(false);
  const [editInitial, setEditInitial] = useState<AddModalInitial | undefined>(undefined);

  function openEdit(row: PoolGameRow) {
    setEditInitial({
      id: row.id,
      gamedate: row.gamedate ? row.gamedate.slice(0, 10) : "",
      gametime: row.gametime,
      hometeam: row.hometeam,
      awayteam: row.awayteam,
      homescore: row.homescore ?? null,
      awayscore: row.awayscore ?? null,
      gamestatusid: row.gamestatusid ?? null,
    });
    setEditOpen(true);
  }

  /* -------- load lookups -------- */
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/lookups");
        const json = await res.json();
        const divs: LookupRow[] = Array.isArray(json?.divisions) ? json.divisions : [];
        const stats: LookupRow[] =
          Array.isArray(json?.tournamentstatus)
            ? json.tournamentstatus
            : Array.isArray(json?.statuses)
            ? json.statuses
            : [];
        const vis: LookupRow[] =
          Array.isArray(json?.tournamentvisibility)
            ? json.tournamentvisibility
            : Array.isArray(json?.visibilities)
            ? json.visibilities
            : [];
        setDivisions(divs);
        setStatuses(stats);
        setVisibilities(vis);
      } catch {
        setDivisions([]);
        setStatuses([]);
        setVisibilities([]);
      } finally {
        setLookupsLoaded(true);
      }
    })();
  }, []);

  /* -------- load overview -------- */
  useEffect(() => {
    if (!router.isReady || !Number.isFinite(tid)) return;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch(`/api/tournaments/${tid}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Failed to load tournament");
        setT(json as Tournament);
      } catch (e: any) {
        setErr(e.message || "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, [router.isReady, tid]);

  /* -------- save overview -------- */
  const onSave = async () => {
    if (!Number.isFinite(tid) || !t) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/tournaments/${tid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: t.name,
          city: t.city,
          state: t.state,
          year: t.year,
          maxrundiff: t.maxrundiff,
          divisionid: t.divisionid,
          statusid: t.statusid,
          visibilityid: t.visibilityid,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Save failed");
      setT(json as Tournament);
      setToast("Saved");
      setTimeout(() => setToast(null), 1200);
    } catch (e: any) {
      alert(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!Number.isFinite(tid)) return;
    if (!confirm("Delete this tournament? This cannot be undone.")) return;
    const res = await fetch(`/api/tournaments/${tid}`, { method: "DELETE" });
    if (res.ok) router.push("/tournaments");
    else {
      const j = await res.json().catch(() => ({} as any));
      alert(j?.error || "Delete failed");
    }
  };

  /* -------- teams (refetch on tab/version) -------- */
  useEffect(() => {
    if (tab !== "teams" || !Number.isFinite(tid)) return;
    (async () => {
      setTeamsLoading(true);
      setTeamsErr(null);
      try {
        const res = await fetch(`/api/tournaments/${tid}/teams`);
        const text = await res.text();
        if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
        const payload = text ? JSON.parse(text) : { rows: [] };
        const rows: TeamRow[] = Array.isArray(payload?.rows)
          ? payload.rows
          : Array.isArray(payload)
          ? payload
          : [];
        setTeams(rows);
      } catch (e: any) {
        setTeamsErr(e.message || "Failed to load teams");
      } finally {
        setTeamsLoading(false);
      }
    })();
  }, [tab, tid, teamsVersion]);

  /* -------- pool games -------- */
  useEffect(() => {
    if (tab !== "pool" || !Number.isFinite(tid)) return;

    let cancelled = false;
    (async () => {
      setPoolLoading(true);
      setPoolErr(null);
      try {
        const res = await fetch(`/api/tournaments/${tid}/poolgames`, {
          method: "GET",
          headers: { Accept: "application/json" },
          cache: "no-store",
        });

        const ct = res.headers.get("content-type") || "";
        if (!res.ok) {
          if (ct.includes("application/json")) {
            const j = await res.json();
            throw new Error(j?.error || `HTTP ${res.status}`);
          } else {
            await res.text();
            throw new Error(`HTTP ${res.status}`);
          }
        }
        if (!ct.includes("application/json")) {
          await res.text();
          throw new Error("Expected JSON but received non-JSON response.");
        }
        const data = await res.json();
        if (!cancelled) setPool(Array.isArray(data?.games) ? data.games : []);
      } catch (e: any) {
        if (!cancelled) {
          setPoolErr(e.message || "Failed to load pool games");
          setPool([]);
        }
      } finally {
        if (!cancelled) setPoolLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tab, tid, poolVersion]);

  /* ---------------- render ---------------- */
  const divisionLabel = useMemo(() => nameById(t?.divisionid ?? "", divisions), [t?.divisionid, divisions]);
  const statusLabel = useMemo(() => nameById(t?.statusid ?? "", statuses), [t?.statusid, statuses]);
  const visibilityLabel = useMemo(() => nameById(t?.visibilityid ?? "", visibilities), [t?.visibilityid, visibilities]);

  return (
    <div className="container mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between my-4">
        <div>
          <Link href="/tournaments" className="text-sm text-primary hover:underline">
            ← Back to All Tournaments
          </Link>
          <div className="mt-2 flex items-center gap-3">
            <h1 className="text-2xl font-bold">{t?.name ?? "Tournament"}</h1>
            {divisionLabel && (
              <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs bg-muted">
                {divisionLabel}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onDelete} className={BTN_DANGER}>
            Delete
          </button>
          <button onClick={onSave} disabled={saving || tab !== "overview"} className={BTN}>
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex flex-wrap gap-3">
        <TabBtn active={tab === "overview"} onClick={() => setTab("overview")}>
          Overview
        </TabBtn>
        <TabBtn active={tab === "teams"} onClick={() => setTab("teams")}>
          Teams
        </TabBtn>
        <TabBtn active={tab === "pool"} onClick={() => setTab("pool")}>
          Pool Play
        </TabBtn>
        <TabBtn active={tab === "standings"} onClick={() => setTab("standings")}>
          Pre-Bracket Standings
        </TabBtn>
        <TabBtn active={tab === "bracket"} onClick={() => setTab("bracket")}>
          Bracket
        </TabBtn>
        <TabBtn active={tab === "tiebreakers"} onClick={() => setTab("tiebreakers")}>
          Tiebreakers
        </TabBtn>
      </div>

      {/* Main area */}
      {loading ? (
        <div>Loading…</div>
      ) : err ? (
        <div className="text-red-600">{err}</div>
      ) : (
        <>
          {/* Overview */}
          {tab === "overview" && (
            <div className={CARD}>
              <h3 className="mb-2 text-lg font-semibold">Overview</h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Name">
                  <input
                    className={INPUT}
                    value={t?.name ?? ""}
                    onChange={(e) => setT((p) => ({ ...(p as any), name: e.target.value }))}
                  />
                </Field>

                <Field label="Division">
                  {lookupsLoaded && divisions.length > 0 ? (
                    <select
                      className={INPUT}
                      value={t?.divisionid ? String(t.divisionid) : ""}
                      onChange={(e) => setT((p) => ({ ...(p as any), divisionid: Number(e.target.value) }))}
                    >
                      {divisions.map((d) => (
                        <option key={String(d.id)} value={String(d.id)}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input className={INPUT} value={divisionLabel} readOnly />
                  )}
                </Field>

                <Field label="City">
                  <input
                    className={INPUT}
                    value={t?.city ?? ""}
                    onChange={(e) => setT((p) => ({ ...(p as any), city: e.target.value }))}
                  />
                </Field>
                <Field label="State">
                  <input
                    className={INPUT}
                    value={t?.state ?? ""}
                    onChange={(e) => setT((p) => ({ ...(p as any), state: e.target.value }))}
                  />
                </Field>

                <Field label="Year">
                  <input
                    type="number"
                    className={INPUT}
                    value={t?.year ?? ""}
                    onChange={(e) =>
                      setT((p) => ({ ...(p as any), year: e.target.value === "" ? null : Number(e.target.value) }))
                    }
                  />
                </Field>

                <Field label="Max Run Differential">
                  <input
                    type="number"
                    className={INPUT}
                    value={t?.maxrundiff ?? ""}
                    onChange={(e) =>
                      setT((p) => ({
                        ...(p as any),
                        maxrundiff: e.target.value === "" ? null : Number(e.target.value),
                      }))
                    }
                  />
                </Field>

                <Field label="Status">
                  {lookupsLoaded && statuses.length > 0 ? (
                    <select
                      className={INPUT}
                      value={t?.statusid ? String(t.statusid) : ""}
                      onChange={(e) => setT((p) => ({ ...(p as any), statusid: Number(e.target.value) }))}
                    >
                      {statuses.map((s) => (
                        <option key={String(s.id)} value={String(s.id)}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input className={INPUT} value={statusLabel} readOnly />
                  )}
                </Field>

                <Field label="Visibility">
                  {lookupsLoaded && visibilities.length > 0 ? (
                    <select
                      className={INPUT}
                      value={t?.visibilityid ? String(t.visibilityid) : ""}
                      onChange={(e) => setT((p) => ({ ...(p as any), visibilityid: Number(e.target.value) }))}
                    >
                      {visibilities.map((v) => (
                        <option key={String(v.id)} value={String(v.id)}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input className={INPUT} value={visibilityLabel} readOnly />
                  )}
                </Field>
              </div>
            </div>
          )}

          {/* Teams */}
          {tab === "teams" && (
            <div className={CARD}>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-lg font-semibold">Teams</h3>
                <AddTeamsModal tournamentid={tid} onAdded={() => setTeamsVersion((v) => v + 1)} />
              </div>

              {teamsLoading ? (
                <div className="text-sm text-muted-foreground">Loading teams…</div>
              ) : teamsErr ? (
                <div className="text-red-600 text-sm">{teamsErr}</div>
              ) : teams.length === 0 ? (
                <div className="text-sm text-muted-foreground">No teams yet. Use “Add Teams”.</div>
              ) : (
                <div className="overflow-x-auto rounded-xl border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/60">
                      <tr>
                        <th className="text-left font-medium p-3">Name</th>
                        <th className="text-left font-medium p-3">Season</th>
                      </tr>
                    </thead>
                    <tbody>
                      {teams.map((row, i) => (
                        <tr key={row.id ?? i} className="border-b last:border-b-0 hover:bg-muted/30">
                          <td className="p-3">{row.name}</td>
                          <td className="p-3">{row.season}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Pool Play */}
          {tab === "pool" && (
            <div className={CARD}>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-lg font-semibold">Pool Play</h3>
                <Button className="gap-2" onClick={() => setIsAddGameOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Add Game
                </Button>
              </div>

              {poolLoading ? (
                <div className="text-sm text-muted-foreground">Loading pool games…</div>
              ) : poolErr ? (
                <div className="text-red-600 text-sm">{poolErr}</div>
              ) : pool.length === 0 ? (
                <div className="text-sm text-muted-foreground">No pool games yet. Use “Add Game”.</div>
              ) : (
                <div className="overflow-x-auto rounded-xl border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/60">
                      <tr>
                        <th className="text-left font-medium p-3">Date</th>
                        <th className="text-left font-medium p-3">Time</th>
                        <th className="text-left font-medium p-3">Home</th>
                        <th className="text-left font-medium p-3">Away</th>
                        <th className="text-left font-medium p-3">Home Score</th>
                        <th className="text-left font-medium p-3">Away Score</th>
                        <th className="text-left font-medium p-3">Status</th>
                        <th className="text-right w-24 pr-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pool.map((g: PoolGameRow) => (
                        <tr key={g.id} className="border-b last:border-b-0 hover:bg-muted/30">
                          <td className="p-3">{formatMMDDYY(g.gamedate)}</td>
                          <td className="p-3">{formatHHMMAMPM(g.gamedate, g.gametime)}</td>
                          <td className="p-3">{g.hometeam}</td>
                          <td className="p-3">{g.awayteam}</td>
                          <td className="p-3">{g.homescore ?? "-"}</td>
                          <td className="p-3">{g.awayscore ?? "-"}</td>
                          <td className="p-3">{g.gamestatus ?? ""}</td>
                          <td className="p-3">
                            <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="shrink-0"
                                title="Edit game"
                                onClick={() => openEdit(g)}
                              >
                                <EditIcon />
                              </Button>
                              <span className="inline-flex shrink-0">
                                <PoolGameDeleteButton
                                  tournamentId={tid}
                                  gameId={g.id}
                                  onDeleted={(id) => setPool((prev) => prev.filter((x) => x.id !== id))}
                                />
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Add Game modal mount */}
          <AddGameModal
            open={isAddGameOpen}
            onOpenChange={setIsAddGameOpen}
            tournamentId={tid}
            onAdded={() => setPoolVersion((v) => v + 1)}
          />

          {/* Edit Game modal mount */}
          <AddGameModal
            open={editOpen}
            onOpenChange={(o) => {
              setEditOpen(o);
              if (!o) setEditInitial(undefined);
            }}
            tournamentId={tid}
            initial={editInitial}
            onAdded={() => setPoolVersion((v) => v + 1)}
          />

          {/* Standings & Bracket placeholders */}
          {tab === "standings" && (
            <div className={CARD}>
              <h3 className="mb-3 text-lg font-semibold">Pre-Bracket Standings</h3>
              <div className="text-sm text-muted-foreground">Handled by its own API/page soon.</div>
            </div>
          )}
          {tab === "bracket" && (
            <div className={CARD}>
              <h3 className="mb-3 text-lg font-semibold">Bracket</h3>
              <div className="text-sm text-muted-foreground">Handled by its own UI soon.</div>
            </div>
          )}

          {/* Tiebreakers tab */}
          {tab === "tiebreakers" && (
            <div className={CARD}>
              <h3 className="mb-3 text-lg font-semibold">Tiebreakers</h3>
              {Number.isFinite(tid) ? (
                <TiebreakersManager tournamentId={Number(tid)} />
              ) : (
                <div className="text-sm text-muted-foreground">Invalid tournament id.</div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
