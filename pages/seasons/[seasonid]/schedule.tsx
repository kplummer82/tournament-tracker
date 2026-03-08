// pages/seasons/[seasonid]/schedule.tsx
import { useCallback, useEffect, useState } from "react";
import SeasonProvider, { useSeason } from "@/components/seasons/SeasonProvider";
import SeasonShell from "@/components/seasons/SeasonShell";
import Link from "next/link";
import { Plus, Pencil, Trash2, Swords, X, ExternalLink } from "lucide-react";
import { formatMMDDYY, formatHHMMAMPM } from "@/lib/datetime";
import { cn } from "@/lib/utils";

// Games API returns: { id, gamedate, gametime, home (id), home_team (name), away (id), away_team (name), ... }
type GameRow = {
  id: number;
  home: number | null;
  away: number | null;
  home_team: string | null;
  away_team: string | null;
  gamedate: string | null;
  gametime: string | null;
  homescore: number | null;
  awayscore: number | null;
  gamestatus_label: string | null;
  gamestatusid: number | null;
  location: string | null;
  field: string | null;
  game_type: string;
  bracket_id: number | null;
  bracket_game_id: string | null;
  bracket_name: string | null;
};

// Teams API returns: { teams: [{ id, name }] }
type TeamOpt = { id: number; name: string };
type StatusOpt = { id: number; name: string };

const INPUT =
  "w-full border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors";

const BTN =
  "inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors duration-100 border";

type GameForm = {
  gamedate: string;
  gametime: string;
  home: string;
  away: string;
  homescore: string;
  awayscore: string;
  gamestatusid: string;
  location: string;
  field: string;
};

const BLANK_FORM: GameForm = {
  gamedate: "", gametime: "", home: "", away: "",
  homescore: "", awayscore: "", gamestatusid: "",
  location: "", field: "",
};

// Forfeit game status IDs
const HOME_TEAM_FORFEIT_ID = 6; // home forfeited → away wins
const AWAY_TEAM_FORFEIT_ID = 7; // away forfeited → home wins

function ScoreCell({ score, isWinner }: { score: number | null; isWinner?: boolean }) {
  if (score == null) return <span className="text-muted-foreground/40">—</span>;
  return (
    <span
      className={cn("tabular-nums", isWinner ? "text-primary" : "text-foreground/60")}
      style={{
        fontFamily: "var(--font-display)",
        fontWeight: isWinner ? 800 : 600,
        fontSize: "20px",
        letterSpacing: "-0.02em",
        lineHeight: 1,
      }}
    >
      {score}
    </span>
  );
}

