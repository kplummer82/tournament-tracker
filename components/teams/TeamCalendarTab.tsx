// components/teams/TeamCalendarTab.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import listPlugin from "@fullcalendar/list";
import type { EventClickArg } from "@fullcalendar/core";
import type { DateClickArg } from "@fullcalendar/interaction";
import interactionPlugin from "@fullcalendar/interaction";
import { Plus, X, Pencil, Trash2, ExternalLink } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { CalendarGameRow, TeamRecord } from "@/pages/api/teams/[teamId]/games";

/* ── Constants ────────────────────────────────────────────────── */
const SOURCE_COLORS = {
  season:     "#3b82f6",
  tournament: "#f97316",
  scrimmage:  "#8b5cf6",
} as const;

const SOURCE_LABELS = {
  season:     "Season",
  tournament: "Tournament",
  scrimmage:  "Scrimmage",
} as const;

/* ── Types ────────────────────────────────────────────────────── */
type TeamSearchRow = { id: number; name: string; division?: string; season?: string };

type ScrimmageFormState = {
  gamedate: string;
  gametime: string;
  opponent_team_id: number | null;
  opponent_name: string;
  location: string;
  notes: string;
  gamestatusid: number | null;
};

const EMPTY_FORM: ScrimmageFormState = {
  gamedate: "",
  gametime: "",
  opponent_team_id: null,
  opponent_name: "",
  location: "",
  notes: "",
  gamestatusid: null,
};

/* ── OpponentInput ────────────────────────────────────────────── */
// Searches teams in the system; falls back to free text if no selection is made.
type OpponentInputProps = {
  teamId: string;
  selectedId: number | null;
  selectedName: string;
  onChange: (id: number | null, name: string) => void;
};

