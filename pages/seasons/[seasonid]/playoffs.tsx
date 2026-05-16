// pages/seasons/[seasonid]/playoffs.tsx
import { useCallback, useEffect, useRef, useState } from "react";
import SeasonProvider, { useSeason } from "@/components/seasons/SeasonProvider";
import SeasonShell from "@/components/seasons/SeasonShell";
import BracketPreview from "@/components/bracket/BracketPreview";
import type { BracketGameDetails } from "@/components/bracket/BracketPreview";
import LibraryPicker from "@/components/bracket/LibraryPicker";
import { seedLabelsFromAssignments } from "@/components/bracket/SeedAssignment";
import type { BracketStructure } from "@/components/bracket/types";
import BracketGameScheduleModal from "@/components/bracket/BracketGameScheduleModal";
import type { BracketGameRecord } from "@/components/bracket/BracketGameScheduleModal";
import StandingsModeToggle, { type StandingsMode } from "@/components/seasons/StandingsModeToggle";
import { GitBranch, Plus, Trash2, ChevronDown, ChevronRight, RefreshCw, AlertTriangle, X, Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type PredictionMethod,
  type BracketPredictionResult,
  type ActualGameResult,
  type GameRecord,
  type TeamRecord,
  preparePredictionStats,
  predictBracketPythagorean,
  predictBracketMonteCarlo,
} from "@/lib/bracket-prediction";

type SeasonBracket = {
  id: number;
  season_id?: number;
  name: string;
  sort_order: number;
  template_id: number | null;
  structure: BracketStructure | null;
  updated_at: string;
};

type TeamOpt = { id: number; name: string };
type StandingsRow = { teamid: number; rank_final: number };

const BTN_BASE =
  "inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors duration-100 border";

