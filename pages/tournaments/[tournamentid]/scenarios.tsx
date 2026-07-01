// pages/tournaments/[tournamentid]/scenarios.tsx
import { useCallback, useEffect, useRef, useState } from "react";
import TournamentProvider, { useTournament } from "@/components/tournaments/TournamentProvider";
import TournamentShell from "@/components/tournaments/TournamentShell";
import { Dices, Trash2, RotateCw, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import SegmentedControl from "@/components/ui/SegmentedControl";

type TeamRow = { id: number; name: string };

type ScenarioTimeMode = "current" | "as-of";

type MatchupEntry = {
  teamId: number;
  teamName: string;
  probability: number;
};

type ScenarioRow = {
  id: number;
  question_type: "seed_achievable" | "first_round_matchup" | "most_likely_seed" | "most_likely_matchup";
  team_id: number;
  team_name: string | null;
  opponent_team_id: number | null;
  opponent_team_name: string | null;
  target_seed: number | null;
  seed_mode: "exact" | "or_better" | null;
  is_possible: boolean | null;
  probability: number | null;
  simulations_run: number;
  sample_scenario: unknown[] | null;
  most_likely_seed: number | null;
  seed_distribution: { seed: number; probability: number }[] | null;
  matchup_distribution: MatchupEntry[] | null;
  most_likely_opponent_id: number | null;
  simulation_method: "monte_carlo" | "pythagorean";
  as_of_date: string | null;
  include_in_progress: boolean;
  status: "pending" | "running" | "completed" | "error";
  error_message: string | null;
  created_at: string;
};

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

/* ─── Matchup Distribution ─── */

function MatchupDistribution({
  distribution,
  probability,
  simulationsRun,
  countLabel,
}: {
  distribution: MatchupEntry[];
  probability: number | null;
  simulationsRun: number;
  countLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const maxProb = Math.max(...distribution.map((d) => d.probability), 0);
  const top = distribution[0];

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        {top && (
          <span className="text-lg font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--foreground)" }}>
            {top.teamName}
          </span>
        )}
        {probability !== null && (
          <span className="text-lg font-bold tabular-nums" style={{ fontFamily: "var(--font-display)", color: "var(--foreground)" }}>
            {Number(probability).toFixed(1)}%
          </span>
        )}
        <span className="text-[10px] text-muted-foreground ml-auto">
          {countLabel ?? `${simulationsRun.toLocaleString()} simulations`}
        </span>
      </div>

      <div className="border-t border-border/50 pt-2.5 mt-0.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors w-full text-left"
          style={{ fontFamily: "var(--font-body)" }}
        >
          {open ? <ChevronUp className="h-3 w-3 shrink-0" /> : <ChevronDown className="h-3 w-3 shrink-0" />}
          All possible opponents
        </button>

        {open && (
          <div className="mt-2 space-y-1">
            {distribution.map((d) => {
              const barPct = maxProb > 0 ? (d.probability / maxProb) * 100 : 0;
              const isBest = d.teamId === top?.teamId;
              return (
                <div key={d.teamId} className="flex items-center gap-2 text-xs">
                  <span
                    className="w-28 text-right shrink-0 truncate text-muted-foreground"
                    style={{ fontFamily: "var(--font-body)" }}
                    title={d.teamName}
                  >
                    {d.teamName}
                  </span>
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all", isBest ? "bg-primary" : "bg-muted-foreground/40")}
                      style={{ width: `${barPct}%` }}
                    />
                  </div>
                  <span
                    className={cn("w-10 tabular-nums shrink-0 text-right", isBest ? "text-foreground font-semibold" : "text-muted-foreground")}
                    style={{ fontFamily: "var(--font-body)" }}
                  >
                    {d.probability.toFixed(1)}%
                  </span>
                  {isBest && (
                    <span className="text-[10px] text-muted-foreground/60 shrink-0">&larr; most likely</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Create Form ─── */

function CreateScenarioForm({
  tournamentId,
  teams,
  dateRange,
  onCreated,
}: {
  tournamentId: number;
  teams: TeamRow[];
  dateRange: { minDate: string | null; maxDate: string | null };
  onCreated: (s: ScenarioRow) => void;
}) {
  const [questionType, setQuestionType] = useState<"seed_achievable" | "first_round_matchup" | "most_likely_seed" | "most_likely_matchup">("seed_achievable");
  const [teamId, setTeamId] = useState<number | "">(teams[0]?.id ?? "");
  const [opponentTeamId, setOpponentTeamId] = useState<number | "">(teams[1]?.id ?? teams[0]?.id ?? "");
  const [targetSeed, setTargetSeed] = useState(1);
  const [seedMode, setSeedMode] = useState<"or_better" | "exact">("or_better");
  const [timeMode, setTimeMode] = useState<ScenarioTimeMode>("current");
  const [asOfDate, setAsOfDate] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [simMethod, setSimMethod] = useState<"monte_carlo" | "pythagorean">("monte_carlo");
  const [includeInProgress, setIncludeInProgress] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const today = new Date().toLocaleDateString("en-CA");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamId) return;
    if (questionType === "first_round_matchup" && !opponentTeamId) return;
    setSubmitting(true);
    setErr(null);
    try {
      const base = questionType === "first_round_matchup"
        ? { questionType, teamId, opponentTeamId, simulationMethod: simMethod }
        : questionType === "most_likely_seed" || questionType === "most_likely_matchup"
        ? { questionType, teamId, simulationMethod: simMethod }
        : { questionType, teamId, targetSeed, seedMode, simulationMethod: simMethod };
      // As-of is date-based; include-in-progress only applies to the current view.
      const body = timeMode === "as-of"
        ? { ...base, asOfDate }
        : { ...base, includeInProgress };

      const res = await fetch(`/api/tournaments/${tournamentId}/scenarios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      const scenario = data.scenario as ScenarioRow;

      // Auto-trigger run
      await fetch(`/api/tournaments/${tournamentId}/scenarios/${scenario.id}/run`, { method: "POST" });
      onCreated({ ...scenario, status: "running" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to create scenario");
    } finally {
      setSubmitting(false);
    }
  };

  const opponentOptions = teams.filter((t) => t.id !== Number(teamId));

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-muted/20 p-5 space-y-4">
      <h3
        className="text-sm font-bold uppercase tracking-wide"
        style={{ fontFamily: "var(--font-display)" }}
      >
        New Scenario
      </h3>

      {/* Scenario type tabs */}
      <div className="flex flex-wrap gap-1 p-1 rounded-lg bg-muted/40 border border-border w-fit">
        {(["seed_achievable", "first_round_matchup", "most_likely_seed", "most_likely_matchup"] as const).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setQuestionType(type)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
              questionType === type
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
            style={{ fontFamily: "var(--font-body)" }}
          >
            {type === "seed_achievable" ? "Seed achievable?"
              : type === "first_round_matchup" ? "First-round matchup?"
              : type === "most_likely_seed" ? "Most likely seed?"
              : "Most likely matchup?"}
          </button>
        ))}
      </div>

      <p className="text-xs text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
        {questionType === "seed_achievable"
          ? "Can a team achieve a specific seed for bracket play?"
          : questionType === "first_round_matchup"
          ? "Can two teams be matched up in the first round of bracket play?"
          : questionType === "most_likely_seed"
          ? "Where will this team most likely finish in pool play standings?"
          : "Who will this team most likely face in the first round of bracket play?"}
      </p>

      <div className="flex flex-wrap gap-4">
        {/* Team */}
        <label className="flex-1 min-w-[180px]">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1">
            Team
          </span>
          <select
            value={teamId}
            onChange={(e) => {
              const next = Number(e.target.value);
              setTeamId(next);
              // Keep opponent valid: if it now collides with the selected team,
              // fall back to the first available opponent (avoids a stale select value).
              if (Number(opponentTeamId) === next) {
                setOpponentTeamId(teams.find((t) => t.id !== next)?.id ?? "");
              }
            }}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
          >
            {teams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </label>

        {questionType === "seed_achievable" && (
          <>
            {/* Target Seed */}
            <label className="w-24">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1">
                Seed
              </span>
              <select
                value={targetSeed}
                onChange={(e) => setTargetSeed(Number(e.target.value))}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
              >
                {teams.map((_, i) => (
                  <option key={i + 1} value={i + 1}>{i + 1}</option>
                ))}
              </select>
            </label>

            {/* Seed Mode */}
            <label className="w-36">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1">
                Mode
              </span>
              <select
                value={seedMode}
                onChange={(e) => setSeedMode(e.target.value as "exact" | "or_better")}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
              >
                <option value="or_better">Seed {targetSeed} or better</option>
                <option value="exact">Exactly seed {targetSeed}</option>
              </select>
            </label>
          </>
        )}

        {questionType === "first_round_matchup" && (
          /* Opponent Team */
          <label className="flex-1 min-w-[180px]">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1">
              Opponent
            </span>
            <select
              value={opponentTeamId}
              onChange={(e) => setOpponentTeamId(Number(e.target.value))}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
            >
              {opponentOptions.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      {/* Time mode + include in-progress */}
      <div className="flex items-center gap-3 flex-wrap">
        <SegmentedControl<ScenarioTimeMode>
          options={[
            { key: "current", label: "Current" },
            { key: "as-of", label: "As-of" },
          ]}
          active={timeMode}
          onChange={setTimeMode}
          size="sm"
        />
        {timeMode === "as-of" ? (
          <input
            type="date"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
            min={dateRange.minDate ?? undefined}
            max={dateRange.maxDate && dateRange.maxDate < today ? dateRange.maxDate : today}
            className="border border-border bg-background px-2 py-1 text-xs text-foreground rounded-md focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors"
            style={{ fontFamily: "var(--font-body)" }}
          />
        ) : (
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
        )}
      </div>

      {/* Method toggle */}
      <div className="space-y-2">
        <SegmentedControl<"monte_carlo" | "pythagorean">
          options={[
            { key: "monte_carlo", label: "Simulate" },
            { key: "pythagorean", label: "Predict" },
          ]}
          active={simMethod}
          onChange={setSimMethod}
          size="sm"
        />
        {simMethod === "pythagorean" && (
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2 space-y-0.5">
            <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-foreground" style={{ fontFamily: "var(--font-display)" }}>
              Pythagorean Prediction
            </p>
            <p className="text-xs text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
              Projects outcomes from each team&apos;s runs scored and allowed using Pythagorean Expectation and Log5.
              Deterministic — no simulation required. All teams must have played at least one game.
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting || !teamId || (questionType === "first_round_matchup" && !opponentTeamId)}
          className={cn(
            "px-4 py-2 text-sm font-medium rounded-md transition-colors",
            "bg-primary text-primary-foreground hover:bg-primary/90",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          {submitting ? "Analyzing…" : "Analyze Scenario"}
        </button>
      </div>

      {err && (
        <p className="text-xs text-destructive" style={{ fontFamily: "var(--font-body)" }}>{err}</p>
      )}
    </form>
  );
}

/* ─── Result Card ─── */

function ScenarioCard({
  scenario,
  tournamentId,
  onUpdate,
  onDelete,
}: {
  scenario: ScenarioRow;
  tournamentId: number;
  onUpdate: (s: ScenarioRow) => void;
  onDelete: (id: number) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [rerunning, setRerunning] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll while running
  useEffect(() => {
    if (scenario.status !== "running") {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/tournaments/${tournamentId}/scenarios/${scenario.id}`);
        if (res.ok) {
          const data = await res.json();
          onUpdate(data.scenario);
        }
      } catch {}
    }, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [scenario.status, scenario.id, tournamentId, onUpdate]);

  const handleRerun = async () => {
    setRerunning(true);
    try {
      await fetch(`/api/tournaments/${tournamentId}/scenarios/${scenario.id}/run`, { method: "POST" });
      onUpdate({ ...scenario, status: "running", simulations_run: 0 });
    } catch {} finally {
      setRerunning(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/scenarios/${scenario.id}`, { method: "DELETE" });
      if (res.ok) onDelete(scenario.id);
    } catch {} finally {
      setDeleting(false);
    }
  };

  const isMatchup = scenario.question_type === "first_round_matchup";
  const isMostLikelySeed = scenario.question_type === "most_likely_seed";
  const isMostLikelyMatchup = scenario.question_type === "most_likely_matchup";

  const questionLabel = isMatchup
    ? `Can they meet in round 1?`
    : isMostLikelySeed
    ? `What seed will they most likely finish?`
    : isMostLikelyMatchup
    ? `Who will they most likely face in round 1?`
    : scenario.seed_mode === "exact"
      ? `Can they achieve exactly seed #${scenario.target_seed}?`
      : `Can they achieve seed #${scenario.target_seed} or better?`;

  const isPrediction = scenario.simulation_method === "pythagorean";
  const countLabel = isPrediction
    ? "Pythagorean projection"
    : `${scenario.simulations_run.toLocaleString()} simulations`;

  return (
    <div className="border border-border rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground" style={{ fontFamily: "var(--font-body)" }}>
            {isMatchup ? (
              <>
                {scenario.team_name ?? `Team ${scenario.team_id}`}
                <span className="text-muted-foreground font-normal"> vs </span>
                {scenario.opponent_team_name ?? `Team ${scenario.opponent_team_id}`}
              </>
            ) : (
              scenario.team_name ?? `Team ${scenario.team_id}`
            )}
          </p>
          <p className="text-xs text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
            {questionLabel}
            {scenario.as_of_date && (
              <span className="ml-2 inline-block px-1.5 py-px text-[9px] font-bold tracking-[0.05em] uppercase border border-border text-muted-foreground" style={{ fontFamily: "var(--font-display)" }}>
                As of {new Date(scenario.as_of_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}
              </span>
            )}
            {scenario.include_in_progress && !scenario.as_of_date && (
              <span className="ml-2 inline-block px-1.5 py-px text-[9px] font-bold tracking-[0.05em] uppercase border border-border text-muted-foreground" style={{ fontFamily: "var(--font-display)" }}>
                Incl. in-progress
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-1.5 shrink-0">
          <button
            onClick={handleRerun}
            disabled={rerunning || scenario.status === "running"}
            className="p-1.5 rounded hover:bg-elevated text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            title="Re-run analysis"
          >
            <RotateCw className={cn("h-3.5 w-3.5", scenario.status === "running" && "animate-spin")} />
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="p-1.5 rounded hover:bg-elevated text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Status / Results */}
      {scenario.status === "running" && (
        <div className="space-y-1.5">
          {!isPrediction && (
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${Math.min(100, (scenario.simulations_run / 100) * 1)}%` }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {scenario.simulations_run.toLocaleString()} sims
              </span>
            </div>
          )}
          <p className="text-xs text-muted-foreground animate-pulse">Analyzing…</p>
        </div>
      )}

      {scenario.status === "completed" && (
        <div className="space-y-0">
          {isMostLikelyMatchup ? (
            scenario.matchup_distribution && scenario.matchup_distribution.length > 0 ? (
              <MatchupDistribution
                distribution={scenario.matchup_distribution}
                probability={isPrediction ? null : scenario.probability}
                simulationsRun={scenario.simulations_run}
                countLabel={isPrediction ? countLabel : undefined}
              />
            ) : (
              <p className="text-xs text-muted-foreground">No matchup data.</p>
            )
          ) : isMostLikelySeed ? (
            <div className="flex items-center gap-3">
              {scenario.most_likely_seed !== null && (
                <span className="text-lg font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--foreground)" }}>
                  {ordinal(scenario.most_likely_seed)} seed
                </span>
              )}
              {!isPrediction && scenario.probability !== null && (
                <span className="text-lg font-bold tabular-nums" style={{ fontFamily: "var(--font-display)", color: "var(--foreground)" }}>
                  {Number(scenario.probability).toFixed(1)}%
                </span>
              )}
              <span className="text-[10px] text-muted-foreground ml-auto">
                {countLabel}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              {scenario.is_possible === false ? (
                <span
                  className="inline-block px-2 py-0.5 text-[10px] font-bold tracking-[0.1em] uppercase border rounded"
                  style={{
                    fontFamily: "var(--font-display)",
                    borderColor: "var(--destructive)",
                    color: "var(--destructive)",
                  }}
                >
                  Impossible
                </span>
              ) : (
                <>
                  <span
                    className="inline-block px-2 py-0.5 text-[10px] font-bold tracking-[0.1em] uppercase border rounded"
                    style={{
                      fontFamily: "var(--font-display)",
                      borderColor: "var(--success)",
                      color: "var(--success)",
                    }}
                  >
                    Possible
                  </span>
                  {!isPrediction && scenario.probability !== null && (
                    <span
                      className="text-lg font-bold tabular-nums"
                      style={{ fontFamily: "var(--font-display)", color: "var(--foreground)" }}
                    >
                      {Number(scenario.probability) === 0 ? "<1.0%" : `${Number(scenario.probability).toFixed(1)}%`}
                    </span>
                  )}
                </>
              )}
              <span className="text-[10px] text-muted-foreground ml-auto">
                {countLabel}
              </span>
            </div>
          )}
        </div>
      )}

      {scenario.status === "error" && (
        <p className="text-xs text-destructive">{scenario.error_message ?? "Analysis failed"}</p>
      )}

      {scenario.status === "pending" && (
        <p className="text-xs text-muted-foreground">Pending…</p>
      )}
    </div>
  );
}

/* ─── Main Body ─── */

function ScenariosBody() {
  const { tid } = useTournament();
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [scenarios, setScenarios] = useState<ScenarioRow[]>([]);
  const [dateRange, setDateRange] = useState<{ minDate: string | null; maxDate: string | null }>({ minDate: null, maxDate: null });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!tid) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const [teamsRes, scenariosRes, dateRangeRes] = await Promise.all([
          fetch(`/api/tournaments/${tid}/teams`),
          fetch(`/api/tournaments/${tid}/scenarios`),
          fetch(`/api/tournaments/${tid}/date-range`),
        ]);
        if (!teamsRes.ok || !scenariosRes.ok) throw new Error("Failed to load data");
        // Tournament teams API returns flat array (not { teams: [] })
        const teamsData = await teamsRes.json();
        const scenariosData = await scenariosRes.json();
        const dateRangeData = dateRangeRes.ok ? await dateRangeRes.json() : {};
        if (!cancelled) {
          setTeams(Array.isArray(teamsData) ? teamsData : []);
          setScenarios(Array.isArray(scenariosData.scenarios) ? scenariosData.scenarios : []);
          setDateRange({ minDate: dateRangeData.minDate ?? null, maxDate: dateRangeData.maxDate ?? null });
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tid]);

  const handleCreated = useCallback((s: ScenarioRow) => {
    setScenarios((prev) => [s, ...prev]);
  }, []);

  const handleUpdate = useCallback((updated: ScenarioRow) => {
    setScenarios((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  }, []);

  const handleDelete = useCallback((id: number) => {
    setScenarios((prev) => prev.filter((s) => s.id !== id));
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 bg-elevated animate-pulse rounded-lg" />
        ))}
      </div>
    );
  }

  if (err) {
    return (
      <div className="border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        {err}
      </div>
    );
  }

  return (
    <div className="space-y-6">
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
          Scenarios
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5" style={{ fontFamily: "var(--font-body)" }}>
          Explore bracket play seed possibilities and first-round matchups.
        </p>
      </div>

      {teams.length > 1 && tid && (
        <CreateScenarioForm
          tournamentId={tid}
          teams={teams}
          dateRange={dateRange}
          onCreated={handleCreated}
        />
      )}

      {scenarios.length > 0 ? (
        <div className="space-y-3">
          {scenarios.map((s) => tid && (
            <ScenarioCard
              key={s.id}
              scenario={s}
              tournamentId={tid}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border/60">
          <Dices className="h-8 w-8 text-muted-foreground/30 mb-3" />
          <p
            className="text-sm font-medium text-foreground mb-1"
            style={{ fontFamily: "var(--font-display)", textTransform: "uppercase" }}
          >
            No Scenarios Yet
          </p>
          <p className="text-xs text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
            Create a scenario above to analyze bracket play possibilities.
          </p>
        </div>
      )}
    </div>
  );
}

export default function TournamentScenariosPage() {
  return (
    <TournamentProvider>
      <TournamentShell tab="scenarios">
        <ScenariosBody />
      </TournamentShell>
    </TournamentProvider>
  );
}
