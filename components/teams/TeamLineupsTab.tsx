// components/teams/TeamLineupsTab.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Copy, Trash2, ArrowLeft, Save } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { POSITIONS } from "@/lib/positions";
import type { ConsensusPriority } from "@/lib/positionConsensus";
import PlayerCombobox from "@/components/lineups/PlayerCombobox";
import PositionSourcePicker from "@/components/teams/PositionSourcePicker";
import { usePositionSource, positionSourceQuery } from "@/lib/hooks/usePositionSource";
import { playerLabel, type LineupPlayer } from "@/lib/lineups/player";
import {
  assignedIds,
  duplicateIds,
  filledCount,
  normalizeDefense,
  type DefenseAssignment,
} from "@/lib/lineups/defense";
import type { LineupTemplate } from "@/lib/lineupTemplates";
import type { RosterRow } from "@/pages/api/teams/[teamId]/roster";
import type { PositionAuthor, TeamPositionsResponse } from "@/pages/api/teams/[teamId]/roster/positions";

/**
 * A team's reusable defensive alignments.
 *
 * In youth baseball every kid may pitch, and moving one to the mound cascades
 * through the whole defense. Rather than rebuilding that shuffle inside every
 * game, coaches save the alignments here once and import them into a game's
 * Defense tab, one or more innings at a time.
 */

const MAX_TEMPLATES = 50;

type Mode = { kind: "list" } | { kind: "edit"; template: LineupTemplate | null };

