import { useRouter } from "next/router";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, Check, X, Minus, Copy, Save, Shuffle, GripVertical } from "lucide-react";
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors } from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { formatMMDDYY, formatHHMMAMPM } from "@/lib/datetime";
import type { GameDetail } from "@/pages/api/games/[source]/[gameId]";

/* ─── Types ──────────────────────────────────────────────────── */

type TabKey = "overview" | "confirmations" | "batting" | "defense";

type ConfirmationRow = {
  roster_id: number;
  first_name: string;
  last_name: string;
  jersey_number: number | null;
  status: "confirmed" | "declined" | "pending";
};

type BattingRow = {
  bat_order: number;
  roster_id: number;
  first_name: string;
  last_name: string;
  jersey_number: number | null;
};

type DefenseRow = {
  inning: number;
  position: string;
  roster_id: number;
  first_name: string;
  last_name: string;
  jersey_number: number | null;
};

const POSITIONS = ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"] as const;
const INNINGS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

/* ─── Shared styles ──────────────────────────────────────────── */

const labelCls = "text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground";
const valueCls = "text-sm font-medium";

/* ─── OverviewTab ────────────────────────────────────────────── */

function OverviewTab({ game }: { game: GameDetail }) {
  const hasScore = game.homescore != null && game.awayscore != null;
  const isFinal = game.gamestatus_label?.toLowerCase() === "final";
  const contextHref = game.source === "season"
    ? `/seasons/${game.context_id}`
    : `/tournaments/${game.context_id}`;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-6">
          <h2
            className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-4"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Game Info
          </h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <dt className={labelCls}>Date</dt>
              <dd className={valueCls}>{game.gamedate ? formatMMDDYY(game.gamedate) : "TBD"}</dd>
            </div>
            <div>
              <dt className={labelCls}>Time</dt>
              <dd className={valueCls}>
                {game.gametime ? formatHHMMAMPM(game.gamedate ?? undefined, game.gametime) : "TBD"}
              </dd>
            </div>
            <div>
              <dt className={labelCls}>Status</dt>
              <dd className={valueCls}>{game.gamestatus_label ?? "—"}</dd>
            </div>
            {hasScore && (
              <div>
                <dt className={labelCls}>Score</dt>
                <dd className={valueCls}>
                  <span className={cn(isFinal && game.homescore! > game.awayscore! && "text-primary")}>{game.homescore}</span>
                  <span className="text-muted-foreground mx-1">–</span>
                  <span className={cn(isFinal && game.awayscore! > game.homescore! && "text-primary")}>{game.awayscore}</span>
                </dd>
              </div>
            )}
            <div>
              <dt className={labelCls}>{game.source === "season" ? "Season" : "Tournament"}</dt>
              <dd className={valueCls}>
                {game.context_id ? (
                  <Link href={contextHref} className="text-primary hover:underline">
                    {game.context_name ?? `#${game.context_id}`}
                  </Link>
                ) : "—"}
              </dd>
            </div>
            {game.location && (
              <div>
                <dt className={labelCls}>Location</dt>
                <dd className={valueCls}>{game.location}</dd>
              </div>
            )}
            {game.field && (
              <div>
                <dt className={labelCls}>Field</dt>
                <dd className={valueCls}>{game.field}</dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <h2
            className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-4"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Teams
          </h2>
          <div className="flex items-center gap-4">
            {game.home ? (
              <Link href={`/teams/${game.home}`} className="text-primary hover:underline font-medium">
                {game.home_team}
              </Link>
            ) : (
              <span className="text-muted-foreground font-medium">TBD</span>
            )}
            <span className="text-xs text-muted-foreground uppercase tracking-widest">vs</span>
            {game.away ? (
              <Link href={`/teams/${game.away}`} className="text-primary hover:underline font-medium">
                {game.away_team}
              </Link>
            ) : (
              <span className="text-muted-foreground font-medium">TBD</span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── ConfirmationsTab ───────────────────────────────────────── */

function ConfirmationsTab({
  source, gameId, teamId,
}: {
  source: string; gameId: number; teamId: number;
}) {
  const [rows, setRows] = useState<ConfirmationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/games/${source}/${gameId}/confirmations?team=${teamId}`);
      const data = await res.json();
      setRows(Array.isArray(data.confirmations) ? data.confirmations : []);
    } catch { /* silent */ }
    setLoading(false);
  }, [source, gameId, teamId]);

  useEffect(() => { load(); }, [load]);

  const toggle = async (rosterId: number, status: "confirmed" | "declined" | "pending") => {
    setSaving(rosterId);
    // Optimistic
    setRows((prev) => prev.map((r) => r.roster_id === rosterId ? { ...r, status } : r));
    try {
      await fetch(`/api/games/${source}/${gameId}/confirmations`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team_id: teamId, confirmations: [{ roster_id: rosterId, status }] }),
      });
    } catch {
      load(); // revert on error
    }
    setSaving(null);
  };

  const confirmed = rows.filter((r) => r.status === "confirmed").length;

  if (loading) return <p className="text-sm text-muted-foreground py-4">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          <span className="text-foreground font-semibold">{confirmed}</span> of{" "}
          <span className="text-foreground font-semibold">{rows.length}</span> players confirmed
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="p-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground w-12">#</th>
                <th className="p-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Player</th>
                <th className="p-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.roster_id} className="border-b border-border/50 last:border-0 hover:bg-elevated/50 transition-colors">
                  <td className="p-3 text-muted-foreground font-mono text-xs">
                    {r.jersey_number ?? "—"}
                  </td>
                  <td className="p-3 font-medium">
                    {r.first_name} {r.last_name}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => toggle(r.roster_id, "confirmed")}
                        disabled={saving === r.roster_id}
                        className={cn(
                          "h-7 w-7 flex items-center justify-center border transition-colors",
                          r.status === "confirmed"
                            ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400"
                            : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                        )}
                        title="Confirmed"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => toggle(r.roster_id, "declined")}
                        disabled={saving === r.roster_id}
                        className={cn(
                          "h-7 w-7 flex items-center justify-center border transition-colors",
                          r.status === "declined"
                            ? "bg-red-500/15 border-red-500/40 text-red-400"
                            : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                        )}
                        title="Declined"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => toggle(r.roster_id, "pending")}
                        disabled={saving === r.roster_id}
                        className={cn(
                          "h-7 w-7 flex items-center justify-center border transition-colors",
                          r.status === "pending"
                            ? "bg-amber-500/15 border-amber-500/40 text-amber-400"
                            : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                        )}
                        title="Pending"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={3} className="p-6 text-center text-sm text-muted-foreground">
                    No players on roster.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── BattingOrderTab ────────────────────────────────────────── */

function SortableBattingRow({ row, index }: { row: BattingRow; index: number }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: row.roster_id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    position: "relative" as const,
  };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={cn(
        "border-b border-border/50 last:border-0 transition-colors",
        isDragging ? "bg-elevated shadow-lg opacity-90" : "hover:bg-elevated/50"
      )}
    >
      <td className="p-3 w-8">
        <button
          type="button"
          className="h-6 w-6 flex items-center justify-center text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing touch-none"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      </td>
      <td className="p-3 w-12">
        <span
          className="inline-flex items-center justify-center h-6 w-6 text-[11px] font-bold bg-primary/10 text-primary border border-primary/20"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {index + 1}
        </span>
      </td>
      <td className="p-3 text-muted-foreground font-mono text-xs w-12">
        {row.jersey_number ?? "—"}
      </td>
      <td className="p-3 font-medium">
        {row.first_name} {row.last_name}
      </td>
    </tr>
  );
}

function BattingOrderTab({
  source, gameId, teamId,
}: {
  source: string; gameId: number; teamId: number;
}) {
  const [order, setOrder] = useState<BattingRow[]>([]);
  const [confirmed, setConfirmed] = useState<ConfirmationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [orderRes, confRes] = await Promise.all([
        fetch(`/api/games/${source}/${gameId}/batting-order?team=${teamId}`),
        fetch(`/api/games/${source}/${gameId}/confirmations?team=${teamId}`),
      ]);
      const orderData = await orderRes.json();
      const confData = await confRes.json();
      setOrder(Array.isArray(orderData.order) ? orderData.order : []);
      setConfirmed(
        (Array.isArray(confData.confirmations) ? confData.confirmations : [])
          .filter((c: ConfirmationRow) => c.status === "confirmed")
      );
    } catch { /* silent */ }
    setLoading(false);
    setDirty(false);
  }, [source, gameId, teamId]);

  useEffect(() => { load(); }, [load]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setOrder((prev) => {
      const oldIdx = prev.findIndex((r) => r.roster_id === active.id);
      const newIdx = prev.findIndex((r) => r.roster_id === over.id);
      const reordered = arrayMove(prev, oldIdx, newIdx);
      return reordered.map((r, i) => ({ ...r, bat_order: i + 1 }));
    });
    setDirty(true);
  };

  const autoFill = () => {
    const sorted = [...confirmed].sort((a, b) => {
      if (a.jersey_number == null && b.jersey_number == null) return 0;
      if (a.jersey_number == null) return 1;
      if (b.jersey_number == null) return -1;
      return a.jersey_number - b.jersey_number;
    });
    setOrder(sorted.map((c, i) => ({
      bat_order: i + 1,
      roster_id: c.roster_id,
      first_name: c.first_name,
      last_name: c.last_name,
      jersey_number: c.jersey_number,
    })));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await fetch(`/api/games/${source}/${gameId}/batting-order`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          team_id: teamId,
          order: order.map((r) => ({ roster_id: r.roster_id, bat_order: r.bat_order })),
        }),
      });
      setDirty(false);
    } catch { /* silent */ }
    setSaving(false);
  };

  if (loading) return <p className="text-sm text-muted-foreground py-4">Loading…</p>;

  if (confirmed.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Set player confirmations first before building a batting order.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm text-muted-foreground">
          {order.length} of {confirmed.length} confirmed players in lineup
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={autoFill}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.07em] border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
          >
            <Shuffle className="h-3 w-3" />
            Auto-fill
          </button>
          <button
            onClick={save}
            disabled={!dirty || saving}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.07em] border transition-colors",
              dirty
                ? "border-primary text-primary hover:bg-primary/10"
                : "border-border text-muted-foreground cursor-not-allowed opacity-50"
            )}
          >
            <Save className="h-3 w-3" />
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="p-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground w-8"></th>
                <th className="p-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground w-12">Pos</th>
                <th className="p-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground w-12">#</th>
                <th className="p-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Player</th>
              </tr>
            </thead>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={order.map((r) => r.roster_id)} strategy={verticalListSortingStrategy}>
                <tbody>
                  {order.map((r, idx) => (
                    <SortableBattingRow key={r.roster_id} row={r} index={idx} />
                  ))}
                  {order.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-sm text-muted-foreground">
                        No batting order set. Click &quot;Auto-fill&quot; to populate from confirmed players.
                      </td>
                    </tr>
                  )}
                </tbody>
              </SortableContext>
            </DndContext>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── PlayerCombobox ──────────────────────────────────────────── */

function playerLabel(c: ConfirmationRow) {
  const name = `${c.first_name} ${c.last_name}`;
  return c.jersey_number != null ? `#${c.jersey_number} ${name}` : name;
}

function PlayerCombobox({
  players,
  value,
  usedIds,
  onChange,
}: {
  players: ConfirmationRow[];
  value: number | null;
  usedIds: Set<number>;
  onChange: (id: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hlIdx, setHlIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedPlayer = value != null ? players.find((p) => p.roster_id === value) : null;
  const displayText = selectedPlayer ? playerLabel(selectedPlayer) : "";

  const filtered = players.filter((p) => {
    if (!query) return true;
    const q = query.toLowerCase();
    const full = `${p.first_name} ${p.last_name}`.toLowerCase();
    const jersey = p.jersey_number != null ? `#${p.jersey_number}` : "";
    return full.includes(q) || jersey.startsWith(q) || p.first_name.toLowerCase().startsWith(q) || p.last_name.toLowerCase().startsWith(q);
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
          const pick = filtered[hlIdx];
          if (!usedIds.has(pick.roster_id) || pick.roster_id === value) {
            selectPlayer(pick.roster_id);
          }
        }
        break;
      case "Escape":
        e.preventDefault();
        setOpen(false);
        setQuery("");
        break;
      case "Tab":
        // On Tab, select the highlighted item if dropdown is open, then let focus advance naturally
        if (filtered.length > 0 && hlIdx < filtered.length && query) {
          const pick = filtered[hlIdx];
          if (!usedIds.has(pick.roster_id) || pick.roster_id === value) {
            onChange(pick.roster_id);
          }
        }
        setOpen(false);
        setQuery("");
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
    <div ref={containerRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        value={open ? query : displayText}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder="—"
        className={cn(
          "w-full px-1.5 py-1 text-xs border border-border bg-transparent",
          "focus:outline-none focus:border-primary transition-colors",
          value != null ? "text-foreground" : "text-muted-foreground"
        )}
      />
      {open && (
        <div className="absolute z-20 left-0 right-0 top-full mt-0.5 bg-card border border-border shadow-lg max-h-40 overflow-y-auto">
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
                    if (!isUsed) selectPlayer(p.roster_id);
                  }}
                  onMouseEnter={() => setHlIdx(i)}
                  className={cn(
                    "w-full text-left px-2 py-1 text-xs transition-colors",
                    isHl && !isUsed && "bg-elevated",
                    isUsed && "text-muted-foreground/40 cursor-not-allowed",
                    !isUsed && !isHl && "hover:bg-elevated/50"
                  )}
                  disabled={isUsed}
                >
                  {playerLabel(p)}
                  {isUsed && <span className="ml-1 text-[9px]">(in use)</span>}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

/* ─── DefenseTab ─────────────────────────────────────────────── */

type LineupMap = Record<string, number>; // key: "inning-position" → roster_id

function DefenseTab({
  source, gameId, teamId,
}: {
  source: string; gameId: number; teamId: number;
}) {
  const [lineup, setLineup] = useState<LineupMap>({});
  const [confirmed, setConfirmed] = useState<ConfirmationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [numInnings, setNumInnings] = useState(6);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [lineupRes, confRes] = await Promise.all([
        fetch(`/api/games/${source}/${gameId}/defensive-lineup?team=${teamId}`),
        fetch(`/api/games/${source}/${gameId}/confirmations?team=${teamId}`),
      ]);
      const lineupData = await lineupRes.json();
      const confData = await confRes.json();

      const rows: DefenseRow[] = Array.isArray(lineupData.lineup) ? lineupData.lineup : [];
      const map: LineupMap = {};
      let maxInning = 6;
      for (const r of rows) {
        map[`${r.inning}-${r.position}`] = r.roster_id;
        if (r.inning > maxInning) maxInning = r.inning;
      }
      setLineup(map);
      setNumInnings(maxInning);
      setConfirmed(
        (Array.isArray(confData.confirmations) ? confData.confirmations : [])
          .filter((c: ConfirmationRow) => c.status === "confirmed")
      );
    } catch { /* silent */ }
    setLoading(false);
    setDirty(false);
  }, [source, gameId, teamId]);

  useEffect(() => { load(); }, [load]);

  const activeInnings = INNINGS.slice(0, numInnings);

  const assign = (inning: number, position: string, rosterId: number | null) => {
    setLineup((prev) => {
      const next = { ...prev };
      const key = `${inning}-${position}`;
      if (rosterId === null) {
        delete next[key];
      } else {
        // Remove this player from any other position in this inning
        for (const pos of POSITIONS) {
          const k = `${inning}-${pos}`;
          if (next[k] === rosterId && k !== key) delete next[k];
        }
        next[key] = rosterId;
      }
      return next;
    });
    setDirty(true);
  };

  const copyFromPrevious = (inning: number) => {
    if (inning <= 1) return;
    setLineup((prev) => {
      const next = { ...prev };
      for (const pos of POSITIONS) {
        const prevKey = `${inning - 1}-${pos}`;
        const curKey = `${inning}-${pos}`;
        if (prev[prevKey] != null) {
          next[curKey] = prev[prevKey];
        }
      }
      return next;
    });
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    const entries: { inning: number; position: string; roster_id: number }[] = [];
    for (const [key, rosterId] of Object.entries(lineup)) {
      const [inn, pos] = key.split("-");
      entries.push({ inning: parseInt(inn, 10), position: pos, roster_id: rosterId });
    }
    try {
      await fetch(`/api/games/${source}/${gameId}/defensive-lineup`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team_id: teamId, lineup: entries }),
      });
      setDirty(false);
    } catch { /* silent */ }
    setSaving(false);
  };

  const playerName = (rosterId: number) => {
    const p = confirmed.find((c) => c.roster_id === rosterId);
    if (!p) return "?";
    return playerLabel(p);
  };

  const playersInInning = (inning: number): Set<number> => {
    const used = new Set<number>();
    for (const pos of POSITIONS) {
      const id = lineup[`${inning}-${pos}`];
      if (id != null) used.add(id);
    }
    return used;
  };

  if (loading) return <p className="text-sm text-muted-foreground py-4">Loading…</p>;

  if (confirmed.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Set player confirmations first before building a defensive lineup.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">Innings:</p>
          <div className="flex items-center gap-1">
            {INNINGS.map((inn) => (
              <button
                key={inn}
                onClick={() => setNumInnings(inn)}
                className={cn(
                  "h-6 w-6 text-[11px] font-bold border transition-colors",
                  inn <= numInnings
                    ? "bg-primary/10 text-primary border-primary/30"
                    : "text-muted-foreground border-border hover:border-foreground/30"
                )}
                style={{ fontFamily: "var(--font-display)" }}
              >
                {inn}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={save}
          disabled={!dirty || saving}
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.07em] border transition-colors",
            dirty
              ? "border-primary text-primary hover:bg-primary/10"
              : "border-border text-muted-foreground cursor-not-allowed opacity-50"
          )}
        >
          <Save className="h-3 w-3" />
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      <div className="overflow-x-auto">
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-xs" style={{ fontFamily: "var(--font-body)" }}>
              <thead>
                <tr className="border-b border-border">
                  <th className="p-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground text-left sticky left-0 bg-card z-10 min-w-[48px]">
                    Pos
                  </th>
                  {activeInnings.map((inn) => (
                    <th key={inn} className="p-2 text-center min-w-[120px]">
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                          Inn {inn}
                        </span>
                        {inn > 1 && (
                          <button
                            onClick={() => copyFromPrevious(inn)}
                            className="inline-flex items-center gap-0.5 text-[9px] text-muted-foreground hover:text-foreground transition-colors"
                            title={`Copy from inning ${inn - 1}`}
                          >
                            <Copy className="h-2.5 w-2.5" />
                            Copy
                          </button>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {POSITIONS.map((pos) => (
                  <tr key={pos} className="border-b border-border/50 last:border-0">
                    <td
                      className="p-2 font-bold text-[11px] text-muted-foreground sticky left-0 bg-card z-10"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      {pos}
                    </td>
                    {activeInnings.map((inn) => {
                      const key = `${inn}-${pos}`;
                      const assigned = lineup[key] ?? null;
                      const usedInInning = playersInInning(inn);

                      return (
                        <td key={key} className="p-1">
                          <PlayerCombobox
                            players={confirmed}
                            value={assigned}
                            usedIds={usedInInning}
                            onChange={(id) => assign(inn, pos, id)}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      {/* Unassigned players per inning summary */}
      <Card>
        <CardContent className="p-4">
          <h3
            className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-2"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Bench / Unassigned
          </h3>
          <div className="space-y-1">
            {activeInnings.map((inn) => {
              const used = playersInInning(inn);
              const unassigned = confirmed.filter((c) => !used.has(c.roster_id));
              if (unassigned.length === 0) return null;
              return (
                <div key={inn} className="flex items-start gap-2 text-xs">
                  <span className="text-muted-foreground font-semibold shrink-0 w-12">Inn {inn}:</span>
                  <span className="text-muted-foreground">
                    {unassigned.map((c) => playerLabel(c)).join(", ")}
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── Team Picker ────────────────────────────────────────────── */

function TeamPickerCard({
  game,
  manageable,
  onSelect,
}: {
  game: GameDetail;
  manageable: number[];
  onSelect: (id: number) => void;
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <h3
          className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-4"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Which team are you managing?
        </h3>
        <div className="flex items-center gap-3">
          {manageable.map((id) => {
            const name = id === game.home ? game.home_team : game.away_team;
            const label = id === game.home ? "Home" : "Away";
            return (
              <button
                key={id}
                onClick={() => onSelect(id)}
                className="flex-1 py-3 px-4 border border-border text-sm font-medium hover:border-primary hover:text-primary transition-colors text-center"
              >
                <span className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-1">
                  {label}
                </span>
                {name}
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Permissions helper ─────────────────────────────────────── */

/**
 * Returns the team IDs the current user can manage for this game.
 * Currently all users are admins → both teams.
 * When role-based access is added, wire this to real permissions.
 */
function getManageableTeams(game: GameDetail): number[] {
  const teams: number[] = [];
  if (game.home) teams.push(game.home);
  if (game.away) teams.push(game.away);
  return teams;
}

/* ─── Main Page ──────────────────────────────────────────────── */

export default function GameDetailPage() {
  const router = useRouter();
  const source = router.query.source as string | undefined;
  const gameIdRaw = router.query.gameId as string | undefined;
  const teamIdRaw = router.query.team as string | undefined;
  const returnTo = router.query.returnTo as string | undefined;

  const gameId = gameIdRaw ? parseInt(gameIdRaw, 10) : NaN;
  const teamIdFromUrl = teamIdRaw ? parseInt(teamIdRaw, 10) : NaN;

  const [game, setGame] = useState<GameDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("overview");
  const [managingTeamId, setManagingTeamId] = useState<number>(NaN);

  useEffect(() => {
    if (!source || !Number.isFinite(gameId)) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/games/${source}/${gameId}`);
        if (!res.ok) {
          if (res.status === 404) throw new Error("Game not found");
          throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();
        if (!cancelled) setGame(data.game ?? null);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load game");
          setGame(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [source, gameId]);

  // Auto-select team: use URL param if valid, otherwise auto-pick if only one manageable team
  useEffect(() => {
    if (!game) return;
    const manageable = getManageableTeams(game);
    if (Number.isFinite(teamIdFromUrl) && manageable.includes(teamIdFromUrl)) {
      setManagingTeamId(teamIdFromUrl);
    } else if (manageable.length === 1) {
      setManagingTeamId(manageable[0]);
    }
  }, [game, teamIdFromUrl]);

  const selectTeam = (id: number) => {
    setManagingTeamId(id);
    // Update URL so it's shareable / survives refresh
    const url = new URL(window.location.href);
    url.searchParams.set("team", String(id));
    router.replace(url.pathname + url.search, undefined, { shallow: true });
  };

  const manageable = game ? getManageableTeams(game) : [];
  const needsTeamPicker = !Number.isFinite(managingTeamId) && manageable.length > 1;

  const backHref = returnTo ?? (Number.isFinite(managingTeamId) ? `/teams/${managingTeamId}` : source === "tournament" && game ? `/tournaments/${game.context_id}/pool` : game?.source === "season" && game?.context_id ? `/seasons/${game.context_id}/schedule` : "/teams");
  const backLabel = returnTo ? "Back" : Number.isFinite(managingTeamId) ? "Back to team" : source === "tournament" ? "Back to pool" : game?.source === "season" ? "Back to schedule" : "Back";
  const isMyHome = game ? game.home === managingTeamId : false;
  const myTeamName = game ? (isMyHome ? game.home_team : game.away_team) : "";

  if (router.isFallback || loading) {
    return (
      <div className="min-h-screen">
        <Header />
        <main className="p-4 sm:p-6 md:p-8 mx-auto max-w-7xl">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </main>
      </div>
    );
  }

  if (error || !game) {
    return (
      <div className="min-h-screen">
        <Header />
        <main className="p-4 sm:p-6 md:p-8 mx-auto max-w-7xl space-y-4">
          <Link href={backHref} className="text-sm text-primary hover:underline">
            <ArrowLeft className="inline h-3.5 w-3.5 mr-1" />
            {backLabel}
          </Link>
          <Card className="border-destructive/40">
            <CardContent className="p-6 text-destructive">{error ?? "Game not found."}</CardContent>
          </Card>
        </main>
      </div>
    );
  }

  const sourceLabel = game.source === "season" ? "SEASON" : "TOURNAMENT";
  const sourceColor = game.source === "season" ? "#6aa5e9" : "#e9a56a";

  return (
    <div className="min-h-screen">
      <Header />
      <main className="p-4 sm:p-6 md:p-8 mx-auto max-w-7xl space-y-6">
        <Link href={backHref} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <ArrowLeft className="h-3.5 w-3.5" />
          {backLabel}
        </Link>

        {/* Game header */}
        <div>
          <span
            className="inline-block text-[9px] font-semibold uppercase tracking-[0.12em] px-1.5 py-0.5 mb-2"
            style={{
              background: sourceColor + "18",
              color: sourceColor,
              border: `1px solid ${sourceColor}44`,
              fontFamily: "var(--font-display)",
            }}
          >
            {sourceLabel} GAME
          </span>

          <h1
            className="uppercase"
            style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "28px", letterSpacing: "-0.02em", lineHeight: 1 }}
          >
            {game.home_team} vs {game.away_team}
          </h1>

          <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
            {game.gamedate && <span>{formatMMDDYY(game.gamedate)}</span>}
            {game.gametime && (
              <>
                <span className="text-border">|</span>
                <span>{formatHHMMAMPM(game.gamedate ?? undefined, game.gametime)}</span>
              </>
            )}
            {game.gamestatus_label && (
              <>
                <span className="text-border">|</span>
                <span>{game.gamestatus_label}</span>
              </>
            )}
            {game.context_name && (
              <>
                <span className="text-border">|</span>
                <span>{game.context_name}</span>
              </>
            )}
          </div>

          {Number.isFinite(managingTeamId) && myTeamName && (
            <p className="text-xs text-muted-foreground mt-1" style={{ fontFamily: "var(--font-body)" }}>
              Managing as <span className="text-foreground font-medium">{myTeamName}</span>
              {manageable.length > 1 && (
                <button
                  onClick={() => {
                    setManagingTeamId(NaN);
                    const url = new URL(window.location.href);
                    url.searchParams.delete("team");
                    router.replace(url.pathname + url.search, undefined, { shallow: true });
                  }}
                  className="ml-2 text-primary hover:underline"
                >
                  Switch
                </button>
              )}
            </p>
          )}
        </div>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
          <TabsList className="bg-muted/60 border border-border p-1 rounded-lg">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="confirmations">Confirmations</TabsTrigger>
            <TabsTrigger value="batting">Batting Order</TabsTrigger>
            <TabsTrigger value="defense">Defense</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6">
            <OverviewTab game={game} />
          </TabsContent>

          <TabsContent value="confirmations" className="mt-6">
            {Number.isFinite(managingTeamId) ? (
              <ConfirmationsTab source={source!} gameId={gameId} teamId={managingTeamId} />
            ) : (
              <TeamPickerCard game={game} manageable={manageable} onSelect={selectTeam} />
            )}
          </TabsContent>

          <TabsContent value="batting" className="mt-6">
            {Number.isFinite(managingTeamId) ? (
              <BattingOrderTab source={source!} gameId={gameId} teamId={managingTeamId} />
            ) : (
              <TeamPickerCard game={game} manageable={manageable} onSelect={selectTeam} />
            )}
          </TabsContent>

          <TabsContent value="defense" className="mt-6">
            {Number.isFinite(managingTeamId) ? (
              <DefenseTab source={source!} gameId={gameId} teamId={managingTeamId} />
            ) : (
              <TeamPickerCard game={game} manageable={manageable} onSelect={selectTeam} />
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