function GameFormPanel({
  form,
  setForm,
  teams,
  statuses,
  saving,
  error,
  onSave,
  onCancel,
  isEdit,
}: {
  form: GameForm;
  setForm: React.Dispatch<React.SetStateAction<GameForm>>;
  teams: TeamOpt[];
  statuses: StatusOpt[];
  saving: boolean;
  error: string | null;
  onSave: () => void;
  onCancel: () => void;
  isEdit: boolean;
}) {
  return (
    <div className="mb-5 p-4 border border-border bg-card space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
          {isEdit ? "Edit Game" : "Add Game"}
        </span>
        <button type="button" onClick={onCancel}>
          <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
        </button>
      </div>
      {error && <p className="text-xs text-destructive" style={{ fontFamily: "var(--font-body)" }}>{error}</p>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <input
          className={INPUT}
          type="date"
          value={form.gamedate}
          onChange={(e) => setForm((p) => ({ ...p, gamedate: e.target.value }))}
          placeholder="Date"
        />
        <input
          className={INPUT}
          type="time"
          value={form.gametime}
          onChange={(e) => setForm((p) => ({ ...p, gametime: e.target.value }))}
          placeholder="Time (optional)"
        />
        <select
          className={INPUT}
          value={form.home}
          onChange={(e) => setForm((p) => ({ ...p, home: e.target.value }))}
        >
          <option value="">Home team…</option>
          {teams.map((t) => <option key={t.id} value={String(t.id)}>{t.name}</option>)}
        </select>
        <select
          className={INPUT}
          value={form.away}
          onChange={(e) => setForm((p) => ({ ...p, away: e.target.value }))}
        >
          <option value="">Away team…</option>
          {teams.map((t) => <option key={t.id} value={String(t.id)}>{t.name}</option>)}
        </select>
        <input
          className={INPUT}
          type="text"
          value={form.location}
          onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
          placeholder="Location"
        />
        <input
          className={INPUT}
          type="text"
          value={form.field}
          onChange={(e) => setForm((p) => ({ ...p, field: e.target.value }))}
          placeholder="Field"
        />
        <input
          className={INPUT}
          type="number"
          value={form.homescore}
          onChange={(e) => setForm((p) => ({ ...p, homescore: e.target.value }))}
          placeholder="Home score"
          disabled={form.gamestatusid === String(HOME_TEAM_FORFEIT_ID) || form.gamestatusid === String(AWAY_TEAM_FORFEIT_ID)}
        />
        <input
          className={INPUT}
          type="number"
          value={form.awayscore}
          onChange={(e) => setForm((p) => ({ ...p, awayscore: e.target.value }))}
          placeholder="Away score"
          disabled={form.gamestatusid === String(HOME_TEAM_FORFEIT_ID) || form.gamestatusid === String(AWAY_TEAM_FORFEIT_ID)}
        />
        <select
          className={INPUT}
          value={form.gamestatusid}
          onChange={(e) => setForm((p) => ({ ...p, gamestatusid: e.target.value }))}
        >
          <option value="">Status…</option>
          {statuses.map((s) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
        </select>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={cn(BTN, "border-border text-muted-foreground hover:bg-muted")} style={{ fontFamily: "var(--font-body)" }}>
          Cancel
        </button>
        <button type="button" onClick={onSave} disabled={saving} className={cn(BTN, "bg-primary text-primary-foreground border-primary hover:opacity-90 disabled:opacity-40")} style={{ fontFamily: "var(--font-body)" }}>
          {saving ? "Saving…" : isEdit ? "Save Changes" : "Add Game"}
        </button>
      </div>
    </div>
  );
}

function buildGamePayload(form: GameForm, extra: Record<string, unknown> = {}) {
  return {
    home: Number(form.home) || null,
    away: Number(form.away) || null,
    gamedate: form.gamedate || null,
    // API requires gametime; default to 00:00 if not provided
    gametime: form.gametime || "00:00",
    homescore: form.homescore !== "" ? Number(form.homescore) : null,
    awayscore: form.awayscore !== "" ? Number(form.awayscore) : null,
    gamestatusid: form.gamestatusid !== "" ? Number(form.gamestatusid) : null,
    location: form.location || null,
    field: form.field || null,
    ...extra,
  };
}

type GameFilter = "all" | "regular" | "playoff";

function ScheduleBody() {
  const { seasonId } = useSeason();
  const [rows, setRows] = useState<GameRow[]>([]);
  const [teams, setTeams] = useState<TeamOpt[]>([]);
  const [statuses, setStatuses] = useState<StatusOpt[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [filter, setFilter] = useState<GameFilter>("all");

  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState<GameForm>(BLANK_FORM);
  const [adding, setAdding] = useState(false);
  const [addErr, setAddErr] = useState<string | null>(null);

  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<GameForm>(BLANK_FORM);
  const [editing, setEditing] = useState(false);
  const [editErr, setEditErr] = useState<string | null>(null);

  useEffect(() => {
    if (!seasonId) return;
    let cancelled = false;
    (async () => {
      setLoading(true); setErr(null);
      try {
        const [gamesRes, teamsRes, statusRes] = await Promise.all([
          fetch(`/api/seasons/${seasonId}/games?game_type=all`),
          fetch(`/api/seasons/${seasonId}/teams`),
          fetch(`/api/gamestatusoptions`),
        ]);
        const gamesData = gamesRes.ok ? await gamesRes.json() : { games: [] };
        // Teams: { teams: [...] }
        const teamsData = teamsRes.ok ? await teamsRes.json() : { teams: [] };
        // Statuses: { statuses: [{ id, gamestatus, gamestatusdescription }] }
        const statusData = statusRes.ok ? await statusRes.json() : { statuses: [] };
        if (!cancelled) {
          setRows(Array.isArray(gamesData?.games) ? gamesData.games : []);
          setTeams(Array.isArray(teamsData?.teams) ? teamsData.teams : []);
          const rawStatuses: { id: number; gamestatus: string }[] = Array.isArray(statusData?.statuses) ? statusData.statuses : [];
          setStatuses(rawStatuses.map((s) => ({ id: s.id, name: s.gamestatus })));
        }
      } catch (e: unknown) {
        if (!cancelled) setErr((e as Error).message || "Failed to load schedule");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [seasonId, version]);

  const validateForm = (form: GameForm): string | null => {
    if (!form.home) return "Select home team";
    if (!form.away) return "Select away team";
    if (form.home === form.away) return "Home and away teams must be different";
    if (!form.gamedate) return "Date is required";
    return null;
  };

  const handleAdd = useCallback(async () => {
    if (!seasonId) return;
    const validErr = validateForm(addForm);
    if (validErr) { setAddErr(validErr); return; }
    setAdding(true); setAddErr(null);
    try {
      const res = await fetch(`/api/seasons/${seasonId}/games`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildGamePayload(addForm, { game_type: "regular" })),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed to add game");
      setAddForm(BLANK_FORM);
      setShowAdd(false);
      setVersion((v) => v + 1);
    } catch (e: unknown) {
      setAddErr((e as Error).message || "Failed to add game");
    } finally {
      setAdding(false);
    }
  }, [seasonId, addForm]);

  const openEdit = (g: GameRow) => {
    setEditId(g.id);
    setEditForm({
      gamedate: g.gamedate ? g.gamedate.slice(0, 10) : "",
      gametime: g.gametime ? g.gametime.slice(0, 5) : "",
      home: g.home != null ? String(g.home) : "",
      away: g.away != null ? String(g.away) : "",
      homescore: g.homescore != null ? String(g.homescore) : "",
      awayscore: g.awayscore != null ? String(g.awayscore) : "",
      gamestatusid: g.gamestatusid != null ? String(g.gamestatusid) : "",
      location: g.location ?? "",
      field: g.field ?? "",
    });
    setEditErr(null);
  };

  const handleEdit = useCallback(async () => {
    if (!seasonId || editId == null) return;
    const validErr = validateForm(editForm);
    if (validErr) { setEditErr(validErr); return; }
    setEditing(true); setEditErr(null);
    try {
      const res = await fetch(`/api/seasons/${seasonId}/games`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editId, ...buildGamePayload(editForm) }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed to update game");
      setEditId(null);
      setVersion((v) => v + 1);
    } catch (e: unknown) {
      setEditErr((e as Error).message || "Failed to update game");
    } finally {
      setEditing(false);
    }
  }, [seasonId, editId, editForm]);

  const handleDelete = useCallback(async (id: number) => {
    if (!seasonId || !confirm("Delete this game?")) return;
    try {
      const res = await fetch(`/api/seasons/${seasonId}/games/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Failed to delete");
      }
      setRows((prev) => prev.filter((g) => g.id !== id));
    } catch (e: unknown) {
      alert((e as Error).message || "Failed to delete game");
    }
  }, [seasonId]);

  const renderRows = (gameList: GameRow[]) =>
    gameList.map((g) => {
      const hasScore = g.homescore != null && g.awayscore != null;
      const homeWon = hasScore && g.homescore! > g.awayscore!;
      const awayWon = hasScore && g.awayscore! > g.homescore!;
      const isForfeit = g.gamestatusid === HOME_TEAM_FORFEIT_ID || g.gamestatusid === AWAY_TEAM_FORFEIT_ID;
      const forfeitWinner = g.gamestatusid === HOME_TEAM_FORFEIT_ID ? "away" : g.gamestatusid === AWAY_TEAM_FORFEIT_ID ? "home" : null;
      const isEditing = editId === g.id;
      return (
        <>
          {isEditing && (
            <tr key={`edit-${g.id}`}>
              <td colSpan={7} className="p-0">
                <GameFormPanel
                  form={editForm}
                  setForm={setEditForm}
                  teams={teams}
                  statuses={statuses}
                  saving={editing}
                  error={editErr}
                  onSave={handleEdit}
                  onCancel={() => { setEditId(null); setEditErr(null); }}
                  isEdit
                />
              </td>
            </tr>
          )}
          <tr key={g.id} className={cn("border-b border-border/50 last:border-0 hover:bg-elevated transition-colors duration-100", isEditing && "bg-elevated/50")}>
            <td className="p-3 text-xs text-muted-foreground whitespace-nowrap" style={{ fontFamily: "var(--font-body)", fontVariantNumeric: "tabular-nums" }}>
              <div>{g.gamedate ? formatMMDDYY(g.gamedate) : "—"}</div>
              {(g.location || g.field) && (
                <div className="text-[10px] text-muted-foreground/60 mt-0.5 truncate max-w-[140px]">
                  {[g.location, g.field].filter(Boolean).join(" · ")}
                </div>
              )}
            </td>
            <td className="p-3 text-xs text-muted-foreground whitespace-nowrap" style={{ fontFamily: "var(--font-body)", fontVariantNumeric: "tabular-nums" }}>
              {g.gametime ? formatHHMMAMPM(g.gamedate ?? "", g.gametime) : "—"}
            </td>
            <td className="p-3 font-medium" style={{ fontFamily: "var(--font-body)" }}>{g.home_team ?? "TBD"}</td>
            <td className="p-3 font-medium" style={{ fontFamily: "var(--font-body)" }}>{g.away_team ?? "TBD"}</td>
            <td className="p-3">
              {isForfeit ? (
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className={cn("text-sm font-semibold", forfeitWinner === "home" ? "text-primary" : "text-foreground/40")}
                    style={{ fontFamily: "var(--font-body)" }}
                    title={forfeitWinner === "home" ? "Won by forfeit" : "Lost by forfeit"}
                  >
                    {g.home_team ?? "Home"}
                  </span>
                  <span className="text-[10px] text-muted-foreground/50 font-mono uppercase tracking-wider">F</span>
                  <span
                    className={cn("text-sm font-semibold", forfeitWinner === "away" ? "text-primary" : "text-foreground/40")}
                    style={{ fontFamily: "var(--font-body)" }}
                    title={forfeitWinner === "away" ? "Won by forfeit" : "Lost by forfeit"}
                  >
                    {g.away_team ?? "Away"}
                  </span>
                </span>
              ) : (
                <span className="inline-flex items-baseline gap-2">
                  <ScoreCell score={g.homescore} isWinner={homeWon} />
                  {hasScore && <span className="text-muted-foreground/30 text-xs">–</span>}
                  <ScoreCell score={g.awayscore} isWinner={awayWon} />
                </span>
              )}
            </td>
            <td className="p-3">
              <div className="flex items-center gap-1.5 flex-wrap">
                {g.game_type === "playoff" && (
                  <span className="badge" style={{ background: "#7c3aed18", color: "#7c3aed", borderColor: "#7c3aed30" }}>
                    {g.bracket_name ?? "Playoff"}
                  </span>
                )}
                {g.gamestatus_label && (
                  <span className="badge" style={{ background: "#5a5a5a18", color: "#8a8a8a", borderColor: "#5a5a5a30" }}>
                    {g.gamestatus_label}
                  </span>
                )}
              </div>
            </td>
            <td className="p-3">
              <div className="flex items-center justify-end gap-1">
                <Link
                  href={`/games/season/${g.id}`}
                  className="h-7 w-7 flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
                  title="Manage game"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
                <button
                  type="button"
                  onClick={() => openEdit(g)}
                  className="h-7 w-7 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                  title="Edit game"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(g.id)}
                  className="h-7 w-7 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
                  title="Delete game"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </td>
          </tr>
        </>
      );
    });

  const filteredRows = filter === "all" ? rows : rows.filter((g) => g.game_type === filter);
  const regularCount = rows.filter((g) => g.game_type === "regular").length;
  const playoffCount = rows.filter((g) => g.game_type === "playoff").length;

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "20px", textTransform: "uppercase", letterSpacing: "-0.01em" }}>
            Schedule
          </h2>
          {!loading && !err && (
            <p className="text-xs text-muted-foreground mt-0.5" style={{ fontFamily: "var(--font-body)" }}>
              {regularCount} regular{playoffCount > 0 ? ` · ${playoffCount} playoff` : ""} game{rows.length !== 1 ? "s" : ""}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => { setShowAdd((s) => !s); setAddForm(BLANK_FORM); setAddErr(null); }}
          className={cn(BTN, "bg-primary text-primary-foreground border-primary hover:opacity-90")}
          style={{ fontFamily: "var(--font-body)" }}
        >
          <Plus className="h-3.5 w-3.5" />
          Add Game
        </button>
      </div>

      {/* Game type filter */}
      {!loading && !err && playoffCount > 0 && (
        <div className="flex items-center gap-1 mb-4">
          {(["all", "regular", "playoff"] as GameFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                "px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] border transition-colors",
                filter === f
                  ? "border-primary text-primary bg-primary/5"
                  : "border-border text-muted-foreground hover:border-primary/60"
              )}
              style={{ fontFamily: "var(--font-body)" }}
            >
              {f === "all" ? `All (${rows.length})` : f === "regular" ? `Regular (${regularCount})` : `Playoff (${playoffCount})`}
            </button>
          ))}
        </div>
      )}

      {showAdd && (
        <GameFormPanel
          form={addForm}
          setForm={setAddForm}
          teams={teams}
          statuses={statuses}
          saving={adding}
          error={addErr}
          onSave={handleAdd}
          onCancel={() => { setShowAdd(false); setAddErr(null); }}
          isEdit={false}
        />
      )}

      {loading ? (
        <div className="space-y-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-12 bg-elevated animate-pulse" />
          ))}
        </div>
      ) : err ? (
        <div className="border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{err}</div>
      ) : filteredRows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border/60">
          <Swords className="h-8 w-8 text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium text-foreground mb-1" style={{ fontFamily: "var(--font-display)", textTransform: "uppercase" }}>
            {rows.length === 0 ? "No Games Yet" : "No Matching Games"}
          </p>
          <p className="text-xs text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
            {rows.length === 0
              ? "Add regular season games to track scores and standings."
              : "Try changing the filter above."}
          </p>
        </div>
      ) : (
        <div className="border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface">
                {["Date", "Time", "Home", "Away", "Score", "Status", ""].map((h) => (
                  <th key={h} className={cn("p-3 label-section", h === "" ? "text-right" : "text-left")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>{renderRows(filteredRows)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function SchedulePage() {
  return (
    <SeasonProvider>
      <SeasonShell tab="schedule">
        <ScheduleBody />
      </SeasonShell>
    </SeasonProvider>
  );
}
