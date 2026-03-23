// pages/teams/[teamId].tsx
import { useRouter } from "next/router";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Check, Loader2, Music, Pencil, Plus, Trash2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { TeamDetail, TeamTournament } from "@/pages/api/teams/[teamId]";
import type { RosterRow } from "@/pages/api/teams/[teamId]/roster";
import TeamCalendarTab from "@/components/teams/TeamCalendarTab";
import { usePermissions } from "@/lib/hooks/usePermissions";
import ManageAccessPanel from "@/components/ManageAccessPanel";

type TabKey = "overview" | "roster" | "calendar";

type Draft = {
  jersey_number: string;
  first_name: string;
  last_name: string;
  role: "player" | "staff" | "";
};

const BLANK_DRAFT: Draft = { jersey_number: "", first_name: "", last_name: "", role: "" };

/* ─── iTunes search ──────────────────────────────────────────── */
type ItunesTrack = {
  trackId: number;
  trackName: string;
  artistName: string;
  collectionName?: string;
  artworkUrl60?: string;
};

function appleMusicUrl(itunesId: number): string {
  return `https://music.apple.com/us/song/${itunesId}`;
}

async function searchItunes(q: string): Promise<ItunesTrack[]> {
  if (!q.trim()) return [];
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=song&limit=8&media=music`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("iTunes API error");
  const json = await res.json();
  return Array.isArray(json.results) ? json.results : [];
}

/* ─── WalkupSongInput ─────────────────────────────────────────── */
type WalkupSongInputProps = {
  value: string;
  itunesId: number | null;
  onChange: (song: string, itunesId: number | null) => void;
  onBlurCommit: () => void;
};

function WalkupSongInput({ value, itunesId: _itunesId, onChange, onBlurCommit }: WalkupSongInputProps) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<ItunesTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selected, setSelected] = useState(!!_itunesId);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // sync from parent when it changes externally
  useEffect(() => {
    setQuery(value);
    setSelected(!!_itunesId);
  }, [value, _itunesId]);

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); setDropdownOpen(false); return; }
    setSearching(true);
    try {
      const tracks = await searchItunes(q);
      setResults(tracks);
      setDropdownOpen(tracks.length > 0);
    } catch {
      setResults([]);
      setDropdownOpen(false);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setQuery(q);
    setSelected(false);
    onChange(q, null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(q), 400);
  };

  const pickTrack = (t: ItunesTrack) => {
    const label = `${t.trackName} — ${t.artistName}`;
    setQuery(label);
    setSelected(true);
    setDropdownOpen(false);
    onChange(label, t.trackId);
    setTimeout(onBlurCommit, 0);
  };

  const clearSong = () => {
    setQuery("");
    setSelected(false);
    setDropdownOpen(false);
    onChange("", null);
    setTimeout(onBlurCommit, 0);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={containerRef}>
      <div className="relative">
        <Music className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={handleInput}
          onBlur={() => { setDropdownOpen(false); onBlurCommit(); }}
          placeholder="Search or type a song…"
          className={cn(
            "w-full pl-7 pr-7 py-1.5 text-xs bg-input-bg border border-border",
            "focus:outline-none focus:border-primary transition-colors duration-100",
            selected ? "text-primary" : "text-foreground"
          )}
          style={{ fontFamily: "var(--font-body)" }}
        />
        {searching && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">…</span>
        )}
        {query && !searching && (
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); clearSong(); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {dropdownOpen && results.length > 0 && (
        <div className="absolute z-50 left-0 right-0 top-full mt-0.5 bg-card border border-border shadow-lg max-h-56 overflow-y-auto">
          {results.map((t) => (
            <button
              key={t.trackId}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); pickTrack(t); }}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-elevated transition-colors duration-75"
            >
              {t.artworkUrl60 && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.artworkUrl60} alt="" className="h-7 w-7 shrink-0 object-cover" />
              )}
              <div className="min-w-0">
                <p className="text-xs font-medium truncate" style={{ fontFamily: "var(--font-body)" }}>{t.trackName}</p>
                <p className="text-[10px] text-muted-foreground truncate" style={{ fontFamily: "var(--font-body)" }}>{t.artistName}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── WalkupSongLink (read-only display chip) ────────────────── */
function WalkupSongLink({ song, itunesId }: { song: string; itunesId: number | null }) {
  const parts = song.split(" — ");
  const trackName = parts[0] || song;
  const artistName = parts.length > 1 ? parts.slice(1).join(" — ") : null;

  const chip = (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 mt-1 px-2 py-0.5 rounded-full",
        "bg-muted/60 text-xs max-w-full",
        itunesId
          ? "hover:bg-primary/10 hover:text-primary cursor-pointer transition-colors duration-100 group"
          : ""
      )}
    >
      <Music
        className={cn(
          "h-3 w-3 shrink-0",
          itunesId ? "text-primary/70 group-hover:text-primary" : "text-muted-foreground"
        )}
      />
      <span className="truncate" style={{ fontFamily: "var(--font-body)" }}>
        <span className="font-medium">{trackName}</span>
        {artistName && (
          <span className="text-muted-foreground"> — {artistName}</span>
        )}
      </span>
    </span>
  );

  if (!itunesId) return <div>{chip}</div>;

  return (
    <div>
      <a
        href={appleMusicUrl(itunesId)}
        target="_blank"
        rel="noopener noreferrer"
        title={`Listen on Apple Music: ${song}`}
      >
        {chip}
      </a>
    </div>
  );
}

/* ─── Per-player parent-view row state ──────────────────────── */
type ParentEdit = {
  hat_monogram: string;
  walkup_song: string;
  walkup_song_itunes_id: number | null;
};

/* ─── Shared field styles ────────────────────────────────────── */
const fieldCls = "px-2 py-1.5 text-sm bg-input-bg border border-border focus:outline-none focus:border-primary transition-colors duration-100";
const actionBtnCls = "px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.07em] transition-colors duration-100";

/* ─── RosterTab ──────────────────────────────────────────────── */
function RosterTab({ teamId, canEdit }: { teamId: string; canEdit: boolean }) {
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [parentView, setParentView] = useState(false);
  const [parentEdits, setParentEdits] = useState<Record<number, ParentEdit>>({});

  // Inline add form
  const [addOpen, setAddOpen] = useState(false);
  const [newDraft, setNewDraft] = useState<Draft>(BLANK_DRAFT);
  const [newSaving, setNewSaving] = useState(false);
  const [newErr, setNewErr] = useState<string | null>(null);
  const jerseyRef = useRef<HTMLInputElement>(null);

  // Inline edit
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<Draft | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editErr, setEditErr] = useState<string | null>(null);

  // Delete confirm
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  useEffect(() => {
    if (!teamId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch(`/api/teams/${teamId}/roster`, { cache: "no-store" });
        if (!res.ok) throw new Error((await res.json()).error || `HTTP ${res.status}`);
        const data = await res.json();
        const rows: RosterRow[] = Array.isArray(data?.roster) ? data.roster : [];
        if (!cancelled) {
          setRoster(rows);
          const edits: Record<number, ParentEdit> = {};
          rows.forEach((r) => {
            edits[r.id] = {
              hat_monogram: r.hat_monogram ?? "",
              walkup_song: r.walkup_song ?? "",
              walkup_song_itunes_id: r.walkup_song_itunes_id ?? null,
            };
          });
          setParentEdits(edits);
        }
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : "Failed to load roster");
          setRoster([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [teamId]);

  const patchRosterEntry = async (rosterId: number, patch: Partial<ParentEdit>) => {
    try {
      await fetch(`/api/teams/${teamId}/roster/${rosterId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
    } catch {
      // silent fail — optimistic update already applied
    }
  };

  const updateParentEdit = (rosterId: number, patch: Partial<ParentEdit>) => {
    setParentEdits((prev) => ({
      ...prev,
      [rosterId]: { ...prev[rosterId], ...patch },
    }));
  };

  const openAdd = () => {
    if (addOpen) {
      jerseyRef.current?.focus();
      return;
    }
    setAddOpen(true);
    setTimeout(() => jerseyRef.current?.focus(), 50);
  };

  const saveNew = async () => {
    setNewErr(null);
    const first = newDraft.first_name.trim();
    if (!first) { setNewErr("First name is required."); return; }
    if (newDraft.role !== "player" && newDraft.role !== "staff") { setNewErr("Role is required."); return; }
    setNewSaving(true);
    try {
      const res = await fetch(`/api/teams/${teamId}/roster`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: first,
          last_name: newDraft.last_name.trim() || null,
          role: newDraft.role,
          jersey_number: newDraft.jersey_number === "" ? null : parseInt(newDraft.jersey_number, 10),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setRoster((prev) => [...prev, data]);
      setParentEdits((prev) => ({
        ...prev,
        [data.id]: {
          hat_monogram: data.hat_monogram ?? "",
          walkup_song: data.walkup_song ?? "",
          walkup_song_itunes_id: data.walkup_song_itunes_id ?? null,
        },
      }));
      setNewDraft(BLANK_DRAFT);
      setTimeout(() => jerseyRef.current?.focus(), 0);
    } catch (e) {
      setNewErr(e instanceof Error ? e.message : "Failed to add.");
    } finally {
      setNewSaving(false);
    }
  };

  const startEdit = (r: RosterRow) => {
    setEditingId(r.id);
    setEditDraft({
      jersey_number: r.jersey_number != null ? String(r.jersey_number) : "",
      first_name: r.first_name,
      last_name: r.last_name ?? "",
      role: r.role === "player" ? "player" : "staff",
    });
    setEditErr(null);
    setConfirmDeleteId(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft(null);
    setEditErr(null);
  };

  const saveEdit = async () => {
    if (editingId == null || !editDraft) return;
    setEditErr(null);
    const first = editDraft.first_name.trim();
    if (!first) { setEditErr("First name is required."); return; }
    if (editDraft.role !== "player" && editDraft.role !== "staff") { setEditErr("Role is required."); return; }
    setEditSaving(true);
    try {
      const res = await fetch(`/api/teams/${teamId}/roster/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: first,
          last_name: editDraft.last_name.trim() || null,
          role: editDraft.role,
          jersey_number: editDraft.jersey_number === "" ? null : parseInt(editDraft.jersey_number, 10),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setRoster((prev) => prev.map((r) => r.id === editingId ? data : r));
      setEditingId(null);
      setEditDraft(null);
    } catch (e) {
      setEditErr(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setEditSaving(false);
    }
  };

  const deleteEntry = async (id: number) => {
    try {
      const res = await fetch(`/api/teams/${teamId}/roster/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string })?.error || `HTTP ${res.status}`);
      }
      setRoster((prev) => prev.filter((r) => r.id !== id));
      if (editingId === id) { setEditingId(null); setEditDraft(null); }
    } catch (e) {
      console.error("[roster DELETE]", e);
    } finally {
      setConfirmDeleteId(null);
    }
  };

  const players = roster.filter((r) => r.role === "player");
  const staff = roster.filter((r) => r.role === "staff");

  // Edit row — spans all columns with a flex form
  const renderEditRow = (key: number, totalCols: number) => (
    <tr key={key} className="bg-elevated/60 border-t border-primary/30">
      <td colSpan={totalCols} className="p-2">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="number"
            min={0}
            placeholder="#"
            value={editDraft?.jersey_number ?? ""}
            onChange={(e) => setEditDraft((d) => d ? { ...d, jersey_number: e.target.value } : d)}
            className={cn(fieldCls, "w-14")}
            style={{ fontFamily: "var(--font-body)" }}
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
          />
          <input
            type="text"
            placeholder="First name *"
            value={editDraft?.first_name ?? ""}
            onChange={(e) => setEditDraft((d) => d ? { ...d, first_name: e.target.value } : d)}
            onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); }}
            className={cn(fieldCls, "w-32")}
            style={{ fontFamily: "var(--font-body)" }}
          />
          <input
            type="text"
            placeholder="Last name"
            value={editDraft?.last_name ?? ""}
            onChange={(e) => setEditDraft((d) => d ? { ...d, last_name: e.target.value } : d)}
            onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); }}
            className={cn(fieldCls, "w-32")}
            style={{ fontFamily: "var(--font-body)" }}
          />
          <select
            value={editDraft?.role ?? ""}
            onChange={(e) => setEditDraft((d) => d ? { ...d, role: e.target.value as Draft["role"] } : d)}
            className={cn(fieldCls, "w-28 cursor-pointer")}
            style={{ fontFamily: "var(--font-body)" }}
          >
            <option value="">Role *</option>
            <option value="player">Player</option>
            <option value="staff">Staff</option>
          </select>
          <button
            type="button"
            onClick={saveEdit}
            disabled={editSaving}
            className={cn(actionBtnCls, "bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40")}
            style={{ fontFamily: "var(--font-body)" }}
          >
            {editSaving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={cancelEdit}
            className={cn(actionBtnCls, "border border-border text-muted-foreground hover:text-foreground")}
            style={{ fontFamily: "var(--font-body)" }}
          >
            Cancel
          </button>
          {editErr && (
            <span className="text-xs text-destructive" style={{ fontFamily: "var(--font-body)" }}>{editErr}</span>
          )}
        </div>
      </td>
    </tr>
  );

  // Action buttons for display rows
  const renderActions = (r: RosterRow) => {
    if (!canEdit) return null;
    return (
      <div className="flex items-center justify-end gap-1">
        <button
          type="button"
          title="Edit"
          onClick={() => startEdit(r)}
          className="p-1 text-muted-foreground hover:text-foreground transition-colors duration-75"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        {confirmDeleteId === r.id ? (
          <button
            type="button"
            onClick={() => deleteEntry(r.id)}
            className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-destructive border border-destructive/40 hover:bg-destructive/10 transition-colors duration-75"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Delete?
          </button>
        ) : (
          <button
            type="button"
            title="Delete"
            onClick={() => setConfirmDeleteId(r.id)}
            className="p-1 text-muted-foreground hover:text-destructive transition-colors duration-75"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    );
  };

  const thCls = "text-left p-3 text-[10px] uppercase tracking-[0.08em] text-muted-foreground font-medium";
  const playerCols = parentView ? 5 : 3; // jersey + name + [hat + walkup] + actions
  const staffCols = 2; // name + actions

  return (
    <Card>
      <CardContent className="p-6">
        {/* Header row */}
        <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
          <h2
            className="uppercase"
            style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "18px", letterSpacing: "-0.01em" }}
          >
            Roster
          </h2>
          <div className="flex items-center gap-3 ml-auto">
            {/* Team Parent View toggle */}
            <button
              type="button"
              onClick={() => setParentView((v) => !v)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.07em] border transition-colors duration-100",
                parentView
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              )}
              style={{ fontFamily: "var(--font-body)" }}
            >
              <span
                className={cn(
                  "inline-block h-2.5 w-4 relative border",
                  parentView ? "border-primary-foreground/40" : "border-muted-foreground/40"
                )}
              >
                <span
                  className={cn(
                    "absolute top-0 bottom-0 w-2 transition-all duration-150",
                    parentView ? "right-0 bg-primary-foreground/80" : "left-0 bg-muted-foreground/40"
                  )}
                />
              </span>
              Team Parent View
            </button>

            {/* Add person */}
            {canEdit && (
              <button
                type="button"
                onClick={openAdd}
                className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-3 py-1.5 text-[11px] font-semibold tracking-[0.08em] uppercase hover:opacity-90 transition-opacity duration-100"
                style={{ fontFamily: "var(--font-body)" }}
              >
                <Plus className="h-3.5 w-3.5" />
                Add person
              </button>
            )}
          </div>
        </div>

        {/* Parent view description */}
        {parentView && (
          <p className="text-xs text-muted-foreground mb-4" style={{ fontFamily: "var(--font-body)" }}>
            Team Parent View is on. Edit hat monograms and walk-up songs inline — changes save automatically on blur.
          </p>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading roster…</p>
        ) : err ? (
          <p className="text-sm text-destructive">{err}</p>
        ) : (
          <div className="space-y-6">
            {/* Empty state */}
            {roster.length === 0 && !addOpen && (
              <p className="text-sm text-muted-foreground">No one on the roster yet. Add players or staff above.</p>
            )}

            {/* Players table */}
            {players.length > 0 && (
              <div>
                <p
                  className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground mb-2"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  Players
                </p>
                <div className="overflow-x-auto border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-elevated">
                      <tr>
                        <th className={cn(thCls, "w-12")} style={{ fontFamily: "var(--font-body)" }}>#</th>
                        <th className={thCls} style={{ fontFamily: "var(--font-body)" }}>Name</th>
                        {parentView && (
                          <>
                            <th className={cn(thCls, "w-64")} style={{ fontFamily: "var(--font-body)" }}>Hat Monogram</th>
                            <th className={cn(thCls, "min-w-[160px]")} style={{ fontFamily: "var(--font-body)" }}>Walk-up Song</th>
                          </>
                        )}
                        <th className={cn(thCls, "text-right")} style={{ fontFamily: "var(--font-body)" }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {players.map((r) => {
                        if (editingId === r.id) return renderEditRow(r.id, playerCols);
                        const edit = parentEdits[r.id] ?? {
                          hat_monogram: r.hat_monogram ?? "",
                          walkup_song: r.walkup_song ?? "",
                          walkup_song_itunes_id: r.walkup_song_itunes_id ?? null,
                        };
                        return (
                          <tr
                            key={r.id}
                            className="border-t border-border hover:bg-elevated/40 transition-colors duration-75"
                          >
                            <td
                              className="p-3 tabular-nums"
                              style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "16px" }}
                            >
                              {r.jersey_number != null
                                ? r.jersey_number
                                : <span className="text-muted-foreground/40 text-sm">—</span>}
                            </td>
                            <td className="p-3 font-medium" style={{ fontFamily: "var(--font-body)" }}>
                              <span>{[r.first_name, r.last_name].filter(Boolean).join(" ")}</span>
                              {!parentView && r.walkup_song && (
                                <WalkupSongLink song={r.walkup_song} itunesId={r.walkup_song_itunes_id} />
                              )}
                            </td>
                            {parentView && (
                              <>
                                <td className="p-2">
                                  <input
                                    type="text"
                                    value={edit.hat_monogram}
                                    maxLength={30}
                                    placeholder="e.g. SMITH"
                                    onChange={(e) =>
                                      updateParentEdit(r.id, { hat_monogram: e.target.value.toUpperCase() })
                                    }
                                    onBlur={() =>
                                      patchRosterEntry(r.id, { hat_monogram: edit.hat_monogram || null })
                                    }
                                    className={cn(
                                      "w-full px-2 py-1.5 text-xs bg-input-bg border border-border uppercase",
                                      "focus:outline-none focus:border-primary transition-colors duration-100",
                                      "placeholder:normal-case placeholder:text-muted-foreground/50"
                                    )}
                                    style={{ fontFamily: "var(--font-display)", letterSpacing: "0.06em" }}
                                  />
                                </td>
                                <td className="p-2">
                                  <WalkupSongInput
                                    value={edit.walkup_song}
                                    itunesId={edit.walkup_song_itunes_id}
                                    onChange={(song, itunesId) =>
                                      updateParentEdit(r.id, {
                                        walkup_song: song,
                                        walkup_song_itunes_id: itunesId,
                                      })
                                    }
                                    onBlurCommit={() => {
                                      patchRosterEntry(r.id, {
                                        walkup_song: edit.walkup_song || null,
                                        walkup_song_itunes_id: edit.walkup_song_itunes_id,
                                      });
                                      setRoster((prev) =>
                                        prev.map((row) =>
                                          row.id === r.id
                                            ? { ...row, walkup_song: edit.walkup_song || null, walkup_song_itunes_id: edit.walkup_song_itunes_id }
                                            : row
                                        )
                                      );
                                    }}
                                  />
                                </td>
                              </>
                            )}
                            <td className="p-3">{renderActions(r)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Staff table */}
            {staff.length > 0 && (
              <div>
                <p
                  className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground mb-2"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  Staff
                </p>
                <div className="overflow-x-auto border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-elevated">
                      <tr>
                        <th className={thCls} style={{ fontFamily: "var(--font-body)" }}>Name</th>
                        <th className={cn(thCls, "text-right")} style={{ fontFamily: "var(--font-body)" }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {staff.map((r) => {
                        if (editingId === r.id) return renderEditRow(r.id, staffCols);
                        return (
                          <tr
                            key={r.id}
                            className="border-t border-border hover:bg-elevated/40 transition-colors duration-75"
                          >
                            <td className="p-3 font-medium" style={{ fontFamily: "var(--font-body)" }}>
                              <span>{[r.first_name, r.last_name].filter(Boolean).join(" ")}</span>
                              {r.walkup_song && (
                                <WalkupSongLink song={r.walkup_song} itunesId={r.walkup_song_itunes_id} />
                              )}
                            </td>
                            <td className="p-3">{renderActions(r)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Inline add form */}
            {canEdit && addOpen && (
              <div className="border border-primary/30 bg-elevated/30">
                <div className="flex items-center justify-between px-3 pt-3 pb-2">
                  <p
                    className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground"
                    style={{ fontFamily: "var(--font-body)" }}
                  >
                    New person
                  </p>
                  <button
                    type="button"
                    onClick={() => setAddOpen(false)}
                    className="text-muted-foreground hover:text-foreground transition-colors duration-75"
                    title="Close"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2 px-3 pb-3">
                  <input
                    ref={jerseyRef}
                    type="number"
                    min={0}
                    placeholder="# (jersey)"
                    value={newDraft.jersey_number}
                    onChange={(e) => setNewDraft((d) => ({ ...d, jersey_number: e.target.value }))}
                    className={cn(fieldCls, "w-24")}
                    style={{ fontFamily: "var(--font-body)" }}
                  />
                  <input
                    type="text"
                    placeholder="First name *"
                    value={newDraft.first_name}
                    onChange={(e) => setNewDraft((d) => ({ ...d, first_name: e.target.value }))}
                    className={cn(fieldCls, "w-32")}
                    style={{ fontFamily: "var(--font-body)" }}
                  />
                  <input
                    type="text"
                    placeholder="Last name"
                    value={newDraft.last_name}
                    onChange={(e) => setNewDraft((d) => ({ ...d, last_name: e.target.value }))}
                    className={cn(fieldCls, "w-32")}
                    style={{ fontFamily: "var(--font-body)" }}
                  />
                  <select
                    value={newDraft.role}
                    onChange={(e) => setNewDraft((d) => ({ ...d, role: e.target.value as Draft["role"] }))}
                    className={cn(fieldCls, "w-28 cursor-pointer")}
                    style={{ fontFamily: "var(--font-body)" }}
                  >
                    <option value="">Role *</option>
                    <option value="player">Player</option>
                    <option value="staff">Staff</option>
                  </select>
                  <button
                    type="button"
                    onClick={saveNew}
                    disabled={newSaving}
                    className={cn(actionBtnCls, "bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40")}
                    style={{ fontFamily: "var(--font-body)" }}
                  >
                    {newSaving ? "Saving…" : "Save"}
                  </button>
                  {newErr && (
                    <span className="text-xs text-destructive" style={{ fontFamily: "var(--font-body)" }}>{newErr}</span>
                  )}
                </div>
                <p className="px-3 pb-2 text-[10px] text-muted-foreground/60" style={{ fontFamily: "var(--font-body)" }}>
                  Tab through fields → Save. After saving, the form resets so you can add the next person.
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Lookups for edit ────────────────────────────────────────── */
type LookupRow = { id: number; name: string };
type LeagueRow = { id: number; name: string; abbreviation?: string | null; sportid?: number | null };
type LeagueDivisionRow = { id: number; name: string; age_range?: string | null };
const SEASONS = ["Spring", "Summer", "Fall", "Winter"] as const;

/* ─── EditTeamModal ──────────────────────────────────────────── */
function EditTeamModal({
  team,
  open,
  onOpenChange,
  onSaved,
}: {
  team: TeamDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (updated: TeamDetail) => void;
}) {
  const [name, setName] = useState(team.name ?? "");
  const [year, setYear] = useState(team.year ?? new Date().getFullYear());
  const [season, setSeason] = useState(team.season ?? "");
  const [leagueId, setLeagueId] = useState(team.league_id ? String(team.league_id) : "");
  const [divisionId, setDivisionId] = useState("");
  const [sportId, setSportId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lookups
  const [sports, setSports] = useState<LookupRow[]>([]);
  const [divisions, setDivisions] = useState<LookupRow[]>([]);
  const [leagues, setLeagues] = useState<LeagueRow[]>([]);
  const [leagueDivisions, setLeagueDivisions] = useState<LeagueDivisionRow[]>([]);
  const [lookupsLoading, setLookupsLoading] = useState(true);
  const [leagueDivisionsLoading, setLeagueDivisionsLoading] = useState(false);

  const isLeagueTeam = leagueId && leagueId !== "__none__";

  // Load lookups on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLookupsLoading(true);
        const [lookupsRes, leaguesRes] = await Promise.all([
          fetch("/api/lookups"),
          fetch("/api/leagues"),
        ]);
        const json = lookupsRes.ok ? await lookupsRes.json() : {};
        const leaguesJson = leaguesRes.ok ? await leaguesRes.json() : { rows: [] };
        if (!cancelled) {
          const spts = Array.isArray(json.sports) ? json.sports : [];
          setSports(spts);
          const divs = Array.isArray(json.divisions) ? json.divisions : [];
          const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
          setDivisions([...divs].sort((a, b) => collator.compare(a.name, b.name)));
          setLeagues(Array.isArray(leaguesJson.rows) ? leaguesJson.rows : []);

          // Set initial sport from the team's current sport name
          const matchedSport = spts.find((s: LookupRow) => s.name === team.sport);
          if (matchedSport) setSportId(String(matchedSport.id));

          // Set initial division for non-league teams
          if (!team.league_id) {
            const matchedDiv = divs.find((d: LookupRow) => d.name === team.division);
            if (matchedDiv) setDivisionId(String(matchedDiv.id));
          }
        }
      } finally {
        if (!cancelled) setLookupsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [team.sport, team.division, team.league_id]);

  // Load league divisions when league changes
  useEffect(() => {
    if (!isLeagueTeam) {
      setLeagueDivisions([]);
      // If switching away from league, reset division to global
      if (team.league_id && !isLeagueTeam) {
        setDivisionId("");
      }
      return;
    }
    // Auto-assign the league's sport
    const selectedLeague = leagues.find((l) => String(l.id) === leagueId);
    if (selectedLeague?.sportid) {
      setSportId(String(selectedLeague.sportid));
    }

    let cancelled = false;
    (async () => {
      setLeagueDivisionsLoading(true);
      try {
        const res = await fetch(`/api/leagues/${leagueId}/divisions`);
        const data = res.ok ? await res.json() : { rows: [] };
        if (!cancelled) {
          const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
          const rows: LeagueDivisionRow[] = Array.isArray(data.rows) ? data.rows : [];
          const sorted = [...rows].sort((a, b) => collator.compare(a.name, b.name));
          setLeagueDivisions(sorted);

          // If this is the team's current league, pre-select the current division
          if (String(team.league_id) === leagueId && team.league_division_id) {
            setDivisionId(String(team.league_division_id));
          } else {
            setDivisionId("");
          }
        }
      } catch {
        if (!cancelled) setLeagueDivisions([]);
      } finally {
        if (!cancelled) setLeagueDivisionsLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, isLeagueTeam]);

  const canSubmit = !!(name && year && season && divisionId && sportId);

  const handleSave = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        name,
        year: Number(year),
        season,
        sportId: Number(sportId),
      };
      if (isLeagueTeam) {
        body.leagueId = Number(leagueId);
        body.leagueDivisionId = Number(divisionId);
        body.divisionId = null; // clear old division
      } else {
        body.leagueId = null;
        body.leagueDivisionId = null;
        body.divisionId = Number(divisionId);
      }

      const res = await fetch(`/api/teams/${team.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }

      // Re-fetch the team to get the updated details with joined names
      const refreshRes = await fetch(`/api/teams/${team.id}`, { cache: "no-store" });
      if (refreshRes.ok) {
        const data = await refreshRes.json();
        if (data.team) onSaved(data.team);
      }
      onOpenChange(false);
    } catch (e: unknown) {
      setError((e as Error).message || "Failed to save");
    } finally {
      setSubmitting(false);
    }
  };

  const divisionDisabled = lookupsLoading || (!!isLeagueTeam && leagueDivisionsLoading);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg rounded-none">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "20px", textTransform: "uppercase", letterSpacing: "-0.01em" }}>
            Edit Team
          </DialogTitle>
          <DialogDescription style={{ fontFamily: "var(--font-body)", fontSize: "13px" }}>
            Update the team details.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="grid gap-4 py-2">
          {/* Team Name */}
          <div className="grid gap-2">
            <Label htmlFor="edit-team-name" className="label-section">Team name</Label>
            <Input
              id="edit-team-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Year / Season */}
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label className="label-section">Year</Label>
              <Input
                type="number"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
              />
            </div>
            <div className="grid gap-2">
              <Label className="label-section">Season</Label>
              <Select value={season} onValueChange={setSeason}>
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {SEASONS.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* League */}
          <div className="grid gap-2">
            <Label className="label-section">
              League <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Select value={leagueId} onValueChange={setLeagueId} disabled={lookupsLoading}>
              <SelectTrigger>
                <SelectValue placeholder={lookupsLoading ? "Loading…" : "None (independent)"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None (independent)</SelectItem>
                {leagues.map((l) => (
                  <SelectItem key={l.id} value={String(l.id)}>
                    {l.abbreviation ? `${l.abbreviation} – ${l.name}` : l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Division / Sport */}
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label className="label-section">Division</Label>
              <Select
                value={divisionId}
                onValueChange={setDivisionId}
                disabled={divisionDisabled}
              >
                <SelectTrigger>
                  <SelectValue placeholder={
                    lookupsLoading ? "Loading…"
                    : isLeagueTeam && leagueDivisionsLoading ? "Loading…"
                    : isLeagueTeam && leagueDivisions.length === 0 && !leagueDivisionsLoading ? "No divisions"
                    : "Select"
                  } />
                </SelectTrigger>
                <SelectContent>
                  {isLeagueTeam
                    ? leagueDivisions.map((d) => (
                        <SelectItem key={d.id} value={String(d.id)}>
                          {d.age_range ? `${d.name} (${d.age_range})` : d.name}
                        </SelectItem>
                      ))
                    : divisions.map((d) => (
                        <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                      ))
                  }
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label className="label-section">Sport</Label>
              <Select value={sportId} onValueChange={setSportId} disabled={lookupsLoading || !!isLeagueTeam}>
                <SelectTrigger>
                  <SelectValue placeholder={lookupsLoading ? "Loading…" : "Select"} />
                </SelectTrigger>
                <SelectContent>
                  {sports.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="px-4 py-2 text-[11px] uppercase tracking-[0.08em] border border-border text-muted-foreground hover:text-foreground transition-colors duration-100"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={submitting || lookupsLoading || !canSubmit}
            className="inline-flex items-center gap-2 px-4 py-2 text-[11px] uppercase tracking-[0.08em] bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 transition-opacity duration-100"
            style={{ fontFamily: "var(--font-body)" }}
          >
            {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            {submitting ? "Saving…" : "Save"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── TeamDetailPage ─────────────────────────────────────────── */
export default function TeamDetailPage() {
  const router = useRouter();
  const teamId = router.query.teamId as string | undefined;
  const returnTo = typeof router.query.returnTo === "string" ? router.query.returnTo : undefined;
  const backHref = returnTo && returnTo.startsWith("/") && !returnTo.includes("//") ? returnTo : "/teams";
  const backLabel = backHref === "/teams"
    ? "Back to Teams"
    : backHref.startsWith("/seasons/")
      ? backHref.endsWith("/standings")
        ? "Back to standings"
        : "Back to league teams"
      : "Back to tournament teams";

  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [tournaments, setTournaments] = useState<TeamTournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [tab, setTab] = useState<TabKey>("overview");
  const permissions = usePermissions();
  const canEdit = teamId ? permissions.canEditTeam(Number(teamId), team?.league_id ?? null) : false;

  useEffect(() => {
    if (!teamId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/teams/${teamId}`, { cache: "no-store" });
        if (!res.ok) {
          if (res.status === 404) throw new Error("Team not found");
          throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();
        if (!cancelled) {
          setTeam(data.team ?? null);
          setTournaments(Array.isArray(data.tournaments) ? data.tournaments : []);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load team");
          setTeam(null);
          setTournaments([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [teamId]);

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

  if (error || !team) {
    return (
      <div className="min-h-screen">
        <Header />
        <main className="p-4 sm:p-6 md:p-8 mx-auto max-w-7xl space-y-4">
          <Link href={backHref} className="text-sm text-primary hover:underline">← {backLabel}</Link>
          <Card className="border-destructive/40">
            <CardContent className="p-6 text-destructive">{error ?? "Team not found."}</CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Header />
      <main className="p-4 sm:p-6 md:p-8 mx-auto max-w-7xl space-y-6">
        <Link href={backHref} className="text-sm text-primary hover:underline">
          ← {backLabel}
        </Link>

        <div>
          <h1
            className="uppercase"
            style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "28px", letterSpacing: "-0.02em", lineHeight: 1 }}
          >
            {team.name ?? "Team"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1" style={{ fontFamily: "var(--font-body)" }}>
            Details, roster, and schedule
          </p>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
          <TabsList className="bg-muted/60 border border-border p-1 rounded-lg">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="roster">Roster</TabsTrigger>
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6 space-y-6">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-medium">Details</h2>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setEditOpen(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] uppercase tracking-[0.08em] border border-border text-muted-foreground hover:text-foreground hover:border-foreground transition-colors duration-100"
                      style={{ fontFamily: "var(--font-body)" }}
                    >
                      <Pencil className="h-3 w-3" />
                      Edit
                    </button>
                  )}
                </div>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Division</dt>
                    <dd className="font-medium">{team.league_division_name ?? team.division ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Season</dt>
                    <dd className="font-medium">{team.season ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Year</dt>
                    <dd className="font-medium">{team.year ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Sport</dt>
                    <dd className="font-medium">{team.sport ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">League</dt>
                    <dd className="font-medium">{team.league_name ?? "—"}</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>

            {canEdit && editOpen && (
              <EditTeamModal
                team={team}
                open={editOpen}
                onOpenChange={setEditOpen}
                onSaved={(updated) => setTeam(updated)}
              />
            )}

            <Card>
              <CardContent className="p-6">
                <h2 className="text-lg font-medium mb-4">Tournaments</h2>
                {tournaments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">This team is not connected to any tournaments yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {tournaments.map((t) => (
                      <li key={t.tournamentid}>
                        <Link href={`/tournaments/${t.tournamentid}`} className="text-primary hover:underline font-medium">
                          {t.name ?? `Tournament #${t.tournamentid}`}
                        </Link>
                        {(t.year != null || t.division) && (
                          <span className="text-muted-foreground text-sm ml-2">
                            {[t.year, t.division].filter(Boolean).join(" · ")}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="roster" className="mt-6">
            {teamId && <RosterTab teamId={teamId} canEdit={canEdit} />}
          </TabsContent>

          <TabsContent value="calendar" className="mt-6">
            {teamId && <TeamCalendarTab teamId={teamId} />}
          </TabsContent>
        </Tabs>

        {canEdit && teamId && (
          <ManageAccessPanel scopeType="team" scopeId={Number(teamId)} />
        )}
      </main>
    </div>
  );
}
