import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import TournamentProvider, { useTournament } from "@/components/tournaments/TournamentProvider";
import TournamentShell from "@/components/tournaments/TournamentShell";
import BracketPreview from "@/components/bracket/BracketPreview";
import LibraryPicker from "@/components/bracket/LibraryPicker";
import { seedLabelsFromAssignments } from "@/components/bracket/SeedAssignment";
import { Button } from "@/components/ui/button";
import type { BracketStructure } from "@/components/bracket/types";
import { validateFirstRoundSeeds } from "@/components/bracket/types";
import type { StandingsRow } from "@/pages/api/tournaments/[tournamentid]/standings";
import { GitBranch, AlertTriangle, ChevronDown, ChevronRight, RefreshCw } from "lucide-react";

type TeamOpt = { id: number; name: string };


function BracketBody() {
  const { tid, t } = useTournament();
  const [structure, setStructure] = useState<BracketStructure | null>(null);
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [templateName, setTemplateName] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Record<number, number>>({});
  const [teams, setTeams] = useState<TeamOpt[]>([]);
  const [standingsRows, setStandingsRows] = useState<StandingsRow[]>([]);
  const [games, setGames] = useState<{ gamestatusid: number | null }[]>([]);
  const [bracketLoading, setBracketLoading] = useState(true);
  const [bracketError, setBracketError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [bracketSaved, setBracketSaved] = useState(false);
  const [pickerExpanded, setPickerExpanded] = useState(false);
  const [includeInProgress, setIncludeInProgress] = useState(false);

  const loadBracket = useCallback(async () => {
    if (!tid) return;
    setBracketLoading(true);
    setBracketError(null);
    try {
      const res = await fetch(`/api/tournaments/${tid}/bracket`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load bracket");
      const data = await res.json();
      setStructure(data.structure ?? null);
      setTemplateId(data.templateId ?? null);
      setTemplateName(data.templateName ?? null);
      const hasSavedBracket = data.structure != null && data.templateId != null;
      setBracketSaved(hasSavedBracket);
      setPickerExpanded(!hasSavedBracket);
      const assign: Record<number, number> = {};
      for (const a of data.assignments ?? []) {
        assign[a.seedIndex] = a.teamId;
      }
      setAssignments(assign);
    } catch (e) {
      setBracketError(e instanceof Error ? e.message : "Failed to load bracket");
      setStructure(null);
      setTemplateId(null);
      setTemplateName(null);
      setBracketSaved(false);
      setPickerExpanded(true);
      setAssignments({});
    } finally {
      setBracketLoading(false);
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

  useEffect(() => { loadBracket(); }, [loadBracket]);
  useEffect(() => { loadTeams(); }, [loadTeams]);
  useEffect(() => { loadStandings(); }, [loadStandings]);
  useEffect(() => { loadGames(); }, [loadGames]);

  const handleSelectFromLibrary = useCallback(
    (template: { id: number; name: string; structure: BracketStructure }) => {
      setTemplateId(template.id);
      setTemplateName(template.name);
      setStructure(template.structure);
      setAssignments({});
    },
    []
  );

  const handleSaveBracket = useCallback(async () => {
    if (!tid) return;
    if (!templateId) {
      setSaveError("Please select a bracket template from the library.");
      return;
    }
    if (!structure) {
      setSaveError("No bracket structure loaded.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const assignmentsArray = Object.entries(assignments)
        .filter(([, teamId]) => Number.isFinite(teamId))
        .map(([seedStr, teamId]) => ({ seedIndex: parseInt(seedStr, 10), teamId }));
      const res = await fetch(`/api/tournaments/${tid}/bracket`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId, structure, assignments: assignmentsArray }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      loadBracket();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [tid, structure, templateId, assignments, loadBracket]);

  // Build standingsOrder — group-aware when groups + advances_per_group are set
  const advancesPerGroup = t?.advances_per_group ?? null;
  const hasGroups = standingsRows.some((r) => r.pool_group != null);

  const standingsOrder: number[] = (() => {
    if (!hasGroups || !advancesPerGroup) {
      // Flat order by rank_final (existing behavior)
      return standingsRows.map((r) => r.teamid);
    }
    // Group-aware interleaved order:
    // Group A #1 → seed 1, Group B #1 → seed 2, Group A #2 → seed 3, …
    const groups = Array.from(
      new Set(standingsRows.map((r) => r.pool_group).filter(Boolean) as string[])
    ).sort();

    // Per-group sorted rows (within-group rank preserved from global rank_final)
    const byGroup: Record<string, StandingsRow[]> = {};
    for (const g of groups) {
      byGroup[g] = standingsRows.filter((r) => r.pool_group === g);
    }

    const order: number[] = [];
    for (let slot = 0; slot < advancesPerGroup; slot++) {
      // Collect all teams finishing at this rank across every group,
      // then sort them by global rank_final so cross-group tiebreakers
      // (W-L%, run differential, etc.) determine seed order rather than
      // group-letter alphabetical order.
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
  })();

  const atLeastOneFinal = games.some((g) => g.gamestatusid === 4);
  const allFinal = games.length > 0 && games.every((g) => g.gamestatusid === 4);

  const autoFillApplied = useRef(false);
  useEffect(() => {
    if (autoFillApplied.current) return;
    if (!atLeastOneFinal || standingsOrder.length === 0 || !structure) return;
    const next: Record<number, number> = {};
    for (let seed = 1; seed <= structure.numTeams && seed <= standingsOrder.length; seed++) {
      next[seed] = standingsOrder[seed - 1];
    }
    setAssignments(next);
    autoFillApplied.current = true;
  }, [atLeastOneFinal, standingsOrder, structure]);

  const seedLabels = seedLabelsFromAssignments(assignments, teams);

  if (bracketLoading && !structure && !bracketError) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-32 rounded-xl bg-muted/30 animate-pulse border border-border/40" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Tournament Bracket</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Select a bracket template and assign teams to seeds.
          </p>
        </div>
        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={includeInProgress}
            onChange={(e) => setIncludeInProgress(e.target.checked)}
            className="w-3.5 h-3.5 accent-primary cursor-pointer"
          />
          <span className="text-xs text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
            Include In Progress
          </span>
        </label>
      </div>

      {bracketError && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>Could not load existing bracket. You can still apply a new one below.</span>
        </div>
      )}

      {/* Bracket template */}
      <div className="rounded-xl border border-border/60 bg-card/50 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Bracket template</h3>
            {bracketSaved && !pickerExpanded && templateName ? (
              <p className="text-xs text-muted-foreground mt-0.5">
                Using <span className="text-foreground font-medium">{templateName}</span>
                {structure?.numTeams ? ` · ${structure.numTeams} seeds` : ""}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground mt-0.5">Choose a bracket structure from the library.</p>
            )}
          </div>
          {bracketSaved && (
            <button
              type="button"
              onClick={() => setPickerExpanded((v) => !v)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {pickerExpanded ? "Hide browser" : "Change bracket"}
              {pickerExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>

        {pickerExpanded && (
          <div className="mt-4 space-y-4">
            <LibraryPicker onSelect={handleSelectFromLibrary} selectedId={templateId} />
          </div>
        )}

        <div className="mt-4">
          {structure ? (
            <div>
              <p className="label-section mb-3">Preview</p>
              <BracketPreview
                structure={structure}
                seedLabels={seedLabels}
                editable={false}
              />
              {atLeastOneFinal && !allFinal && (
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


      {/* Save */}
      <div className="flex items-center gap-4">
        <Button
          onClick={handleSaveBracket}
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
        {saveError && <span className="text-sm text-destructive">{saveError}</span>}
      </div>
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