function relativeDate(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

/** Roster rows → the shape the shared combobox takes. */
function toLineupPlayers(roster: RosterRow[]): LineupPlayer[] {
  return roster
    .filter((r) => r.role === "player" && !r.deleted_at)
    .map((r) => ({
      roster_id: r.id,
      first_name: r.first_name,
      last_name: r.last_name,
      jersey_number: r.jersey_number,
    }));
}

export default function TeamLineupsTab({
  teamId,
  canEdit,
}: {
  teamId: string;
  canEdit: boolean;
}) {
  const [templates, setTemplates] = useState<LineupTemplate[]>([]);
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>({ kind: "list" });

  // Whose position ratings order the player dropdowns. Mirrors the Defense tab.
  const [canAuthorPositions, setCanAuthorPositions] = useState<boolean | undefined>(undefined);
  const { source: positionSource, setSource: setPositionSource } = usePositionSource(
    teamId,
    canAuthorPositions
  );
  const [positionAuthors, setPositionAuthors] = useState<PositionAuthor[]>([]);
  const [positionsByRoster, setPositionsByRoster] = useState<
    Record<number, Record<string, ConsensusPriority>>
  >({});

  const load = useCallback(async () => {
    if (!canEdit) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [tplRes, rosterRes] = await Promise.all([
        fetch(`/api/teams/${teamId}/lineup-templates`, { cache: "no-store" }),
        fetch(`/api/teams/${teamId}/roster`, { cache: "no-store" }),
      ]);
      if (!tplRes.ok) throw new Error(`HTTP ${tplRes.status}`);
      const tplData = await tplRes.json();
      const rosterData = rosterRes.ok ? await rosterRes.json() : { roster: [] };
      setTemplates(Array.isArray(tplData.templates) ? tplData.templates : []);
      setRoster(Array.isArray(rosterData.roster) ? rosterData.roster : []);
    } catch {
      setError("Couldn't load saved lineups.");
    }
    setLoading(false);
  }, [teamId, canEdit]);

  useEffect(() => { load(); }, [load]);

  // Loaded separately so switching source doesn't discard an in-progress edit.
  useEffect(() => {
    if (!canEdit) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/teams/${teamId}/roster/positions?${positionSourceQuery(positionSource)}`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: TeamPositionsResponse = await res.json();
        if (cancelled) return;
        const byRoster: Record<number, Record<string, ConsensusPriority>> = {};
        for (const entry of data.positions) {
          (byRoster[entry.roster_id] ??= {})[entry.position] = entry.priority;
        }
        setPositionsByRoster(byRoster);
        setPositionAuthors(data.authors ?? []);
        setCanAuthorPositions(!!data.canAuthor);
      } catch {
        if (!cancelled) {
          setPositionsByRoster({});
          setPositionAuthors([]);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [teamId, positionSource, canEdit]);

  const players = useMemo(() => {
    const base = toLineupPlayers(roster);
    return base.map((p) => ({ ...p, positionPriorities: positionsByRoster[p.roster_id] ?? {} }));
  }, [roster, positionsByRoster]);

  // Saved lineups are coaching data; the API 403s for everyone else, and the
  // tab trigger is hidden. This card only shows if someone deep-links ?tab=lineups.
  if (!canEdit) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Saved lineups are visible to this team&apos;s coaches.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (loading) return <p className="text-sm text-muted-foreground py-4">Loading…</p>;

  if (error) {
    return (
      <Card>
        <CardContent className="p-6 text-center space-y-3">
          <p className="text-sm text-destructive">{error}</p>
          <button
            onClick={load}
            className="text-xs uppercase tracking-[0.08em] font-semibold text-primary hover:underline"
          >
            Try again
          </button>
        </CardContent>
      </Card>
    );
  }

  if (mode.kind === "edit") {
    return (
      <LineupEditor
        teamId={teamId}
        template={mode.template}
        players={players}
        positionAuthors={positionAuthors}
        positionSource={positionSource}
        setPositionSource={setPositionSource}
        canAuthorPositions={canAuthorPositions}
        onDone={() => { setMode({ kind: "list" }); load(); }}
        onCancel={() => setMode({ kind: "list" })}
      />
    );
  }

  return (
    <LineupList
      teamId={teamId}
      templates={templates}
      players={players}
      onNew={() => setMode({ kind: "edit", template: null })}
      onEdit={(t) => setMode({ kind: "edit", template: t })}
      onChanged={load}
    />
  );
}

/* ─── List ───────────────────────────────────────────────────── */

function LineupList({
  teamId,
  templates,
  players,
  onNew,
  onEdit,
  onChanged,
}: {
  teamId: string;
  templates: LineupTemplate[];
  players: LineupPlayer[];
  onNew: () => void;
  onEdit: (t: LineupTemplate) => void;
  onChanged: () => void;
}) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const atCap = templates.length >= MAX_TEMPLATES;
  const noPlayers = players.length === 0;

  const remove = async (id: number) => {
    setBusyId(id);
    setActionError(null);
    try {
      const res = await fetch(`/api/teams/${teamId}/lineup-templates/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onChanged();
    } catch {
      setActionError("Couldn't delete that lineup.");
    }
    setBusyId(null);
    setConfirmDeleteId(null);
  };

  const duplicate = async (id: number) => {
    setBusyId(id);
    setActionError(null);
    try {
      const res = await fetch(`/api/teams/${teamId}/lineup-templates/${id}/duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      onChanged();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Couldn't copy that lineup.");
    }
    setBusyId(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2
            className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Saved Lineups
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {templates.length} of {MAX_TEMPLATES}
          </p>
        </div>
        <button
          onClick={onNew}
          disabled={atCap || noPlayers}
          title={
            noPlayers
              ? "Add players to the roster first"
              : atCap
                ? `Maximum of ${MAX_TEMPLATES} saved lineups`
                : undefined
          }
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.07em] border transition-colors",
            atCap || noPlayers
              ? "border-border text-muted-foreground cursor-not-allowed opacity-50"
              : "border-primary text-primary hover:bg-primary/10"
          )}
        >
          <Plus className="h-3 w-3" /> New lineup
        </button>
      </div>

      {actionError && <p className="text-xs text-destructive">{actionError}</p>}

      {noPlayers ? (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-sm text-muted-foreground">Add players to the roster first.</p>
          </CardContent>
        </Card>
      ) : templates.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-sm text-muted-foreground">
              No saved lineups yet. Build one here, or save an inning from a game&apos;s Defense tab.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                <th className="text-left font-semibold px-3 py-2">Name</th>
                <th className="text-left font-semibold px-3 py-2 whitespace-nowrap">Set</th>
                <th className="text-left font-semibold px-3 py-2 whitespace-nowrap">Created by</th>
                <th className="text-left font-semibold px-3 py-2 whitespace-nowrap">Updated</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => {
                const filled = filledCount(t.defense);
                const missing = t.missing_roster_ids.length;
                return (
                  <tr key={t.id} className="border-b border-border/40 last:border-0 align-top">
                    <td className="px-3 py-2">
                      <button
                        onClick={() => onEdit(t)}
                        className="text-left font-medium text-foreground hover:text-primary transition-colors"
                      >
                        {t.name}
                      </button>
                      {missing > 0 && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {missing} {missing === 1 ? "player is" : "players are"} no longer on the roster
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums text-muted-foreground">
                      {filled}/{POSITIONS.length}
                      {missing > 0 && <span className="text-muted-foreground/60"> · {missing}</span>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                      {t.created_by_name ?? "—"}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                      {relativeDate(t.updated_at)}
                      {t.updated_by_name && t.updated_by !== t.created_by && (
                        <span className="text-muted-foreground/60"> by {t.updated_by_name}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          title="Edit"
                          onClick={() => onEdit(t)}
                          className="p-1 text-muted-foreground hover:text-foreground transition-colors duration-75"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          title={
                            templates.length >= MAX_TEMPLATES
                              ? `Maximum of ${MAX_TEMPLATES} saved lineups`
                              : "Duplicate"
                          }
                          disabled={busyId === t.id || templates.length >= MAX_TEMPLATES}
                          onClick={() => duplicate(t.id)}
                          className="p-1 text-muted-foreground hover:text-foreground transition-colors duration-75 disabled:opacity-40"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        {confirmDeleteId === t.id ? (
                          <button
                            type="button"
                            disabled={busyId === t.id}
                            onClick={() => remove(t.id)}
                            className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-destructive border border-destructive/40 hover:bg-destructive/10 transition-colors duration-75"
                            style={{ fontFamily: "var(--font-body)" }}
                          >
                            Delete?
                          </button>
                        ) : (
                          <button
                            type="button"
                            title="Delete"
                            onClick={() => setConfirmDeleteId(t.id)}
                            className="p-1 text-muted-foreground hover:text-destructive transition-colors duration-75"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─── Editor ─────────────────────────────────────────────────── */

function LineupEditor({
  teamId,
  template,
  players,
  positionAuthors,
  positionSource,
  setPositionSource,
  canAuthorPositions,
  onDone,
  onCancel,
}: {
  teamId: string;
  template: LineupTemplate | null;
  players: LineupPlayer[];
  positionAuthors: PositionAuthor[];
  positionSource: ReturnType<typeof usePositionSource>["source"];
  setPositionSource: ReturnType<typeof usePositionSource>["setSource"];
  canAuthorPositions: boolean | undefined;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(template?.name ?? "");
  const [defense, setDefense] = useState<DefenseAssignment>(
    normalizeDefense(template?.defense ?? {})
  );
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const used = assignedIds(defense);
  const dupes = duplicateIds(defense);
  const hasDuplicates = dupes.size > 0;
  const filled = filledCount(defense);

  const bench = players.filter((p) => !used.has(p.roster_id));

  const assign = (pos: string, rosterId: number | null) => {
    setDefense((prev) => ({ ...prev, [pos]: rosterId }));
    setDirty(true);
  };

  const handleCellTab = (currentPos: string, shiftKey: boolean) => {
    const idx = POSITIONS.indexOf(currentPos as (typeof POSITIONS)[number]);
    const next = POSITIONS[shiftKey ? idx - 1 : idx + 1];
    if (next) document.querySelector<HTMLInputElement>(`[data-cell="${next}"] input`)?.focus();
  };

  const save = async () => {
    setNameError(null);
    setSaveError(null);
    if (!name.trim()) {
      setNameError("Give this lineup a name.");
      return;
    }
    setSaving(true);
    try {
      const url = template
        ? `/api/teams/${teamId}/lineup-templates/${template.id}`
        : `/api/teams/${teamId}/lineup-templates`;
      const res = await fetch(url, {
        method: template ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), defense }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409) {
        setNameError(data.error || "A saved lineup with that name already exists.");
        setSaving(false);
        return;
      }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      onDone();
      return;
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Couldn't save that lineup.");
    }
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      <button
        onClick={onCancel}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3 w-3" /> Saved lineups
      </button>

      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="min-w-[16rem] flex-1">
          <label
            htmlFor="lineup-name"
            className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-1"
          >
            Name
          </label>
          <input
            id="lineup-name"
            type="text"
            value={name}
            maxLength={60}
            onChange={(e) => { setName(e.target.value); setDirty(true); setNameError(null); }}
            placeholder="e.g. Jack pitching"
            className="w-full border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
          />
          {nameError && <p className="text-[11px] text-destructive mt-1">{nameError}</p>}
        </div>

        {positionAuthors.length > 0 && (
          <div className="flex items-center gap-2">
            <label htmlFor="lineup-position-source" className="text-sm text-muted-foreground">
              Positions:
            </label>
            <PositionSourcePicker
              id="lineup-position-source"
              authors={positionAuthors}
              value={positionSource}
              onChange={setPositionSource}
              canAuthor={canAuthorPositions !== false}
            />
          </div>
        )}
      </div>

      <div className="border border-border max-w-md">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              <th className="text-left font-semibold px-3 py-2 w-16">Pos</th>
              <th className="text-left font-semibold px-3 py-2">Player</th>
            </tr>
          </thead>
          <tbody>
            {POSITIONS.map((pos) => {
              const value = defense[pos] ?? null;
              return (
                <tr key={pos} className="border-b border-border/40 last:border-0">
                  <td
                    className="px-3 py-1.5 text-xs font-bold text-muted-foreground"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {pos}
                  </td>
                  <td className="px-3 py-1.5">
                    <PlayerCombobox
                      players={players}
                      position={pos}
                      value={value}
                      usedIds={used}
                      isDuplicate={value != null && dupes.has(value)}
                      cellKey={pos}
                      ariaLabel={pos}
                      onTab={(shiftKey) => handleCellTab(pos, shiftKey)}
                      onChange={(id) => assign(pos, id)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="border border-border px-3 py-2 max-w-md">
        <p
          className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-1"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Bench — who this alignment leaves off
        </p>
        <p className="text-xs text-muted-foreground">
          {bench.length === 0
            ? "Nobody — every player is on the field."
            : bench.map((p) => playerLabel(p)).join(", ")}
        </p>
      </div>

      <div className="flex items-center justify-end gap-3 max-w-md">
        {saveError && <p className="text-[11px] text-destructive mr-auto">{saveError}</p>}
        {hasDuplicates && (
          <p className="text-[10px] text-destructive mr-auto">
            Fix duplicate players before saving.
          </p>
        )}
        {filled === 0 && !hasDuplicates && (
          <p className="text-[10px] text-muted-foreground mr-auto">Fill at least one position.</p>
        )}
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.07em] border border-border text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={save}
          disabled={!dirty || saving || hasDuplicates || filled === 0}
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.07em] border transition-colors",
            dirty && !hasDuplicates && filled > 0
              ? "border-primary text-primary hover:bg-primary/10"
              : "border-border text-muted-foreground cursor-not-allowed opacity-50"
          )}
        >
          <Save className="h-3 w-3" />
          {saving ? "Saving…" : "Save lineup"}
        </button>
      </div>
    </div>
  );
}