function OpponentInput({ teamId, selectedId, selectedName, onChange }: OpponentInputProps) {
  const [query, setQuery] = useState(selectedName);
  const [results, setResults] = useState<TeamSearchRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(selectedName);
  }, [selectedName]);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); setOpen(false); return; }
    setSearching(true);
    try {
      const res = await fetch(
        `/api/teams/search?q=${encodeURIComponent(q)}&pageSize=8&excludeTeamId=${teamId}`
      );
      const data = await res.json();
      const rows: TeamSearchRow[] = Array.isArray(data?.rows) ? data.rows : [];
      setResults(rows);
      setOpen(rows.length > 0);
    } catch {
      setResults([]); setOpen(false);
    } finally {
      setSearching(false);
    }
  }, [teamId]);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setQuery(q);
    onChange(null, q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(q), 350);
  };

  const pick = (row: TeamSearchRow) => {
    setQuery(row.name);
    setOpen(false);
    onChange(row.id, row.name);
  };

  const clear = () => {
    setQuery(""); setOpen(false);
    onChange(null, "");
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={containerRef}>
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={handleInput}
          onBlur={() => setOpen(false)}
          placeholder="Search teams or type opponent name…"
          className={cn(
            "w-full border border-border bg-input px-3 py-2 pr-8 text-sm text-foreground",
            "placeholder:text-muted-foreground focus:outline-none focus:border-primary",
            "focus:ring-2 focus:ring-primary/20 transition-colors",
            selectedId ? "text-primary" : ""
          )}
          style={{ fontFamily: "var(--font-body)" }}
        />
        {searching && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">…</span>
        )}
        {query && !searching && (
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); clear(); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {selectedId && (
        <p className="mt-0.5 text-[10px] text-primary" style={{ fontFamily: "var(--font-body)" }}>
          Linked to team in system (ID {selectedId})
        </p>
      )}
      {open && results.length > 0 && (
        <div className="absolute z-50 left-0 right-0 top-full mt-0.5 bg-card border border-border shadow-lg max-h-56 overflow-y-auto">
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); pick(r); }}
              className="w-full text-left px-3 py-2 hover:bg-elevated transition-colors duration-75"
            >
              <p className="text-sm font-medium" style={{ fontFamily: "var(--font-body)" }}>{r.name}</p>
              {(r.division || r.season) && (
                <p className="text-[10px] text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
                  {[r.division, r.season].filter(Boolean).join(" · ")}
                </p>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── AddScrimmageDialog ───────────────────────────────────────── */
type AddScrimmageDialogProps = {
  teamId: string;
  initialDate?: string;
  editingRow?: CalendarGameRow | null;
  onClose: () => void;
  onSaved: () => void;
};

function AddScrimmageDialog({
  teamId,
  initialDate,
  editingRow,
  onClose,
  onSaved,
}: AddScrimmageDialogProps) {
  const isEdit = !!editingRow;

  const [form, setForm] = useState<ScrimmageFormState>(() => {
    if (editingRow) {
      return {
        gamedate: editingRow.gamedate ?? "",
        gametime: editingRow.gametime ?? "",
        opponent_team_id: editingRow.opponent_team_id ?? null,
        opponent_name: editingRow.opponent_name_raw ?? editingRow.away_team ?? "",
        location: editingRow.location ?? "",
        notes: editingRow.notes ?? "",
        gamestatusid: editingRow.gamestatusid ?? null,
      };
    }
    return { ...EMPTY_FORM, gamedate: initialDate ?? "" };
  });

  const [statuses, setStatuses] = useState<{ id: number; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/gamestatuses")
      .then((r) => r.json())
      .then((d) => setStatuses(Array.isArray(d?.statuses) ? d.statuses : []))
      .catch(() => {});
  }, []);

  const set = (patch: Partial<ScrimmageFormState>) =>
    setForm((prev) => ({ ...prev, ...patch }));

  const handleSubmit = async () => {
    setError(null);
    const hasOpponent =
      form.opponent_team_id !== null || form.opponent_name.trim().length > 0;
    if (!hasOpponent) {
      setError("Opponent is required.");
      return;
    }

    setSubmitting(true);
    try {
      const body = {
        gamedate: form.gamedate || null,
        gametime: form.gametime || null,
        opponent_team_id: form.opponent_team_id,
        opponent_name: form.opponent_team_id ? null : form.opponent_name.trim() || null,
        location: form.location.trim() || null,
        notes: form.notes.trim() || null,
        gamestatusid: form.gamestatusid,
      };

      const url = isEdit
        ? `/api/teams/${teamId}/scrimmages/${editingRow!.id}`
        : `/api/teams/${teamId}/scrimmages`;
      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSubmitting(false);
    }
  };

  const INPUT = "w-full border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors";
  const LABEL = "block text-[10px] uppercase tracking-[0.08em] text-muted-foreground mb-1";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-card border border-border w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto"
        style={{ fontFamily: "var(--font-body)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2
            className="uppercase"
            style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "16px", letterSpacing: "-0.01em" }}
          >
            {isEdit ? "Edit Scrimmage" : "Add Scrimmage"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Date + Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Date</label>
              <input
                type="date"
                value={form.gamedate}
                onChange={(e) => set({ gamedate: e.target.value })}
                className={INPUT}
              />
            </div>
            <div>
              <label className={LABEL}>Time</label>
              <input
                type="time"
                value={form.gametime}
                onChange={(e) => set({ gametime: e.target.value })}
                className={INPUT}
              />
            </div>
          </div>

          {/* Opponent */}
          <div>
            <label className={LABEL}>Opponent *</label>
            <OpponentInput
              teamId={teamId}
              selectedId={form.opponent_team_id}
              selectedName={form.opponent_name}
              onChange={(id, name) => set({ opponent_team_id: id, opponent_name: name })}
            />
          </div>

          {/* Location */}
          <div>
            <label className={LABEL}>Location</label>
            <input
              type="text"
              value={form.location}
              onChange={(e) => set({ location: e.target.value })}
              placeholder="Field, park, gym…"
              className={INPUT}
            />
          </div>

          {/* Status */}
          {statuses.length > 0 && (
            <div>
              <label className={LABEL}>Status</label>
              <select
                value={form.gamestatusid ?? ""}
                onChange={(e) =>
                  set({ gamestatusid: e.target.value ? parseInt(e.target.value, 10) : null })
                }
                className={INPUT}
              >
                <option value="">— No status —</option>
                {statuses.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className={LABEL}>Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => set({ notes: e.target.value })}
              rows={3}
              placeholder="Optional notes…"
              className={cn(INPUT, "resize-none")}
            />
          </div>

          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.07em] border border-border text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="inline-flex items-center px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.07em] bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {submitting ? "Saving…" : isEdit ? "Save Changes" : "Add Scrimmage"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── EventDetailDialog ────────────────────────────────────────── */
type EventDetailDialogProps = {
  row: CalendarGameRow;
  teamId: string;
  onClose: () => void;
  onEdit: () => void;
  onDeleted: () => void;
};

function EventDetailDialog({ row, teamId, onClose, onEdit, onDeleted }: EventDetailDialogProps) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!confirm("Delete this scrimmage?")) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/teams/${teamId}/scrimmages/${row.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d?.error ?? `HTTP ${res.status}`);
      }
      onDeleted();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete.");
    } finally {
      setDeleting(false);
    }
  };

  const color = SOURCE_COLORS[row.source];
  const isHome = row.home !== null;
  const isScrimmage = row.source === "scrimmage";

  const dateDisplay = row.gamedate
    ? new Date(row.gamedate + "T12:00:00").toLocaleDateString("en-US", {
        weekday: "long", month: "long", day: "numeric", year: "numeric",
      })
    : "Date TBD";

  const timeDisplay = row.gametime
    ? new Date(`1970-01-01T${row.gametime}`).toLocaleTimeString("en-US", {
        hour: "numeric", minute: "2-digit",
      })
    : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-card border border-border w-full max-w-md mx-4"
        style={{ fontFamily: "var(--font-body)" }}
      >
        {/* Color bar + header */}
        <div className="h-1" style={{ background: color }} />
        <div className="flex items-start justify-between px-6 py-4 border-b border-border">
          <div>
            <span
              className="inline-block text-[9px] font-semibold uppercase tracking-[0.1em] px-1.5 py-0.5 mb-1"
              style={{ background: color + "22", color, border: `1px solid ${color}55` }}
            >
              {SOURCE_LABELS[row.source]}
            </span>
            <p
              className="text-base font-semibold"
              style={{ fontFamily: "var(--font-display)", fontWeight: 700, letterSpacing: "-0.01em" }}
            >
              {row.home_team} vs {row.away_team}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors mt-0.5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-3 text-sm">
          <div className="flex gap-2">
            <span className="text-muted-foreground w-20 shrink-0">Date</span>
            <span>{dateDisplay}{timeDisplay ? ` · ${timeDisplay}` : ""}</span>
          </div>

          {row.context_name && (
            <div className="flex gap-2">
              <span className="text-muted-foreground w-20 shrink-0">
                {row.source === "season" ? "Season" : "Tournament"}
              </span>
              <span>{row.context_name}</span>
            </div>
          )}

          {(row.homescore != null || row.awayscore != null) && (
            <div className="flex gap-2">
              <span className="text-muted-foreground w-20 shrink-0">Score</span>
              <span className="font-semibold">
                {row.home_team} {row.homescore ?? "—"} — {row.awayscore ?? "—"} {row.away_team}
              </span>
            </div>
          )}

          {row.gamestatus_label && (
            <div className="flex gap-2">
              <span className="text-muted-foreground w-20 shrink-0">Status</span>
              <span>{row.gamestatus_label}</span>
            </div>
          )}

          {isScrimmage && row.location && (
            <div className="flex gap-2">
              <span className="text-muted-foreground w-20 shrink-0">Location</span>
              <span>{row.location}</span>
            </div>
          )}

          {isScrimmage && row.notes && (
            <div className="flex gap-2">
              <span className="text-muted-foreground w-20 shrink-0">Notes</span>
              <span className="text-muted-foreground italic">{row.notes}</span>
            </div>
          )}

          {/* Link to season/tournament context */}
          {row.context_id && (
            <div className="pt-1">
              <Link
                href={
                  row.source === "season"
                    ? `/seasons/${row.context_id}`
                    : `/tournaments/${row.context_id}`
                }
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                onClick={onClose}
              >
                <ExternalLink className="h-3 w-3" />
                View {row.source === "season" ? "Season" : "Tournament"}
              </Link>
            </div>
          )}

          {/* Manage Game link — season/tournament only */}
          {row.source !== "scrimmage" && (
            <div className={row.context_id ? "" : "pt-1"}>
              <Link
                href={`/games/${row.source}/${row.id}?team=${teamId}`}
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                onClick={onClose}
              >
                <ExternalLink className="h-3 w-3" />
                Manage Game
              </Link>
            </div>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        {/* Actions — scrimmage only */}
        {isScrimmage && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-border">
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-destructive hover:opacity-80 transition-opacity disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {deleting ? "Deleting…" : "Delete"}
            </button>
            <button
              type="button"
              onClick={() => { onClose(); onEdit(); }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.07em] border border-border hover:bg-elevated transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── TeamCalendarTab ──────────────────────────────────────────── */
export default function TeamCalendarTab({ teamId }: { teamId: string }) {
  const [games, setGames] = useState<CalendarGameRow[]>([]);
  const [teamRecords, setTeamRecords] = useState<Record<number, TeamRecord>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const [addOpen, setAddOpen] = useState(false);
  const [addDate, setAddDate] = useState<string | undefined>();
  const [detailRow, setDetailRow] = useState<CalendarGameRow | null>(null);
  const [editRow, setEditRow] = useState<CalendarGameRow | null>(null);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!teamId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/teams/${teamId}/games`, { cache: "no-store" });
        if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) {
          setGames(Array.isArray(data?.games) ? data.games : []);
          setTeamRecords(data?.teamRecords ?? {});
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load games");
          setGames([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [teamId, version]);

  const fmtRecord = (rec: TeamRecord | undefined): string | null => {
    if (!rec) return null;
    return `${rec.w}-${rec.l}-${rec.t}`;
  };

  // Transform DB rows → FullCalendar events
  const myTeamId = Number(teamId);
  const calendarEvents = games.map((g) => {
    const isFinal = g.gamestatus_label?.toLowerCase() === "final";
    const hasScore = g.homescore != null && g.awayscore != null;

    // Determine outcome from this team's perspective
    let outcome: "W" | "L" | "T" | null = null;
    let outcomeColor = "";
    if (isFinal && hasScore) {
      const isHome = g.home === myTeamId;
      const myScore  = isHome ? g.homescore! : g.awayscore!;
      const oppScore = isHome ? g.awayscore! : g.homescore!;
      if (myScore > oppScore)       { outcome = "W"; outcomeColor = "#4ade80"; }
      else if (myScore < oppScore)  { outcome = "L"; outcomeColor = "#f87171"; }
      else                          { outcome = "T"; outcomeColor = "#9ca3af"; }
    }

    const scoreLabel = hasScore ? `${g.homescore}–${g.awayscore}` : null;
    const badge = isFinal ? scoreLabel : (g.gamestatus_label ?? null);

    return {
      id: g.uid,
      title: `${g.home_team} vs ${g.away_team}`,
      start: g.gamedate
        ? g.gametime
          ? `${g.gamedate}T${g.gametime}`
          : g.gamedate
        : undefined,
      color: SOURCE_COLORS[g.source],
      extendedProps: {
        row: g, badge, isFinal, outcome, outcomeColor, scoreLabel,
        homeRecord: g.home != null ? fmtRecord(teamRecords[g.home]) : null,
        awayRecord: g.away != null ? fmtRecord(teamRecords[g.away]) : null,
      },
    };
  });

  const handleDateClick = (info: DateClickArg) => {
    setAddDate(info.dateStr);
    setAddOpen(true);
  };

  const handleEventClick = (info: EventClickArg) => {
    const row = info.event.extendedProps.row as CalendarGameRow;
    setDetailRow(row);
  };

  return (
    <div>
      {/* Legend + Add button */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-4 flex-wrap">
          {(["season", "tournament", "scrimmage"] as const).map((s) => (
            <span
              key={s}
              className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.07em]"
              style={{ fontFamily: "var(--font-body)", color: SOURCE_COLORS[s] }}
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm shrink-0"
                style={{ background: SOURCE_COLORS[s] }}
              />
              {SOURCE_LABELS[s]}
            </span>
          ))}
        </div>
        <button
          type="button"
          onClick={() => { setAddDate(undefined); setAddOpen(true); }}
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-3 py-1.5 text-[11px] font-semibold tracking-[0.08em] uppercase hover:opacity-90 transition-opacity"
          style={{ fontFamily: "var(--font-body)" }}
        >
          <Plus className="h-3.5 w-3.5" />
          Add Scrimmage
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground py-8 text-center" style={{ fontFamily: "var(--font-body)" }}>
          Loading calendar…
        </p>
      ) : error ? (
        <p className="text-sm text-destructive py-8 text-center" style={{ fontFamily: "var(--font-body)" }}>
          {error}
        </p>
      ) : (
        <div className="fc-wrapper border border-border">
          <FullCalendar
            plugins={[dayGridPlugin, listPlugin, interactionPlugin]}
            initialView="listYear"
            headerToolbar={{
              left: "prev,next today",
              center: "title",
              right: "dayGridMonth,listYear",
            }}
            buttonText={{
              today: "Today",
              month: "Month",
              listYear: "List",
            }}
            events={calendarEvents}
            dateClick={handleDateClick}
            eventClick={handleEventClick}
            height="auto"
            noEventsContent="No games scheduled yet."
            eventContent={(arg) => {
              const badge: string | null = arg.event.extendedProps.badge;
              const isFinal: boolean = arg.event.extendedProps.isFinal;
              const outcome: "W" | "L" | "T" | null = arg.event.extendedProps.outcome;
              const outcomeColor: string = arg.event.extendedProps.outcomeColor;
              const scoreLabel: string | null = arg.event.extendedProps.scoreLabel;
              const isList = arg.view.type.startsWith("list");

              const homeRecord: string | null = arg.event.extendedProps.homeRecord;
              const awayRecord: string | null = arg.event.extendedProps.awayRecord;
              const row: CalendarGameRow = arg.event.extendedProps.row;

              if (isList) {
                return (
                  <div style={{ display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between", gap: "12px", minWidth: 0 }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 1 }}>
                      {row.home_team}
                      {homeRecord && (
                        <span style={{ fontSize: "9px", color: "var(--color-muted-foreground)", marginLeft: "3px", fontFamily: "var(--font-body)" }}>
                          ({homeRecord})
                        </span>
                      )}
                      <span style={{ margin: "0 5px", color: "var(--color-muted-foreground)" }}>vs</span>
                      {row.away_team}
                      {awayRecord && (
                        <span style={{ fontSize: "9px", color: "var(--color-muted-foreground)", marginLeft: "3px", fontFamily: "var(--font-body)" }}>
                          ({awayRecord})
                        </span>
                      )}
                    </span>
                    {isFinal && outcome ? (
                      // Win / Loss / Tie outcome chip + score
                      <span style={{ display: "flex", alignItems: "center", gap: "5px", flexShrink: 0 }}>
                        <span style={{
                          background: outcomeColor + "28",
                          border: `1px solid ${outcomeColor}55`,
                          color: outcomeColor,
                          fontSize: "9px",
                          fontWeight: 800,
                          letterSpacing: "0.08em",
                          padding: "1px 5px",
                          fontFamily: "var(--font-body)",
                          lineHeight: "14px",
                        }}>
                          {outcome}
                        </span>
                        {scoreLabel && (
                          <span style={{
                            fontSize: "11px",
                            fontWeight: 700,
                            color: outcomeColor,
                            fontFamily: "var(--font-display)",
                            letterSpacing: "-0.01em",
                            whiteSpace: "nowrap",
                          }}>
                            {scoreLabel}
                          </span>
                        )}
                      </span>
                    ) : badge ? (
                      // Non-final status label
                      <span style={{
                        fontSize: "10px",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        color: "var(--muted-foreground)",
                        fontFamily: "var(--font-body)",
                        whiteSpace: "nowrap",
                        flexShrink: 0,
                      }}>
                        {badge}
                      </span>
                    ) : null}
                  </div>
                );
              }

              // dayGrid month view — replicate FC's default structure
              const monthSuffix = isFinal && outcome
                ? ` · ${outcome} ${scoreLabel ?? ""}`.trimEnd()
                : badge ? ` · ${badge}` : "";
              return (
                <>
                  {arg.timeText && (
                    <span className="fc-event-time">{arg.timeText}</span>
                  )}
                  <span className="fc-event-title">
                    {arg.event.title}{monthSuffix}
                  </span>
                </>
              );
            }}
          />
        </div>
      )}

      {/* Add / Edit scrimmage dialog */}
      {(addOpen || editRow) && (
        <AddScrimmageDialog
          teamId={teamId}
          initialDate={addOpen ? addDate : undefined}
          editingRow={editRow}
          onClose={() => { setAddOpen(false); setEditRow(null); setAddDate(undefined); }}
          onSaved={refresh}
        />
      )}

      {/* Event detail dialog */}
      {detailRow && (
        <EventDetailDialog
          row={detailRow}
          teamId={teamId}
          onClose={() => setDetailRow(null)}
          onEdit={() => setEditRow(detailRow)}
          onDeleted={refresh}
        />
      )}
    </div>
  );
}
