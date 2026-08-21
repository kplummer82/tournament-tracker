import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, Check, X, Minus, Copy, Save, Shuffle, GripVertical, Navigation, Import, BookmarkPlus } from "lucide-react";
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors } from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { formatMMDDYY, formatHHMMAMPM } from "@/lib/datetime";
import type { GameDetail } from "@/pages/api/games/[source]/[gameId]";
import { ReportsTab } from "@/components/games/ReportsTab";
import { LocationDisplay } from "@/components/LocationPicker";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { validateLineupRules, OUTFIELD_POSITIONS, type LineupRules, type LineupRuleKey } from "@/lib/lineupRules";
import { POSITIONS } from "@/lib/positions";
import { type ConsensusPriority } from "@/lib/positionConsensus";
import PlayerCombobox from "@/components/lineups/PlayerCombobox";
import ImportLineupDialog from "@/components/lineups/ImportLineupDialog";
import SaveLineupDialog from "@/components/lineups/SaveLineupDialog";
import { playerLabel } from "@/lib/lineups/player";
import { defenseForInning } from "@/lib/lineups/defense";
import PositionSourcePicker from "@/components/teams/PositionSourcePicker";
import { usePositionSource, positionSourceQuery } from "@/lib/hooks/usePositionSource";
import type { PositionAuthor, TeamPositionsResponse } from "@/pages/api/teams/[teamId]/roster/positions";

/* ─── Types ──────────────────────────────────────────────────── */

type TabKey = "overview" | "confirmations" | "batting" | "defense" | "reports";

