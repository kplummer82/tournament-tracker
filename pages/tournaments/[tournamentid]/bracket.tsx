import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import TournamentProvider, { useTournament } from "@/components/tournaments/TournamentProvider";
import TournamentShell from "@/components/tournaments/TournamentShell";
import BracketPreview from "@/components/bracket/BracketPreview";
import type { BracketGameDetails } from "@/components/bracket/BracketPreview";
import LibraryPicker from "@/components/bracket/LibraryPicker";
import BracketGameScheduleModal from "@/components/bracket/BracketGameScheduleModal";
import type { BracketGameRecord } from "@/components/bracket/BracketGameScheduleModal";
import SeedAssignment, { seedLabelsFromAssignments } from "@/components/bracket/SeedAssignment";
import { Button } from "@/components/ui/button";
import { shuffle } from "@/lib/shuffle";
import type { BracketStructure } from "@/components/bracket/types";
import { validateFirstRoundSeeds } from "@/components/bracket/types";
import type { TournamentStandingsRow as StandingsRow } from "@/pages/api/tournaments/[tournamentid]/standings";
import {
  GitBranch,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Plus,
  Trash2,
  X,
  Pencil,
  Check,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import GameSourceToggles from "@/components/tournaments/GameSourceToggles";
import PredictTournamentButton, { PredictionBanner } from "@/components/tournaments/PredictTournamentButton";
import { useGameSources } from "@/lib/hooks/useGameSources";
import {
  fetchTournamentPrediction,
  statsMapFrom,
  type TournamentPrediction,
} from "@/lib/tournaments/prediction";
import {
  predictBracketPythagorean,
  type ActualGameResult,
  type BracketPredictionResult,
} from "@/lib/bracket-prediction";

type TeamOpt = { id: number; name: string };

type TournamentBracket = {
  id: number;
  tournament_id: number;
  name: string;
  sort_order: number;
  template_id: number | null;
  template_name: string | null;
  structure: BracketStructure | null;
  updated_at: string;
};

const BTN_BASE =
  "inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors duration-100 border";

const SUGGESTED_NAMES = ["Championship", "Gold Bracket", "Silver Bracket", "Bronze Bracket", "Consolation"];

// ---------- Create bracket inline form ----------
function CreateBracketForm({
  tournamentId,
  nextSortOrder,
  onCreated,
  onCancel,
}: {
  tournamentId: number;
  nextSortOrder: number;
  onCreated: (b: TournamentBracket) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim()) { setError("Name is required"); return; }
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/brackets`, {
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
        <span
          className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground"
          style={{ fontFamily: "var(--font-body)" }}
        >
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
        {SUGGESTED_NAMES.map((s) => (
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
        <button
          type="button"
          onClick={onCancel}
          className={cn(BTN_BASE, "border-border text-muted-foreground hover:bg-muted")}
          style={{ fontFamily: "var(--font-body)" }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleCreate}
          disabled={saving}
          className={cn(BTN_BASE, "bg-primary text-primary-foreground border-primary hover:opacity-90 disabled:opacity-40")}
          style={{ fontFamily: "var(--font-body)" }}
        >
          {saving ? "Creating…" : "Create"}
        </button>
      </div>
    </div>
  );
}

// ---------- Individual bracket panel ----------
function BracketPanel({
  bracket,
  tournamentId,
  teams,
  standingsOrder,
  seedOffset,
  games,
  unscheduledGameIds,
  includeInProgress,
  onIncludeInProgressChange,
  onDeleted,
  onUpdated,
  canEdit,
  hasPoolPlay,
  prediction,
  predictedSeedOrder,
}: {
  bracket: TournamentBracket;
  tournamentId: number;
  teams: TeamOpt[];
  standingsOrder: number[];
  /** Cumulative number of seeds in all brackets ordered before this one. */
  seedOffset: number;
  games: { gamestatusid: number | null }[];
  /** bracket_game_ids in this bracket still missing date/time or venue/field. */
  unscheduledGameIds: string[];
  includeInProgress: boolean;
  onIncludeInProgressChange: (v: boolean) => void;
  onDeleted: (id: number) => void;
  onUpdated: (b: Partial<TournamentBracket> & { id: number }) => void;
  canEdit: boolean;
  /** When false, the tournament skips pool play — seed manually/randomly instead of from standings. */
  hasPoolPlay: boolean;
  /** Active tournament projection, or null when none is running. Never persisted. */
  prediction: TournamentPrediction | null;
  /** Seed ordering implied by the projected standings, same shape as `standingsOrder`. */
  predictedSeedOrder: number[];
}) {
  const [structure, setStructure] = useState<BracketStructure | null>(bracket.structure ?? null);
  const [templateId, setTemplateId] = useState<number | null>(bracket.template_id ?? null);
  const [templateName, setTemplateName] = useState<string | null>(bracket.template_name ?? null);
  const [assignments, setAssignments] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(bracket.name);
  const [bracketGames, setBracketGames] = useState<BracketGameRecord[]>([]);
  const [scheduleGame, setScheduleGame] = useState<BracketGameRecord | null>(null);

  const fetchBracketGames = useCallback(async () => {
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/brackets/${bracket.id}/games`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setBracketGames(Array.isArray(data?.games) ? data.games : []);
    } catch { /* no-op */ }
  }, [tournamentId, bracket.id]);

  // Load assignments + bracket games on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/tournaments/${tournamentId}/brackets/${bracket.id}/assignments`);
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
      if (!cancelled) fetchBracketGames();
    })();
    return () => { cancelled = true; };
  }, [tournamentId, bracket.id, fetchBracketGames]);

  // Refresh on window focus so scores entered elsewhere stay in sync
  useEffect(() => {
    const onFocus = () => fetchBracketGames();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchBracketGames]);

  const atLeastOneFinal = games.some((g) => g.gamestatusid === 4);
  const allFinal = games.length > 0 && games.every((g) => g.gamestatusid === 4);

  // Auto-fill seeds from standings once at least one pool game is final, offset by
  // upstream brackets. Mirrors the season playoffs page: also auto-persists the
  // assignments (which syncs tournamentgames rows) so bracket games become clickable
  // without a manual save. Frozen once any bracket game has a score, so re-seeding can
  // never corrupt bracket_game_id ↔ scored-row alignment.
  useEffect(() => {
    // Direct-to-bracket tournaments seed manually/randomly — never auto-fill from standings.
    if (!hasPoolPlay) return;
    if (!atLeastOneFinal || standingsOrder.length === 0 || !structure || loading) return;
    // Freeze if any bracket game already has a score — bracket is in progress
    if (bracketGames.some((g) => g.homescore != null || g.awayscore != null)) return;
    const next: Record<number, number> = {};
    for (let seed = 1; seed <= structure.numTeams; seed++) {
      const teamId = standingsOrder[seedOffset + seed - 1];
      if (teamId != null) next[seed] = teamId;
    }
    // Only update + persist if different from current
    if (JSON.stringify(next) === JSON.stringify(assignments)) return;
    setAssignments(next);
    // Auto-save to DB so tournamentgames stay in sync and games become clickable
    const arr = Object.entries(next)
      .filter(([, teamId]) => Number.isFinite(teamId))
      .map(([s, teamId]) => ({ seedIndex: parseInt(s, 10), teamId }));
    fetch(`/api/tournaments/${tournamentId}/brackets/${bracket.id}/assignments`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignments: arr }),
    }).then(() => fetchBracketGames()).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- assignments intentionally excluded to avoid loop
  }, [hasPoolPlay, atLeastOneFinal, standingsOrder, structure, loading, seedOffset, bracket.id, tournamentId, fetchBracketGames, bracketGames]);

  const handleSelectTemplate = useCallback(
    (template: { id: number; name: string; structure: BracketStructure }) => {
      setTemplateId(template.id);
      setTemplateName(template.name);
      setStructure(template.structure);
      setAssignments({});
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
      const patchRes = await fetch(`/api/tournaments/${tournamentId}/brackets/${bracket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template_id: templateId, structure }),
      });
      if (!patchRes.ok) {
        const j = await patchRes.json().catch(() => ({}));
        throw new Error(j.error || "Failed to save bracket");
      }
      const assignmentsArray = Object.entries(assignments)
        .filter(([, teamId]) => Number.isFinite(teamId))
        .map(([seedStr, teamId]) => ({ seedIndex: parseInt(seedStr, 10), teamId }));
      const asgRes = await fetch(`/api/tournaments/${tournamentId}/brackets/${bracket.id}/assignments`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignments: assignmentsArray }),
      });
      if (!asgRes.ok) {
        const j = await asgRes.json().catch(() => ({}));
        throw new Error(j.error || "Failed to save assignments");
      }
      // Propagate the new structure/template up so re-mounting (e.g. tab switch) keeps the saved state
      onUpdated({ id: bracket.id, structure, template_id: templateId, template_name: templateName });
      // Refresh bracket games — sync may have generated new rows
      await fetchBracketGames();
    } catch (e: unknown) {
      setError((e as Error).message || "Save failed");
    } finally {
      setSaving(false);
    }
  }, [tournamentId, bracket.id, structure, templateId, templateName, assignments, onUpdated, fetchBracketGames]);

  const handleRename = useCallback(async () => {
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === bracket.name) {
      setRenaming(false);
      setNameDraft(bracket.name);
      return;
    }
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/brackets/${bracket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Rename failed");
      }
      onUpdated({ id: bracket.id, name: trimmed });
      setRenaming(false);
    } catch (e: unknown) {
      setError((e as Error).message || "Rename failed");
      setNameDraft(bracket.name);
      setRenaming(false);
    }
  }, [tournamentId, bracket.id, bracket.name, nameDraft, onUpdated]);

  const handleDelete = useCallback(async () => {
    if (!confirm(`Delete "${bracket.name}"? This will remove the bracket and all seed assignments.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/brackets/${bracket.id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Delete failed");
      }
      onDeleted(bracket.id);
    } catch (e: unknown) {
      setError((e as Error).message || "Delete failed");
      setDeleting(false);
    }
  }, [tournamentId, bracket.id, bracket.name, onDeleted]);

  const seedLabels = seedLabelsFromAssignments(assignments, teams);

  // Direct-to-bracket seeding: freeze once any bracket game has a score.
  const bracketStarted = bracketGames.some((g) => g.homescore != null || g.awayscore != null);
  const handleRandomizeSeeds = () => {
    if (!structure) return;
    const ids = shuffle(teams.map((tm) => tm.id));
    const next: Record<number, number> = {};
    for (let seed = 1; seed <= structure.numTeams; seed++) {
      if (ids[seed - 1] != null) next[seed] = ids[seed - 1];
    }
    setAssignments(next);
  };

  // Build gameDetails map for BracketPreview
  const unscheduledSet = new Set(unscheduledGameIds);
  const gameDetailsMap: Record<string, BracketGameDetails> = {};
  for (const g of bracketGames) {
    if (g.bracket_game_id) {
      gameDetailsMap[g.bracket_game_id] = {
        gamedate: g.gamedate,
        gametime: g.gametime,
        location: g.location,
        field: g.field,
        homescore: g.homescore,
        awayscore: g.awayscore,
        home_team: g.home_team,
        away_team: g.away_team,
        unscheduled: unscheduledSet.has(g.bracket_game_id),
      };
    }
  }

  const handleGameClick = (bracketGameId: string) => {
    const game = bracketGames.find((g) => g.bracket_game_id === bracketGameId);
    if (game) setScheduleGame(game);
  };

  // ---- Bracket projection (display only) ----
  //
  // Seeds come from the *projected* pool finish when one is available, so the
  // bracket reflects where teams would land, not where they sit mid-pool. These
  // seeds are computed inline and never written to `assignments` — that state is
  // auto-persisted, and a projection must not be able to reseed the tournament.
  const bracketPrediction: BracketPredictionResult | null = (() => {
    if (!prediction || !structure) return null;

    let seeds: Record<number, number> = assignments;
    if (hasPoolPlay && predictedSeedOrder.length > 0) {
      const projected: Record<number, number> = {};
      for (let seed = 1; seed <= structure.numTeams; seed++) {
        const teamId = predictedSeedOrder[seedOffset + seed - 1];
        if (teamId != null) projected[seed] = teamId;
      }
      if (Object.keys(projected).length > 0) seeds = projected;
    }
    if (Object.keys(seeds).length === 0) return null;

    const teamNames: Record<number, string> = {};
    for (const tm of teams) teamNames[tm.id] = tm.name;

    // Bracket games already played are kept — the walk resumes from there.
    const actualResults: Record<string, ActualGameResult> = {};
    for (const g of bracketGames) {
      if (
        g.bracket_game_id &&
        g.homescore != null && g.awayscore != null &&
        g.home != null && g.away != null
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

    return predictBracketPythagorean(
      structure,
      seeds,
      teamNames,
      actualResults,
      statsMapFrom(prediction.stats),
      prediction.leagueAvgRaPerG,
      prediction.warning
    );
  })();

  // Show projected seed labels alongside the projected bracket.
  const predictedSeedLabels = (() => {
    if (!bracketPrediction || !structure || !hasPoolPlay || predictedSeedOrder.length === 0) return null;
    const projected: Record<number, number> = {};
    for (let seed = 1; seed <= structure.numTeams; seed++) {
      const teamId = predictedSeedOrder[seedOffset + seed - 1];
      if (teamId != null) projected[seed] = teamId;
    }
    return Object.keys(projected).length > 0 ? seedLabelsFromAssignments(projected, teams) : null;
  })();

  return (
    <div className="space-y-5">
      {scheduleGame && (
        <BracketGameScheduleModal
          open={!!scheduleGame}
          onOpenChange={(open) => { if (!open) setScheduleGame(null); }}
          game={scheduleGame}
          tournamentId={tournamentId}
          onSaved={() => {
            setScheduleGame(null);
            fetchBracketGames();
          }}
        />
      )}
      <div className="flex items-center justify-between">
        <div>
          {renaming ? (
            <div className="flex items-center gap-1.5">
              <input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRename();
                  else if (e.key === "Escape") { setNameDraft(bracket.name); setRenaming(false); }
                }}
                onBlur={handleRename}
                className="border border-border bg-input px-2 py-1 text-lg font-semibold text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
              <button
                type="button"
                onClick={handleRename}
                className="h-7 w-7 flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
                title="Save name"
              >
                <Check className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">{bracket.name}</h2>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => { setNameDraft(bracket.name); setRenaming(true); }}
                  className="h-6 w-6 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                  title="Rename bracket"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
          <p className="text-sm text-muted-foreground mt-0.5">
            Select a bracket template and assign teams to seeds.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeInProgress}
              onChange={(e) => onIncludeInProgressChange(e.target.checked)}
              className="w-3.5 h-3.5 accent-primary cursor-pointer"
            />
            <span className="text-xs text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
              Include In Progress
            </span>
          </label>
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
      </div>

      {error && (
        <div className="flex items-start gap-2 text-sm text-destructive border border-destructive/40 bg-destructive/10 p-3">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Bracket template */}
      <div className="rounded-xl border border-border/60 bg-card/50 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Bracket template</h3>
            {templateName && !pickerOpen ? (
              <p className="text-xs text-muted-foreground mt-0.5">
                Using <span className="text-foreground font-medium">{templateName}</span>
                {structure?.numTeams ? ` · ${structure.numTeams} seeds` : ""}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground mt-0.5">Choose a bracket structure from the library.</p>
            )}
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={() => setPickerOpen((v) => !v)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {pickerOpen ? "Hide browser" : templateName ? "Change bracket" : "Select template"}
              {pickerOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>

        {canEdit && pickerOpen && (
          <div className="mt-4 space-y-4">
            <LibraryPicker onSelect={handleSelectTemplate} selectedId={templateId} />
          </div>
        )}

        <div className="mt-4">
          {structure ? (
            <div>
              <p className="label-section mb-3">Preview</p>
              <BracketPreview
                structure={structure}
                seedLabels={predictedSeedLabels ?? seedLabels}
                seedOffset={seedOffset}
                editable={false}
                onGameClick={bracketGames.length > 0 ? handleGameClick : undefined}
                gameDetails={bracketGames.length > 0 ? gameDetailsMap : undefined}
                predictionOverlay={bracketPrediction?.games}
              />
              {bracketPrediction && bracketPrediction.championId != null && (
                <div className="mt-3 flex items-center gap-3 px-4 py-3 border border-amber-500/40 bg-amber-500/10 rounded">
                  <Sparkles className="h-5 w-5 text-amber-500 shrink-0" />
                  <div>
                    <p
                      className="text-sm font-bold"
                      style={{ fontFamily: "var(--font-display)", textTransform: "uppercase" }}
                    >
                      Predicted Champion: {bracketPrediction.championName}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Pythagorean expectation
                      {predictedSeedLabels ? " · seeded from the projected pool finish" : ""}
                    </p>
                  </div>
                </div>
              )}
              {!bracketPrediction && atLeastOneFinal && !allFinal && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  At least one pool game has not been finalized — bracket seeding is tentative.
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-40 rounded-xl border border-dashed border-border/60 bg-muted/10 text-center">
              <GitBranch className="h-6 w-6 text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">Select a template to preview</p>
              <p className="text-xs text-muted-foreground/80 mt-1">
                To create a new bracket, use the{" "}
                <Link href="/bracket-builder" className="text-primary hover:underline">
                  Bracket Builder
                </Link>
                .
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Manual / random seeding (direct-to-bracket tournaments) */}
      {!hasPoolPlay && structure && (
        <div className="rounded-xl border border-border/60 bg-card/50 p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Seeding</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {bracketStarted
                  ? "Seeding is locked because bracket games have scores."
                  : "Assign teams to seeds manually, or randomize."}
              </p>
            </div>
            {canEdit && !bracketStarted && (
              <Button type="button" variant="outline" size="sm" onClick={handleRandomizeSeeds}>
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Randomize seeds
              </Button>
            )}
          </div>
          {canEdit && !bracketStarted ? (
            <SeedAssignment
              structure={structure}
              assignments={assignments}
              onChange={setAssignments}
              teams={teams}
            />
          ) : (
            <p className="text-xs text-muted-foreground">
              {Object.keys(assignments).length} of {structure.numTeams} seeds assigned.
            </p>
          )}
        </div>
      )}

      {/* Save */}
      {canEdit && (
        <div className="flex items-center gap-4">
          <Button
            onClick={handleSave}
            disabled={
              !templateId ||
              !structure ||
              saving ||
              (structure ? !validateFirstRoundSeeds(structure).valid : false)
            }
            className="shadow-sm"
          >
            {saving ? "Saving…" : "Save bracket"}
          </Button>
          {error && <span className="text-sm text-destructive">{error}</span>}
        </div>
      )}
    </div>
  );
}

/**
 * Flatten a standings table into the order brackets draw seeds from.
 *
 * With pool groups and an advancement cutoff, seeds interleave by finishing
 * slot — every group's winner first (ordered among themselves by overall rank),
 * then every runner-up, and so on — so a bracket doesn't stack one group's
 * teams into the same half. Without groups it's just the ranked order.
 */
function buildStandingsOrder(rows: StandingsRow[], advancesPerGroup: number | null): number[] {
  const hasGroups = rows.some((r) => r.pool_group != null);
  if (!hasGroups || !advancesPerGroup) {
    return rows.map((r) => r.teamid);
  }
  const groups = Array.from(
    new Set(rows.map((r) => r.pool_group).filter(Boolean) as string[])
  ).sort();
  const byGroup: Record<string, StandingsRow[]> = {};
  for (const g of groups) {
    byGroup[g] = rows.filter((r) => r.pool_group === g);
  }
  const order: number[] = [];
  for (let slot = 0; slot < advancesPerGroup; slot++) {
    const slotTeams: StandingsRow[] = [];
    for (const g of groups) {
      const team = byGroup[g]?.[slot];
      if (team) slotTeams.push(team);
    }
    slotTeams.sort((a, b) => a.rank_final - b.rank_final);
    for (const team of slotTeams) {
      order.push(team.teamid);
    }
  }
  return order;
}

// ---------- Main body ----------
function BracketBody() {
  const { tid, t, canEdit, unscheduledBracketGames } = useTournament();
  const hasPoolPlay = t?.has_pool_play !== false;
  const unscheduledByBracket = new Set(unscheduledBracketGames.map((g) => g.bracketId));
  const [brackets, setBrackets] = useState<TournamentBracket[]>([]);
  const [activeBracketId, setActiveBracketId] = useState<number | null>(null);
  const [teams, setTeams] = useState<TeamOpt[]>([]);
  const [standingsRows, setStandingsRows] = useState<StandingsRow[]>([]);
  const [games, setGames] = useState<{ gamestatusid: number | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [includeInProgress, setIncludeInProgress] = useState(false);

  const { sources, toggleSource } = useGameSources();
  const [prediction, setPrediction] = useState<TournamentPrediction | null>(null);
  const [predicting, setPredicting] = useState(false);
  const [predictError, setPredictError] = useState<string | null>(null);

  // A projection is only valid for the inputs it was run with.
  const sourceKey = sources.join(",");
  useEffect(() => {
    setPrediction(null);
    setPredictError(null);
  }, [sourceKey, includeInProgress]);

  const handlePredict = useCallback(async () => {
    if (!tid) return;
    setPredicting(true);
    setPredictError(null);
    try {
      setPrediction(await fetchTournamentPrediction(tid, sources, includeInProgress));
    } catch (e: unknown) {
      setPredictError(e instanceof Error ? e.message : "Prediction failed");
    } finally {
      setPredicting(false);
    }
  }, [tid, sources, includeInProgress]);

  const loadBrackets = useCallback(async () => {
    if (!tid) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/tournaments/${tid}/brackets`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const list: TournamentBracket[] = Array.isArray(data?.brackets) ? data.brackets : [];
      setBrackets(list);
      if (list.length > 0) {
        setActiveBracketId((prev) => (prev != null && list.some((b) => b.id === prev) ? prev : list[0].id));
      }
    } catch { /* no-op */ } finally {
      setLoading(false);
    }
  }, [tid]);

  const loadTeams = useCallback(async () => {
    if (!tid) return;
    try {
      const res = await fetch(`/api/tournaments/${tid}/teams`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setTeams(Array.isArray(data) ? data : data?.rows ?? data?.teams ?? []);
    } catch { setTeams([]); }
  }, [tid]);

  const loadStandings = useCallback(async () => {
    if (!tid) return;
    try {
      const res = await fetch(`/api/tournaments/${tid}/standings?includeInProgress=${includeInProgress}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setStandingsRows(Array.isArray(data?.standings) ? data.standings : []);
    } catch { setStandingsRows([]); }
  }, [tid, includeInProgress]);

  const loadGames = useCallback(async () => {
    if (!tid) return;
    try {
      const res = await fetch(`/api/tournaments/${tid}/poolgames`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setGames(Array.isArray(data?.games) ? data.games : []);
    } catch { setGames([]); }
  }, [tid]);

  useEffect(() => { loadBrackets(); }, [loadBrackets]);
  useEffect(() => { loadTeams(); }, [loadTeams]);
  useEffect(() => { loadStandings(); }, [loadStandings]);
  useEffect(() => { loadGames(); }, [loadGames]);

  // Build standingsOrder — group-aware when groups + advances_per_group are set
  const advancesPerGroup = t?.advances_per_group ?? null;
  const standingsOrder = buildStandingsOrder(standingsRows, advancesPerGroup);
  const predictedSeedOrder = prediction
    ? buildStandingsOrder(prediction.standings as unknown as StandingsRow[], advancesPerGroup)
    : [];

  const handleBracketCreated = (b: TournamentBracket) => {
    setBrackets((prev) => [...prev, b].sort((a, x) => a.sort_order - x.sort_order));
    setActiveBracketId(b.id);
    setShowCreate(false);
  };

  const handleBracketDeleted = (id: number) => {
    setBrackets((prev) => {
      const next = prev.filter((b) => b.id !== id);
      if (activeBracketId === id) {
        setActiveBracketId(next.length > 0 ? next[0].id : null);
      }
      return next;
    });
  };

  const handleBracketUpdated = (update: Partial<TournamentBracket> & { id: number }) => {
    setBrackets((prev) => prev.map((b) => (b.id === update.id ? { ...b, ...update } : b)));
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-32 rounded-xl bg-muted/30 animate-pulse border border-border/40" />
        ))}
      </div>
    );
  }

  const activeBracket = brackets.find((b) => b.id === activeBracketId) ?? null;

  // Cumulative seed offset for each bracket, in sort_order. Each bracket consumes
  // structure.numTeams seeds from the shared standings ordering.
  const seedOffsets = (() => {
    const sorted = [...brackets].sort((a, b) => a.sort_order - b.sort_order);
    const map = new Map<number, number>();
    let cumulative = 0;
    for (const b of sorted) {
      map.set(b.id, cumulative);
      cumulative += b.structure?.numTeams ?? 0;
    }
    return map;
  })();

  return (
    <div className="space-y-0">
      {/* Prediction controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <GameSourceToggles value={sources} onToggle={toggleSource} label="Predict from" />
        <PredictTournamentButton
          active={!!prediction}
          loading={predicting}
          disabled={brackets.length === 0}
          disabledReason="Add a bracket first"
          onPredict={handlePredict}
          onClear={() => setPrediction(null)}
        />
      </div>

      {predictError && (
        <div className="border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive mb-3">
          {predictError}
        </div>
      )}

      {prediction && (
        <PredictionBanner
          projectedGamesCount={prediction.projectedGamesCount}
          warning={prediction.warning}
        />
      )}

      {/* Tab bar */}
      <div className="flex items-end gap-0 border-b border-border/60 mb-6">
        {brackets.map((b) => {
          const hasUnscheduled = unscheduledByBracket.has(b.id);
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => { setActiveBracketId(b.id); setShowCreate(false); }}
              className={cn(
                "px-4 py-2 text-xs font-semibold uppercase tracking-wider border-b-2 transition-colors whitespace-nowrap inline-flex items-center gap-1.5",
                b.id === activeBracketId
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
              style={{ fontFamily: "var(--font-body)" }}
            >
              {b.name}
              {hasUnscheduled && (
                <AlertTriangle
                  className="h-3 w-3 text-amber-500 shrink-0"
                  aria-label="Has an unscheduled bracket game"
                />
              )}
            </button>
          );
        })}
        {canEdit && brackets.length < 20 && (
          <button
            type="button"
            onClick={() => { setShowCreate((s) => !s); setActiveBracketId(null); }}
            className={cn(
              "px-3 py-2 text-xs font-semibold uppercase tracking-wider border-b-2 transition-colors flex items-center gap-1",
              showCreate
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
            style={{ fontFamily: "var(--font-body)" }}
          >
            <Plus className="h-3 w-3" />
            Add
          </button>
        )}
      </div>

      {/* Create form */}
      {showCreate && tid && (
        <div className="mb-6">
          <CreateBracketForm
            tournamentId={tid}
            nextSortOrder={brackets.length}
            onCreated={handleBracketCreated}
            onCancel={() => setShowCreate(false)}
          />
        </div>
      )}

      {/* Empty state */}
      {brackets.length === 0 && !showCreate && (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border/60 rounded-xl">
          <GitBranch className="h-8 w-8 text-muted-foreground/30 mb-3" />
          <p
            className="text-sm font-medium text-foreground mb-1"
            style={{ fontFamily: "var(--font-display)", textTransform: "uppercase" }}
          >
            No Brackets Yet
          </p>
          <p className="text-xs text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
            Add brackets like &ldquo;Gold&rdquo; and &ldquo;Silver&rdquo; for your tournament.
          </p>
          {canEdit && (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className={cn(BTN_BASE, "mt-4 bg-primary text-primary-foreground border-primary hover:opacity-90")}
              style={{ fontFamily: "var(--font-body)" }}
            >
              <Plus className="h-3.5 w-3.5" />
              Add Bracket
            </button>
          )}
        </div>
      )}

      {/* Active bracket panel */}
      {activeBracket && (
        <BracketPanel
          key={activeBracket.id}
          bracket={activeBracket}
          tournamentId={tid!}
          teams={teams}
          standingsOrder={standingsOrder}
          seedOffset={seedOffsets.get(activeBracket.id) ?? 0}
          games={games}
          unscheduledGameIds={unscheduledBracketGames
            .filter((g) => g.bracketId === activeBracket.id)
            .map((g) => g.gameId)
            .filter((id): id is string => id != null)}
          includeInProgress={includeInProgress}
          onIncludeInProgressChange={setIncludeInProgress}
          onDeleted={handleBracketDeleted}
          onUpdated={handleBracketUpdated}
          canEdit={canEdit}
          hasPoolPlay={hasPoolPlay}
          prediction={prediction}
          predictedSeedOrder={predictedSeedOrder}
        />
      )}
    </div>
  );
}

export default function BracketPage() {
  return (
    <TournamentProvider>
      <TournamentShell tab="bracket">
        <BracketBody />
      </TournamentShell>
    </TournamentProvider>
  );
}