// ---------- Individual bracket card ----------
function BracketCard({
  bracket,
  seasonId,
  teams,
  standingsOrder,
  seedOffset,
  onDeleted,
  canEdit,
  standingsMode,
  asOfDate,
  projectedGamesCount,
}: {
  bracket: SeasonBracket;
  seasonId: number;
  teams: TeamOpt[];
  standingsOrder: number[];
  /** Cumulative number of seeds in all prior brackets (for correct offset into standings). */
  seedOffset: number;
  onDeleted: (id: number) => void;
  canEdit: boolean;
  standingsMode: import("@/components/seasons/StandingsModeToggle").StandingsMode;
  asOfDate: string;
  /** Number of regular-season games that were simulated to project seeds. 0 = all played. */
  projectedGamesCount: number;
}) {
  const [structure, setStructure] = useState<BracketStructure | null>(bracket.structure ?? null);
  const [templateId, setTemplateId] = useState<number | null>(bracket.template_id ?? null);
  const [templateName, setTemplateName] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const autoFillApplied = useRef(false);
  // Bracket game records (for scheduling)
  const [bracketGames, setBracketGames] = useState<BracketGameRecord[]>([]);
  const [scheduleGame, setScheduleGame] = useState<BracketGameRecord | null>(null);

  // Bracket prediction state
  const [prediction, setPrediction] = useState<BracketPredictionResult | null>(null);
  const [predicting, setPredicting] = useState(false);
  const [predictionMethod, setPredictionMethod] = useState<PredictionMethod>("pythagorean");
  // Cache all regular-season games (unfiltered); filtering by date applied at predict time
  const gamesCacheRef = useRef<GameRecord[] | null>(null);

  // Clear prediction and games cache when the standings context changes
  const prevModeRef = useRef(standingsMode);
  const prevDateRef = useRef(asOfDate);
  if (prevModeRef.current !== standingsMode || prevDateRef.current !== asOfDate) {
    prevModeRef.current = standingsMode;
    prevDateRef.current = asOfDate;
    if (prediction) setPrediction(null);
    // Invalidate cache so next predict re-filters by the new date
    gamesCacheRef.current = null;
  }

  // Fetch bracket game records
  const fetchBracketGames = useCallback(async () => {
    try {
      const res = await fetch(`/api/seasons/${seasonId}/games?game_type=playoff&bracket_id=${bracket.id}`);
      if (!res.ok) return;
      const data = await res.json();
      setBracketGames(Array.isArray(data?.games) ? data.games : []);
    } catch { /* no-op */ }
  }, [seasonId, bracket.id]);

  // Re-fetch bracket games when the tab regains focus so scores entered elsewhere stay in sync
  useEffect(() => {
    const onFocus = () => fetchBracketGames();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchBracketGames]);

  // Load assignments and bracket games on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/seasons/${seasonId}/brackets/${bracket.id}/assignments`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const assign: Record<number, number> = {};
        for (const a of data.assignments ?? []) {
          assign[a.seedIndex] = a.teamId;
        }
        setAssignments(assign);
      } catch { /* no-op */ } finally {
        if (!cancelled) setLoading(false);
      }
      // Also fetch existing bracket games
      if (!cancelled) fetchBracketGames();
    })();
    return () => { cancelled = true; };
  }, [seasonId, bracket.id, fetchBracketGames]);

  // Auto-seed from standings, but only when no bracket games have scores yet.
  // Once games are scored the bracket is in progress — re-seeding would corrupt
  // bracket_game_id assignments relative to the scored rows.
  useEffect(() => {
    if (!structure || standingsOrder.length === 0 || loading) return;
    // Freeze if any bracket game already has a score
    if (bracketGames.some((g) => g.homescore != null || g.awayscore != null)) return;
    const numSeeds = structure.numTeams;
    const offset = seedOffset;
    const next: Record<number, number> = {};
    for (let seed = 1; seed <= numSeeds; seed++) {
      const teamId = standingsOrder[offset + seed - 1];
      if (teamId != null) next[seed] = teamId;
    }
    // Only update + save if different from current
    if (JSON.stringify(next) === JSON.stringify(assignments)) return;
    setAssignments(next);
    // Auto-save to DB so bracket games stay in sync
    const arr = Object.entries(next)
      .filter(([, tid]) => Number.isFinite(tid))
      .map(([s, tid]) => ({ seedIndex: parseInt(s, 10), teamId: tid }));
    fetch(`/api/seasons/${seasonId}/brackets/${bracket.id}/assignments`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignments: arr }),
    }).then(() => fetchBracketGames()).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- assignments intentionally excluded to avoid loop
  }, [structure, standingsOrder, loading, seedOffset, bracket.id, seasonId, fetchBracketGames, bracketGames]);

  const handleSelectTemplate = useCallback(
    (template: { id: number; name: string; structure: BracketStructure }) => {
      setTemplateId(template.id);
      setTemplateName(template.name);
      setStructure(template.structure);
      setAssignments({});
      autoFillApplied.current = false;
      setPickerOpen(false);
    },
    []
  );

  const handleSave = useCallback(async () => {
    if (!structure || !templateId) {
      setError("Select a bracket template first.");
      return;
    }
    setSaving(true); setError(null);
    try {
      // Save bracket structure
      const patchRes = await fetch(`/api/seasons/${seasonId}/brackets/${bracket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template_id: templateId, structure }),
      });
      if (!patchRes.ok) {
        const j = await patchRes.json().catch(() => ({}));
        throw new Error(j.error || "Failed to save bracket");
      }
      // Save seed assignments
      const assignmentsArray = Object.entries(assignments)
        .filter(([, teamId]) => Number.isFinite(teamId))
        .map(([seedStr, teamId]) => ({ seedIndex: parseInt(seedStr, 10), teamId: teamId }));
      const asgRes = await fetch(`/api/seasons/${seasonId}/brackets/${bracket.id}/assignments`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignments: assignmentsArray }),
      });
      if (!asgRes.ok) {
        const j = await asgRes.json().catch(() => ({}));
        throw new Error(j.error || "Failed to save assignments");
      }
      // Re-fetch bracket games (generated by the sync)
      await fetchBracketGames();
    } catch (e: unknown) {
      setError((e as Error).message || "Save failed");
    } finally {
      setSaving(false);
    }
  }, [seasonId, bracket.id, structure, templateId, assignments, fetchBracketGames]);

  const handleDelete = useCallback(async () => {
    if (!confirm(`Delete "${bracket.name}"? This will remove the bracket and all seed assignments.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/seasons/${seasonId}/brackets/${bracket.id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Delete failed");
      }
      onDeleted(bracket.id);
    } catch (e: unknown) {
      setError((e as Error).message || "Delete failed");
      setDeleting(false);
    }
  }, [seasonId, bracket.id, bracket.name, onDeleted]);

  const seedLabels = seedLabelsFromAssignments(assignments, teams);

  // Build gameDetails map for BracketPreview
  const gameDetailsMap: Record<string, BracketGameDetails> = {};
  for (const g of bracketGames) {
    if (g.bracket_game_id) {
      gameDetailsMap[g.bracket_game_id] = {
        gamedate: g.gamedate,
        gametime: g.gametime,
        location: g.location,
        homescore: g.homescore,
        awayscore: g.awayscore,
        home_team: g.home_team,
        away_team: g.away_team,
      };
    }
  }

  const handleGameClick = (bracketGameId: string) => {
    const game = bracketGames.find((g) => g.bracket_game_id === bracketGameId);
    if (game) setScheduleGame(game);
  };

  // Prediction handler
  const handlePredict = useCallback(async () => {
    if (!structure || Object.keys(assignments).length === 0) return;
    setPredicting(true);
    try {
      // Fetch all regular-season games once (unfiltered; we apply date filtering below)
      if (!gamesCacheRef.current) {
        const res = await fetch(`/api/seasons/${seasonId}/games?game_type=regular`);
        if (!res.ok) throw new Error("Failed to fetch games");
        const data = await res.json();
        const allGames: any[] = Array.isArray(data?.games) ? data.games : [];
        gamesCacheRef.current = allGames
          .filter((g: any) => g.gamestatusid === 4 || g.gamestatusid === 6 || g.gamestatusid === 7)
          .map((g: any): GameRecord => ({
            gameid: g.id,
            home: g.home,
            away: g.away,
            homescore: g.homescore ?? null,
            awayscore: g.awayscore ?? null,
            gamedate: g.gamedate ?? null,
            winnerSide: g.gamestatusid === 6 ? "away" : g.gamestatusid === 7 ? "home" : null,
          }));
      }

      // When using as-of mode, only use games played on or before that date for stats
      const cutoffDate = standingsMode === "as-of" ? asOfDate : null;
      const gamesForStats = cutoffDate
        ? gamesCacheRef.current.filter((g) => !g.gamedate || g.gamedate <= cutoffDate)
        : gamesCacheRef.current;

      // Build team records from the teams prop
      const teamRecords: TeamRecord[] = teams.map((t) => ({ teamid: t.id, team: t.name }));

      // Compute Pythagorean stats from the date-filtered games
      const { statsMap, leagueAvgRaPerG, warning: baseWarning } = preparePredictionStats(
        gamesForStats,
        teamRecords,
      );

      // Build a combined warning that mentions projected seedings when applicable
      let warning = baseWarning;
      if (cutoffDate && projectedGamesCount > 0) {
        const seedNote = `Seeds are projected from simulated results for ${projectedGamesCount} unplayed regular-season game${projectedGamesCount !== 1 ? "s" : ""} as of ${cutoffDate}.`;
        warning = warning ? `${seedNote} ${warning}` : seedNote;
      }

      // Build team name lookup
      const teamNameMap: Record<number, string> = {};
      for (const t of teams) teamNameMap[t.id] = t.name;

      // Build actual game results — only bracket games played on or before the cutoff date
      const actualResults: Record<string, ActualGameResult> = {};
      for (const g of bracketGames) {
        if (
          g.bracket_game_id &&
          g.homescore != null && g.awayscore != null &&
          g.home != null && g.away != null &&
          // In as-of mode, exclude games played after the cutoff date
          (!cutoffDate || !g.gamedate || g.gamedate <= cutoffDate)
        ) {
          actualResults[g.bracket_game_id] = {
            home: g.home,
            away: g.away,
            homescore: g.homescore,
            awayscore: g.awayscore,
            gamestatusid: g.gamestatusid,
          };
        }
      }

      // Run prediction
      const result = predictionMethod === "pythagorean"
        ? predictBracketPythagorean(structure, assignments, teamNameMap, actualResults, statsMap, leagueAvgRaPerG, warning)
        : predictBracketMonteCarlo(structure, assignments, teamNameMap, actualResults, statsMap, leagueAvgRaPerG, 1000, warning);

      setPrediction(result);
    } catch (e: unknown) {
      setError((e as Error).message || "Prediction failed");
    } finally {
      setPredicting(false);
    }
  }, [structure, assignments, teams, seasonId, bracketGames, predictionMethod, standingsMode, asOfDate, projectedGamesCount]);

  return (
    <div className="border border-border bg-card">
      {/* Schedule modal */}
      {scheduleGame && (
        <BracketGameScheduleModal
          open={!!scheduleGame}
          onOpenChange={(open) => { if (!open) setScheduleGame(null); }}
          game={scheduleGame}
          seasonId={seasonId}
          onSaved={() => {
            setScheduleGame(null);
            fetchBracketGames();
          }}
        />
      )}

      {/* Bracket header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface">
        <h3
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 800,
            fontSize: "15px",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          {bracket.name}
        </h3>
        {canEdit && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="h-7 w-7 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
            title="Delete bracket"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="p-4 space-y-4">
        {error && (
          <div className="flex items-start gap-2 text-sm text-destructive border border-destructive/40 bg-destructive/10 p-3">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Template picker */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="label-section">
              Bracket template
              {templateName && (
                <span className="ml-2 text-foreground normal-case font-normal">{templateName}</span>
              )}
              {structure && (
                <span className="ml-1 text-muted-foreground normal-case font-normal">
                  · {structure.numTeams} seeds
                </span>
              )}
            </p>
            {canEdit && (
              <button
                type="button"
                onClick={() => setPickerOpen((o) => !o)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <RefreshCw className="h-3 w-3" />
                {pickerOpen ? "Hide" : structure ? "Change" : "Select template"}
                {pickerOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </button>
            )}
          </div>
          {pickerOpen && (
            <div className="mb-3">
              <LibraryPicker onSelect={handleSelectTemplate} selectedId={templateId} />
            </div>
          )}
        </div>

        {/* Bracket preview */}
        {structure ? (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="label-section">Preview</p>
              <div className="flex items-center gap-2">
                {/* Method toggle */}
                <div className="flex rounded border border-border overflow-hidden">
                  {(["pythagorean", "monte_carlo"] as PredictionMethod[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => { setPredictionMethod(m); setPrediction(null); }}
                      className={cn(
                        "px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors",
                        predictionMethod === m
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      )}
                      style={{ fontFamily: "var(--font-body)" }}
                    >
                      {m === "pythagorean" ? "Pythagorean" : "Monte Carlo"}
                    </button>
                  ))}
                </div>
                {/* Predict / Clear buttons */}
                {prediction ? (
                  <button
                    type="button"
                    onClick={() => setPrediction(null)}
                    className={cn(BTN_BASE, "border-border text-muted-foreground hover:bg-muted")}
                    style={{ fontFamily: "var(--font-body)" }}
                  >
                    <X className="h-3 w-3" />
                    Clear
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handlePredict}
                    disabled={predicting || Object.keys(assignments).length === 0}
                    className={cn(
                      BTN_BASE,
                      "bg-amber-500 text-white border-amber-500 hover:bg-amber-600 disabled:opacity-40"
                    )}
                    style={{ fontFamily: "var(--font-body)" }}
                  >
                    {predicting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    {predicting ? "Predicting…" : "Predict Bracket"}
                  </button>
                )}
              </div>
            </div>
            {/* Warning message */}
            {prediction?.warning && (
              <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 border border-amber-500/30 bg-amber-500/10 p-2 mb-2">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>{prediction.warning}</span>
              </div>
            )}
            <BracketPreview
              structure={structure}
              seedLabels={seedLabels}
              seedOffset={seedOffset}
              editable={false}
              onGameClick={bracketGames.length > 0 ? handleGameClick : undefined}
              gameDetails={bracketGames.length > 0 ? gameDetailsMap : undefined}
              predictionOverlay={prediction?.games}
            />
            {/* Champion banner */}
            {prediction && prediction.championId != null && (
              <div className="mt-3 flex items-center gap-3 px-4 py-3 border border-amber-500/40 bg-amber-500/10 rounded">
                <Sparkles className="h-5 w-5 text-amber-500 shrink-0" />
                <div>
                  <p className="text-sm font-bold" style={{ fontFamily: "var(--font-display)", textTransform: "uppercase" }}>
                    Predicted Champion: {prediction.championName}
                    {prediction.method === "monte_carlo" && prediction.championshipProbabilities?.[prediction.championId] != null && (
                      <span className="ml-2 text-xs font-semibold text-amber-600 dark:text-amber-400">
                        ({Math.round(prediction.championshipProbabilities[prediction.championId])}% chance)
                      </span>
                    )}
                  </p>
                  {prediction.method === "monte_carlo" && prediction.championshipProbabilities && (
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                      {Object.entries(prediction.championshipProbabilities)
                        .sort(([, a], [, b]) => b - a)
                        .slice(0, 6)
                        .map(([teamId, pct]) => {
                          const name = teams.find((t) => t.id === Number(teamId))?.name ?? `Team ${teamId}`;
                          return (
                            <span key={teamId} className="text-[10px] text-muted-foreground">
                              {name} <span className="font-semibold text-foreground">{Math.round(pct)}%</span>
                            </span>
                          );
                        })}
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {prediction.method === "pythagorean" ? "Pythagorean expectation" : `${prediction.simulationsRun?.toLocaleString()} simulations`}
                    {standingsMode === "as-of" && ` · as of ${asOfDate}`}
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-32 border border-dashed border-border/60 text-center">
            <GitBranch className="h-6 w-6 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">Select a template to preview the bracket</p>
          </div>
        )}

        {/* Save button */}
        {canEdit && (
          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !structure || !templateId}
              className={cn(BTN_BASE, "bg-primary text-primary-foreground border-primary hover:opacity-90 disabled:opacity-40")}
              style={{ fontFamily: "var(--font-body)" }}
            >
              {saving ? "Saving…" : "Save bracket"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Create bracket form ----------
function CreateBracketForm({
  seasonId,
  nextSortOrder,
  onCreated,
  onCancel,
}: {
  seasonId: number;
  nextSortOrder: number;
  onCreated: (b: SeasonBracket) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const SUGGESTED = ["Gold Bracket", "Silver Bracket", "Bronze Bracket", "Championship", "Consolation"];

  const handleCreate = async () => {
    if (!name.trim()) { setError("Name is required"); return; }
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/seasons/${seasonId}/brackets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), sort_order: nextSortOrder }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed to create");
      onCreated(j);
    } catch (e: unknown) {
      setError((e as Error).message || "Failed to create bracket");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
          New bracket
        </span>
        <button type="button" onClick={onCancel}>
          <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
        </button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <input
        className="w-full border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Gold Bracket"
        onKeyDown={(e) => e.key === "Enter" && handleCreate()}
        autoFocus
      />
      <div className="flex flex-wrap gap-1.5">
        {SUGGESTED.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setName(s)}
            className={cn(
              "px-2 py-0.5 text-[10px] border transition-colors",
              name === s
                ? "border-primary text-primary"
                : "border-border text-muted-foreground hover:border-primary/60"
            )}
            style={{ fontFamily: "var(--font-body)" }}
          >
            {s}
          </button>
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={cn(BTN_BASE, "border-border text-muted-foreground hover:bg-muted")} style={{ fontFamily: "var(--font-body)" }}>
          Cancel
        </button>
        <button type="button" onClick={handleCreate} disabled={saving} className={cn(BTN_BASE, "bg-primary text-primary-foreground border-primary hover:opacity-90 disabled:opacity-40")} style={{ fontFamily: "var(--font-body)" }}>
          {saving ? "Creating…" : "Create"}
        </button>
      </div>
    </div>
  );
}

// ---------- Main playoffs body ----------
function PlayoffsBody() {
  const { seasonId, canEdit } = useSeason();
  const [brackets, setBrackets] = useState<SeasonBracket[]>([]);
  const [teams, setTeams] = useState<TeamOpt[]>([]);
  const [standingsOrder, setStandingsOrder] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  /** Number of regular-season games projected (not yet played) as of the as-of date. 0 = season complete. */
  const [projectedGamesCount, setProjectedGamesCount] = useState(0);

  const [standingsMode, setStandingsMode] = useState<StandingsMode>("current");
  const [asOfDate, setAsOfDate] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [dateRange, setDateRange] = useState<{ minDate: string | null; maxDate: string | null }>({ minDate: null, maxDate: null });

  // Load brackets, teams, and date range once on mount
  useEffect(() => {
    if (!seasonId) return;
    let cancelled = false;
    (async () => {
      setLoading(true); setErr(null);
      try {
        const [bracketsRes, teamsRes, dateRangeRes] = await Promise.all([
          fetch(`/api/seasons/${seasonId}/brackets`),
          fetch(`/api/seasons/${seasonId}/teams`),
          fetch(`/api/seasons/${seasonId}/date-range`),
        ]);
        const bracketsData = bracketsRes.ok ? await bracketsRes.json() : { brackets: [] };
        const teamsData = teamsRes.ok ? await teamsRes.json() : { teams: [] };
        const dateRangeData = dateRangeRes.ok ? await dateRangeRes.json() : {};
        if (!cancelled) {
          setBrackets(Array.isArray(bracketsData?.brackets) ? bracketsData.brackets : []);
          const rawTeams = Array.isArray(teamsData?.teams) ? teamsData.teams : [];
          setTeams(rawTeams.map((t: any) => ({ id: t.id, name: t.name })));
          setDateRange({ minDate: dateRangeData.minDate ?? null, maxDate: dateRangeData.maxDate ?? null });
        }
      } catch (e: unknown) {
        if (!cancelled) setErr((e as Error).message || "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [seasonId]);

  // Reload standings whenever mode/asOfDate changes.
  // In as-of mode: use projected standings (simulates remaining games via Pythagorean)
  // so seeds reflect where teams *would* have finished, not just the partial table.
  useEffect(() => {
    if (!seasonId) return;
    let cancelled = false;
    (async () => {
      try {
        let url: string;
        let projected = 0;
        if (standingsMode === "as-of") {
          url = `/api/seasons/${seasonId}/projected-standings?asOfDate=${asOfDate}`;
          const standingsRes = await fetch(url);
          const standingsData = standingsRes.ok ? await standingsRes.json() : { standings: [] };
          if (!cancelled) {
            const standings: StandingsRow[] = Array.isArray(standingsData?.standings) ? standingsData.standings : [];
            projected = standingsData?.projectedGamesCount ?? 0;
            setStandingsOrder(standings.slice().sort((a, b) => a.rank_final - b.rank_final).map((r) => r.teamid));
            setProjectedGamesCount(projected);
          }
        } else {
          url = `/api/seasons/${seasonId}/standings`;
          if (standingsMode === "live") url += "?includeInProgress=true";
          const standingsRes = await fetch(url);
          const standingsData = standingsRes.ok ? await standingsRes.json() : { standings: [] };
          if (!cancelled) {
            const standings: StandingsRow[] = Array.isArray(standingsData?.standings) ? standingsData.standings : [];
            setStandingsOrder(standings.slice().sort((a, b) => a.rank_final - b.rank_final).map((r) => r.teamid));
            setProjectedGamesCount(0);
          }
        }
      } catch { /* no-op */ }
    })();
    return () => { cancelled = true; };
  }, [seasonId, standingsMode, asOfDate]);

  const handleBracketCreated = (b: SeasonBracket) => {
    setBrackets((prev) => [...prev, b].sort((a, x) => a.sort_order - x.sort_order));
    setShowCreate(false);
  };

  const handleBracketDeleted = (id: number) => {
    setBrackets((prev) => prev.filter((b) => b.id !== id));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: "20px",
              textTransform: "uppercase",
              letterSpacing: "-0.01em",
            }}
          >
            Playoffs
          </h2>
          {!loading && (
            <p className="text-xs text-muted-foreground mt-0.5" style={{ fontFamily: "var(--font-body)" }}>
              {brackets.length} bracket{brackets.length !== 1 ? "s" : ""}
              {standingsOrder.length > 0 &&
                ` · ${standingsOrder.length} team${standingsOrder.length !== 1 ? "s" : ""} seeded from standings`}
              {projectedGamesCount > 0 &&
                ` · ${projectedGamesCount} game${projectedGamesCount !== 1 ? "s" : ""} projected`}
            </p>
          )}
          <div className="mt-2">
            <StandingsModeToggle
              mode={standingsMode}
              onModeChange={setStandingsMode}
              asOfDate={asOfDate}
              onAsOfDateChange={setAsOfDate}
              minDate={dateRange.minDate}
              maxDate={dateRange.maxDate}
            />
          </div>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => setShowCreate((s) => !s)}
            className={cn(BTN_BASE, "bg-primary text-primary-foreground border-primary hover:opacity-90")}
            style={{ fontFamily: "var(--font-body)" }}
          >
            <Plus className="h-3.5 w-3.5" />
            Add Bracket
          </button>
        )}
      </div>

      {showCreate && seasonId && (
        <div className="mb-5">
          <CreateBracketForm
            seasonId={seasonId}
            nextSortOrder={brackets.length}
            onCreated={handleBracketCreated}
            onCancel={() => setShowCreate(false)}
          />
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-48 bg-elevated animate-pulse" />
          ))}
        </div>
      ) : err ? (
        <div className="border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{err}</div>
      ) : brackets.length === 0 && !showCreate ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border/60">
          <GitBranch className="h-8 w-8 text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium text-foreground mb-1" style={{ fontFamily: "var(--font-display)", textTransform: "uppercase" }}>
            No Brackets Yet
          </p>
          <p className="text-xs text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
            Create brackets like &ldquo;Gold&rdquo; and &ldquo;Silver&rdquo; to organize your playoffs.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {(() => {
            // Compute cumulative seed offsets so each bracket picks the correct slice of standings
            const sorted = [...brackets].sort((a, b) => a.sort_order - b.sort_order);
            const offsets = new Map<number, number>();
            let cumulative = 0;
            for (const b of sorted) {
              offsets.set(b.id, cumulative);
              cumulative += b.structure?.numTeams ?? 0;
            }
            return brackets.map((b) =>
              seasonId ? (
                <BracketCard
                  key={b.id}
                  bracket={b}
                  seasonId={seasonId}
                  teams={teams}
                  standingsOrder={standingsOrder}
                  seedOffset={offsets.get(b.id) ?? 0}
                  onDeleted={handleBracketDeleted}
                  canEdit={canEdit}
                  standingsMode={standingsMode}
                  asOfDate={asOfDate}
                  projectedGamesCount={projectedGamesCount}
                />
              ) : null
            );
          })()}
        </div>
      )}
    </div>
  );
}

export default function PlayoffsPage() {
  return (
    <SeasonProvider>
      <SeasonShell tab="playoffs">
        <PlayoffsBody />
      </SeasonShell>
    </SeasonProvider>
  );
}