type ConfirmationRow = {
  roster_id: number;
  first_name: string;
  last_name: string;
  jersey_number: number | null;
  status: "confirmed" | "declined" | "pending";
  // keyed by position abbreviation → priority; populated in DefenseTab.
  // "split" only appears in the consensus view, where coaches disagree.
  positionPriorities?: Record<string, ConsensusPriority>;
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

const INNINGS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

const HOME_TEAM_FORFEIT_ID = 6; // home forfeited → away wins
const AWAY_TEAM_FORFEIT_ID = 7; // away forfeited → home wins

/* ─── Shared styles ──────────────────────────────────────────── */

const labelCls = "text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground";
const valueCls = "text-sm font-medium";

/* ─── ScoreCard ──────────────────────────────────────────────── */

/**
 * Editable score + status, scrimmages only. Rendered just for the hosting team —
 * PATCH /api/teams/:teamId/scrimmages/:id scopes its UPDATE on scrimmages.team_id,
 * so the visiting team would only get a 404. Scores here are raw DB values (the
 * game detail API is not team-scoped), so there is no home/away flip to undo.
 */
function ScoreCard({
  game,
  onGameChange,
}: {
  game: GameDetail;
  onGameChange?: (g: GameDetail) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [homescore, setHomescore] = useState("");
  const [awayscore, setAwayscore] = useState("");
  const [statusId, setStatusId] = useState("");
  const [statuses, setStatuses] = useState<{ id: number; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/gamestatuses")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        setStatuses(Array.isArray(d.statuses) ? d.statuses : []);
      })
      .catch(() => { /* silent */ });
    return () => { cancelled = true; };
  }, []);

  const beginEdit = () => {
    setHomescore(game.homescore != null ? String(game.homescore) : "");
    setAwayscore(game.awayscore != null ? String(game.awayscore) : "");
    setStatusId(game.gamestatusid != null ? String(game.gamestatusid) : "");
    setError(null);
    setEditing(true);
  };

  const save = async () => {
    if (game.home == null) return;
    setSaving(true);
    setError(null);
    try {
      const patch = {
        homescore: homescore !== "" ? Number(homescore) : null,
        awayscore: awayscore !== "" ? Number(awayscore) : null,
        gamestatusid: statusId !== "" ? Number(statusId) : null,
      };
      const res = await fetch(`/api/teams/${game.home}/scrimmages/${game.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      onGameChange?.({
        ...game,
        ...patch,
        gamestatus_label:
          statuses.find((s) => s.id === patch.gamestatusid)?.name ?? null,
      });
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  // A forfeit decides the winner on its own, so scores are not entered by hand.
  const isForfeit =
    statusId === String(HOME_TEAM_FORFEIT_ID) || statusId === String(AWAY_TEAM_FORFEIT_ID);
  const isFinal = game.gamestatus_label?.toLowerCase() === "final";
  const hasScore = game.homescore != null && game.awayscore != null;

  const inputCls =
    "w-full border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary disabled:opacity-50";

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2
            className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Score &amp; Status
          </h2>
          {!editing && (
            <button
              type="button"
              onClick={beginEdit}
              className="text-xs uppercase tracking-[0.08em] font-semibold text-primary hover:underline"
            >
              {hasScore ? "Edit" : "Enter score"}
            </button>
          )}
        </div>

        {editing ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="min-w-0">
                <label className={cn(labelCls, "block mb-1 truncate")} title={game.home_team ?? ""}>
                  {game.home_team ?? "Home"}
                </label>
                <input
                  inputMode="numeric"
                  placeholder="—"
                  value={homescore}
                  disabled={isForfeit}
                  onChange={(e) => setHomescore(e.target.value.replace(/[^\d]/g, ""))}
                  className={inputCls}
                />
              </div>
              <div className="min-w-0">
                <label className={cn(labelCls, "block mb-1 truncate")} title={game.away_team ?? ""}>
                  {game.away_team ?? "Away"}
                </label>
                <input
                  inputMode="numeric"
                  placeholder="—"
                  value={awayscore}
                  disabled={isForfeit}
                  onChange={(e) => setAwayscore(e.target.value.replace(/[^\d]/g, ""))}
                  className={inputCls}
                />
              </div>
              <div className="min-w-0">
                <label className={cn(labelCls, "block mb-1")}>Status</label>
                <select
                  value={statusId}
                  onChange={(e) => setStatusId(e.target.value)}
                  className={inputCls}
                >
                  <option value="">— No status —</option>
                  {statuses.map((s) => (
                    <option key={s.id} value={String(s.id)}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {error && <p className="mt-3 text-xs text-destructive">{error}</p>}

            <div className="flex items-center justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.07em] border border-border text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.07em] bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-baseline gap-3">
              <span className="text-sm text-muted-foreground">{game.home_team ?? "Home"}</span>
              <span
                className={cn("text-xl font-bold tabular-nums", isFinal && hasScore && game.homescore! > game.awayscore! && "text-primary")}
                style={{ fontFamily: "var(--font-display)" }}
              >
                {game.homescore ?? "—"}
              </span>
              <span className="text-muted-foreground">–</span>
              <span
                className={cn("text-xl font-bold tabular-nums", isFinal && hasScore && game.awayscore! > game.homescore! && "text-primary")}
                style={{ fontFamily: "var(--font-display)" }}
              >
                {game.awayscore ?? "—"}
              </span>
              <span className="text-sm text-muted-foreground">{game.away_team ?? "Away"}</span>
            </div>
            {hasScore && !isFinal && (
              <p className="mt-3 text-xs text-muted-foreground">
                Set the status to <span className="text-foreground">Final</span> for this game to
                count toward the team record.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── OverviewTab ────────────────────────────────────────────── */

function OverviewTab({
  game,
  canEditField = false,
  canEditScore = false,
  onGameChange,
}: {
  game: GameDetail;
  canEditField?: boolean;
  canEditScore?: boolean;
  onGameChange?: (g: GameDetail) => void;
}) {
  const hasScore = game.homescore != null && game.awayscore != null;
  const isFinal = game.gamestatus_label?.toLowerCase() === "final";
  const contextHref = game.source === "season"
    ? `/seasons/${game.context_id}`
    : `/tournaments/${game.context_id}`;

  const [officialFields, setOfficialFields] = useState<{ id: number; name: string }[]>([]);
  const [savingField, setSavingField] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  useEffect(() => {
    if (!canEditField || game.location_id == null) {
      setOfficialFields([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/locations/${game.location_id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        setOfficialFields(Array.isArray(d.fields) ? d.fields : []);
      })
      .catch(() => { /* silent */ });
    return () => { cancelled = true; };
  }, [canEditField, game.location_id]);

  const saveField = async (newField: string | null) => {
    if (game.source !== "scrimmage" || game.home == null) return;
    setSavingField(true);
    setFieldError(null);
    try {
      const res = await fetch(
        `/api/teams/${game.home}/scrimmages/${game.id}/field`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ field: newField }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      onGameChange?.({ ...game, field: newField });
    } catch (e) {
      setFieldError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSavingField(false);
    }
  };

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
            {/* When editable the score gets its own card below, so don't repeat it here. */}
            {hasScore && !canEditScore && (
              <div>
                <dt className={labelCls}>Score</dt>
                <dd className={valueCls}>
                  <span className={cn(isFinal && game.homescore! > game.awayscore! && "text-primary")}>{game.homescore}</span>
                  <span className="text-muted-foreground mx-1">–</span>
                  <span className={cn(isFinal && game.awayscore! > game.homescore! && "text-primary")}>{game.awayscore}</span>
                </dd>
              </div>
            )}
            {game.source !== "scrimmage" && (
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
            )}
            {(game.location || game.location_id != null || game.field || canEditField) && (() => {
              const displayLocation = game.location ?? game.location_name ?? null;
              const addressParts = [
                game.location_address,
                game.location_city,
                game.location_state,
              ].filter(Boolean);
              const queryBase = displayLocation || "";
              const query = addressParts.length > 0
                ? `${queryBase}${queryBase ? ", " : ""}${addressParts.join(", ")}`
                : displayLocation;
              const showLocation = game.location || game.location_id != null;
              const showField = game.field || canEditField;
              return (
                <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {showLocation && (
                    <div>
                      <dt className={labelCls}>Location</dt>
                      <dd className={valueCls}>
                        <LocationDisplay
                          locationId={game.location_id}
                          location={displayLocation}
                          field={null}
                        />
                        {query && (
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 ml-2 text-primary hover:underline text-xs uppercase tracking-[0.08em] font-semibold"
                          >
                            <Navigation className="h-3 w-3" />
                            Directions
                          </a>
                        )}
                      </dd>
                    </div>
                  )}
                  {showField && (
                    <div>
                      <dt className={labelCls}>Field</dt>
                      <dd className={valueCls}>
                        {canEditField ? (
                          officialFields.length > 0 ? (
                            <select
                              className="border border-border bg-input px-2 py-1 text-sm text-foreground focus:outline-none focus:border-primary disabled:opacity-60"
                              value={
                                game.field && officialFields.some((f) => f.name === game.field)
                                  ? game.field
                                  : ""
                              }
                              disabled={savingField}
                              onChange={(e) => saveField(e.target.value || null)}
                            >
                              <option value="">Select a field…</option>
                              {officialFields.map((f) => (
                                <option key={f.id} value={f.name}>
                                  {f.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type="text"
                              className="border border-border bg-input px-2 py-1 text-sm text-foreground focus:outline-none focus:border-primary disabled:opacity-60"
                              placeholder="Field / court (optional)"
                              defaultValue={game.field ?? ""}
                              disabled={savingField}
                              onBlur={(e) => {
                                const v = e.target.value.trim();
                                if ((v || null) !== (game.field ?? null)) saveField(v || null);
                              }}
                            />
                          )
                        ) : (
                          <span>{game.field}</span>
                        )}
                        {fieldError && (
                          <span className="ml-2 text-xs text-destructive">{fieldError}</span>
                        )}
                      </dd>
                    </div>
                  )}
                </div>
              );
            })()}
          </dl>
        </CardContent>
      </Card>

      {canEditScore && <ScoreCard game={game} onGameChange={onGameChange} />}

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

/* ─── DefenseTab ─────────────────────────────────────────────── */

type LineupMap = Record<string, number>; // key: "inning-position" → roster_id

function DefenseTab({
  source, gameId, teamId,
}: {
  source: string; gameId: number; teamId: number;
}) {
  const [lineup, setLineup] = useState<LineupMap>({});
  // Everyone on the roster, not just the confirmed players. Import needs the
  // full list so it can name a saved lineup's players who aren't available.
  const [allPlayers, setAllPlayers] = useState<ConfirmationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [numInnings, setNumInnings] = useState(6);
  const [rules, setRules] = useState<LineupRules>({});
  const [importOpen, setImportOpen] = useState(false);
  const [saveTemplateFor, setSaveTemplateFor] = useState<number | null>(null);
  const [templateSavedMsg, setTemplateSavedMsg] = useState<string | null>(null);

  // Position ratings are per-coach; this picks whose to sort the dropdown by.
  // Non-staff get a 403 on the positions route, so the picker and the 1°/2°
  // badges simply never appear for them.
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
    setLoading(true);
    try {
      const [lineupRes, confRes, rulesRes] = await Promise.all([
        fetch(`/api/games/${source}/${gameId}/defensive-lineup?team=${teamId}`),
        fetch(`/api/games/${source}/${gameId}/confirmations?team=${teamId}`),
        fetch(`/api/games/${source}/${gameId}/lineup-rules?team=${teamId}`),
      ]);
      const lineupData = await lineupRes.json();
      const confData = await confRes.json();
      const rulesData = rulesRes.ok ? await rulesRes.json() : { rules: {} };
      setRules(rulesData.rules ?? {});

      const rows: DefenseRow[] = Array.isArray(lineupData.lineup) ? lineupData.lineup : [];
      const map: LineupMap = {};
      let maxInning = 6;
      for (const r of rows) {
        map[`${r.inning}-${r.position}`] = r.roster_id;
        if (r.inning > maxInning) maxInning = r.inning;
      }
      setLineup(map);
      setNumInnings(maxInning);
      setAllPlayers(Array.isArray(confData.confirmations) ? confData.confirmations : []);
    } catch { /* silent */ }
    setLoading(false);
    setDirty(false);
  }, [source, gameId, teamId]);

  useEffect(() => { load(); }, [load]);

  // Positions load separately so changing the source doesn't reload the lineup
  // and throw away unsaved edits.
  useEffect(() => {
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
  }, [teamId, positionSource]);

  // Only confirmed players can be assigned. Derived rather than stored so the
  // full roster stays available to the import dialog.
  const confirmed = useMemo(
    () => allPlayers.filter((c) => c.status === "confirmed"),
    [allPlayers]
  );
  const confirmedIdSet = useMemo(
    () => new Set(confirmed.map((c) => c.roster_id)),
    [confirmed]
  );

  // Attach ratings at render time — `confirmed` itself stays a pure server echo.
  const confirmedWithPositions = useMemo(
    () => confirmed.map((c) => ({ ...c, positionPriorities: positionsByRoster[c.roster_id] ?? {} })),
    [confirmed, positionsByRoster]
  );

  const activeInnings = INNINGS.slice(0, numInnings);

  const assign = (inning: number, position: string, rosterId: number | null) => {
    setLineup((prev) => {
      const next = { ...prev };
      const key = `${inning}-${position}`;
      if (rosterId === null) {
        delete next[key];
      } else {
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

  /**
   * A saved lineup REPLACES each selected inning outright — positions it leaves
   * unset are cleared, not left holding a previous assignment. Merging would
   * silently produce duplicates (a player kept at 2B while the lineup also puts
   * them at SS) and would surprise a coach who imported "Jack pitching" and got
   * a hybrid. Players who aren't confirmed for this game are left empty; the
   * dialog already named them.
   *
   * Nothing is written to the game until the coach presses Save, same as
   * copyFromPrevious.
   */
  const applyTemplate = (defense: Record<string, number | null>, innings: number[]) => {
    setLineup((prev) => {
      const next = { ...prev };
      for (const inn of innings) {
        for (const pos of POSITIONS) {
          const id = defense[pos];
          const key = `${inn}-${pos}`;
          if (id != null && confirmedIdSet.has(id)) next[key] = id;
          else delete next[key];
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

  const toggleRule = async (key: LineupRuleKey) => {
    const prev = rules;
    const next = { ...rules, [key]: !rules[key] };
    setRules(next);
    try {
      const res = await fetch(`/api/games/${source}/${gameId}/lineup-rules`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team_id: teamId, rules: next }),
      });
      if (!res.ok) setRules(prev);
    } catch {
      setRules(prev);
    }
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

  const duplicatesInInning = (inning: number): Set<number> => {
    const seen = new Set<number>();
    const dupes = new Set<number>();
    for (const pos of POSITIONS) {
      const id = lineup[`${inning}-${pos}`];
      if (id != null) {
        if (seen.has(id)) dupes.add(id);
        else seen.add(id);
      }
    }
    return dupes;
  };

  const hasDuplicates = activeInnings.some((inn) => duplicatesInInning(inn).size > 0);

  const violations = useMemo(
    () =>
      validateLineupRules({
        lineup,
        confirmedIds: confirmed.map((c) => c.roster_id),
        activeInnings: [...activeInnings],
        rules,
      }),
    [lineup, confirmed, activeInnings, rules]
  );
  const sitViolation = violations.find((v) => v.rule === "fair_sit");
  const ofViolation = violations.find((v) => v.rule === "fair_outfield");

  const namesFor = (ids: number[]) => ids.map(playerName).join(", ");

  const cellOrder = activeInnings.flatMap((inn) => POSITIONS.map((p) => `${inn}-${p}`));

  const handleCellTab = (currentKey: string, shiftKey: boolean) => {
    const idx = cellOrder.indexOf(currentKey);
    const nextKey = cellOrder[shiftKey ? idx - 1 : idx + 1];
    if (nextKey) {
      document.querySelector<HTMLInputElement>(`[data-cell="${nextKey}"] input`)?.focus();
    }
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
        {/* Whose position ratings order the player dropdowns. Absent for
            non-staff, whose positions request 403s and returns no authors. */}
        {positionAuthors.length > 0 && (
          <div className="flex items-center gap-2">
            <label
              htmlFor="defense-position-source"
              className="text-sm text-muted-foreground"
              style={{ fontFamily: "var(--font-body)" }}
            >
              Positions:
            </label>
            <PositionSourcePicker
              id="defense-position-source"
              authors={positionAuthors}
              value={positionSource}
              onChange={setPositionSource}
              canAuthor={canAuthorPositions !== false}
            />
          </div>
        )}
        <div className="flex items-center gap-4">
          <p className="text-sm text-muted-foreground">Rules:</p>
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={!!rules.fair_sit}
              onChange={() => toggleRule("fair_sit")}
              className="w-3.5 h-3.5 accent-primary cursor-pointer"
            />
            <span className="text-xs text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
              Fair sit
            </span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={!!rules.fair_outfield}
              onChange={() => toggleRule("fair_outfield")}
              className="w-3.5 h-3.5 accent-primary cursor-pointer"
            />
            <span className="text-xs text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
              Fair outfield
            </span>
          </label>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={() => setImportOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.07em] border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
          >
            <Import className="h-3 w-3" />
            Import lineup
          </button>
          {templateSavedMsg && (
            <p className="text-[10px] text-primary">{templateSavedMsg}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={save}
            disabled={!dirty || saving || hasDuplicates}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.07em] border transition-colors",
              dirty && !hasDuplicates
                ? "border-primary text-primary hover:bg-primary/10"
                : "border-border text-muted-foreground cursor-not-allowed opacity-50"
            )}
          >
            <Save className="h-3 w-3" />
            {saving ? "Saving…" : "Save"}
          </button>
          {hasDuplicates && (
            <p className="text-[10px] text-destructive">Fix duplicate players before saving.</p>
          )}
        </div>
      </div>

      {(sitViolation || ofViolation) && (
        <div className="border border-warning/40 bg-warning/10 px-3 py-2 space-y-1">
          {sitViolation && (
            <p className="text-[11px] text-warning">
              Fair sit — inning {sitViolation.inning}: {namesFor(sitViolation.offenders)} would sit a 2nd time
              before {namesFor(sitViolation.waiting)} {sitViolation.waiting.length === 1 ? "has" : "have"} sat.
            </p>
          )}
          {ofViolation && (
            <p className="text-[11px] text-warning">
              Fair outfield — inning {ofViolation.inning}: {namesFor(ofViolation.offenders)} would play outfield
              a 2nd time before {namesFor(ofViolation.waiting)} {ofViolation.waiting.length === 1 ? "has" : "have"} played outfield.
            </p>
          )}
        </div>
      )}

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
                        <div className="flex items-center gap-2">
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
                          <button
                            onClick={() => setSaveTemplateFor(inn)}
                            disabled={
                              duplicatesInInning(inn).size > 0 || playersInInning(inn).size === 0
                            }
                            className="inline-flex items-center gap-0.5 text-[9px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 disabled:hover:text-muted-foreground"
                            title={`Save inning ${inn} as a team lineup`}
                            // The visible label is just "Save", which collides with
                            // the tab's own Save button for screen readers.
                            aria-label={`Save inning ${inn} as a team lineup`}
                          >
                            <BookmarkPlus className="h-2.5 w-2.5" />
                            Save
                          </button>
                        </div>
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
                      const dupes = duplicatesInInning(inn);
                      const isDuplicate = assigned != null && dupes.has(assigned);
                      const isOfOffender =
                        ofViolation?.inning === inn &&
                        (OUTFIELD_POSITIONS as readonly string[]).includes(pos) &&
                        assigned != null &&
                        ofViolation.offenders.includes(assigned);

                      return (
                        <td
                          key={key}
                          className={cn(
                            "p-1",
                            isDuplicate && "bg-destructive/10",
                            !isDuplicate && isOfOffender && "bg-warning/10"
                          )}
                        >
                          <PlayerCombobox
                            players={confirmedWithPositions}
                            position={pos}
                            value={assigned}
                            usedIds={usedInInning}
                            isDuplicate={isDuplicate}
                            cellKey={key}
                            ariaLabel={`${pos} inning ${inn}`}
                            onTab={(shiftKey) => handleCellTab(key, shiftKey)}
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
                    {unassigned.map((c, i) => (
                      <span key={c.roster_id}>
                        {i > 0 && ", "}
                        <span
                          className={cn(
                            sitViolation?.inning === inn &&
                              sitViolation.offenders.includes(c.roster_id) &&
                              "text-warning font-semibold"
                          )}
                        >
                          {playerLabel(c)}
                        </span>
                      </span>
                    ))}
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <ImportLineupDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        teamId={teamId}
        activeInnings={[...activeInnings]}
        players={allPlayers}
        confirmedIds={confirmedIdSet}
        onApply={applyTemplate}
      />

      {saveTemplateFor != null && (
        <SaveLineupDialog
          open
          onOpenChange={(v) => { if (!v) setSaveTemplateFor(null); }}
          teamId={teamId}
          inning={saveTemplateFor}
          defense={defenseForInning(lineup, saveTemplateFor)}
          players={allPlayers}
          onSaved={(name) => {
            setSaveTemplateFor(null);
            setTemplateSavedMsg(`Saved “${name}” to team lineups`);
            setTimeout(() => setTemplateSavedMsg(null), 3000);
          }}
        />
      )}
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
 * Returns the team IDs the current user can actually manage for this game,
 * filtered by their roles. Admins see both teams; non-admins only see teams
 * they have a team_manager role for (or the league/division covering them).
 *
 * For scrimmages both the host and visiting team should be in scope when
 * the viewer manages either side — the host gets extra capabilities (e.g.
 * editing the field) gated separately on game.home === managingTeamId.
 */
function getManageableTeams(
  game: GameDetail,
  canEditTeam: (teamId: number) => boolean
): number[] {
  const teams: number[] = [];
  if (game.home && canEditTeam(game.home)) teams.push(game.home);
  if (game.away && canEditTeam(game.away)) teams.push(game.away);
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

  const { canEditTeam, loading: permsLoading } = usePermissions();

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

  // Auto-select team: use URL param if valid, otherwise auto-pick if only one manageable team.
  // Wait for permissions so we don't briefly auto-select a team the viewer can't manage.
  useEffect(() => {
    if (!game || permsLoading) return;
    const manageable = getManageableTeams(game, canEditTeam);
    if (Number.isFinite(teamIdFromUrl) && manageable.includes(teamIdFromUrl)) {
      setManagingTeamId(teamIdFromUrl);
    } else if (manageable.length === 1) {
      setManagingTeamId(manageable[0]);
    } else {
      setManagingTeamId(NaN);
    }
  }, [game, teamIdFromUrl, permsLoading, canEditTeam]);

  const selectTeam = (id: number) => {
    setManagingTeamId(id);
    // Update URL so it's shareable / survives refresh
    const url = new URL(window.location.href);
    url.searchParams.set("team", String(id));
    router.replace(url.pathname + url.search, undefined, { shallow: true });
  };

  const manageable = game ? getManageableTeams(game, canEditTeam) : [];
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

  const sourceLabel = game.source === "season" ? "SEASON" : game.source === "scrimmage" ? "SCRIMMAGE" : "TOURNAMENT";
  const sourceColor = game.source === "season" ? "#6aa5e9" : game.source === "scrimmage" ? "#a5e96a" : "#e9a56a";

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
            <TabsTrigger value="reports">Reports</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6">
            <OverviewTab
              game={game}
              canEditField={
                game.source === "scrimmage" &&
                Number.isFinite(managingTeamId) &&
                game.home === managingTeamId
              }
              canEditScore={
                game.source === "scrimmage" &&
                Number.isFinite(managingTeamId) &&
                game.home === managingTeamId
              }
              onGameChange={setGame}
            />
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

          <TabsContent value="reports" className="mt-6">
            {Number.isFinite(managingTeamId) ? (
              <ReportsTab
                game={game}
                source={source!}
                gameId={gameId}
                teamId={managingTeamId}
              />
            ) : (
              <TeamPickerCard game={game} manageable={manageable} onSelect={selectTeam} />
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
