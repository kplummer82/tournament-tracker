import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LineChart, TrendingUp } from "lucide-react";
import ProbabilityLineChart, { type ProbabilityPoint } from "@/components/charts/ProbabilityLineChart";
import StackedAreaChart, { type StackSeries } from "@/components/charts/StackedAreaChart";
import type { ResultTick } from "@/components/charts/ChartFrame";

type QuestionType = "seed_achievable" | "first_round_matchup" | "most_likely_seed" | "most_likely_matchup";

export type TimelineScenarioProps = {
  id: number;
  question_type: QuestionType;
  team_id: number;
  team_name: string | null;
  opponent_team_name: string | null;
  target_seed: number | null;
  seed_mode: "exact" | "or_better" | "or_worse" | null;
  simulation_method: "monte_carlo" | "pythagorean";
};

type TimelineRow = {
  id: number;
  status: "pending" | "running" | "completed" | "error";
  points_total: number;
  points_done: number;
  error_message: string | null;
};

type TimelinePoint = {
  point_index: number;
  as_of_date: string;
  is_possible: boolean | null;
  probability: number | string | null;
  most_likely_seed: number | null;
  most_likely_opponent_id: number | null;
  seed_distribution: { seed: number; probability: number }[] | null;
  matchup_distribution: { teamId: number; teamName: string; probability: number }[] | null;
  simulations_run: number;
  error_message: string | null;
};

type GameRow = {
  id: number;
  gamedate: string | null;
  home: number;
  away: number;
  home_team: string | null;
  away_team: string | null;
  homescore: number | null;
  awayscore: number | null;
  gamestatusid: number | null;
};

/** Settled statuses, matching lib/standings: 4 Final, 6 home forfeit, 7 away forfeit. */
const SETTLED = new Set([4, 6, 7]);

/** Categorical palette for opponent bands — these vars exist in globals.css. */
const MATCHUP_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];
const MAX_MATCHUP_BANDS = 5;

// A 20-team season spreads across 20 seeds, which stacks into an unreadable
// blob. Plot the contiguous band of seeds that actually carry weight and pool
// the tails — pooling by "better than" / "worse than" rather than into one
// bucket keeps the stack's top-to-bottom ordering meaningful.
const MAX_SEED_BANDS = 8;
const POOL_FILL = "var(--muted-foreground)";
const POOL_OPACITY = 0.35;

function isoDate(raw: string | null): string | null {
  return raw ? String(raw).slice(0, 10) : null;
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "numeric", day: "numeric", timeZone: "UTC" });
}

function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export default function ScenarioTimeline({
  seasonId,
  scenario,
}: {
  seasonId: number;
  scenario: TimelineScenarioProps;
}) {
  const [timeline, setTimeline] = useState<TimelineRow | null>(null);
  const [points, setPoints] = useState<TimelinePoint[]>([]);
  const [games, setGames] = useState<GameRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/seasons/${seasonId}/scenarios/${scenario.id}/timeline`);
    if (!res.ok) throw new Error("Failed to load timeline");
    const data = await res.json();
    setTimeline(data.timeline ?? null);
    setPoints(Array.isArray(data.points) ? data.points : []);
  }, [seasonId, scenario.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const [, gamesRes] = await Promise.all([
          load(),
          fetch(`/api/seasons/${seasonId}/games`),
        ]);
        if (!cancelled && gamesRes.ok) {
          const data = await gamesRes.json();
          setGames(Array.isArray(data.games) ? data.games : []);
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Failed to load timeline");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [seasonId, load]);

  // Poll while the timeline is filling in — points land one at a time, so the
  // chart draws progressively.
  useEffect(() => {
    if (timeline?.status !== "running") {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    pollRef.current = setInterval(() => { load().catch(() => {}); }, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [timeline?.status, load]);

  const handleRun = async () => {
    setStarting(true);
    setErr(null);
    try {
      const res = await fetch(`/api/seasons/${seasonId}/scenarios/${scenario.id}/timeline`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data?.error ?? "Failed to start timeline");
        return;
      }
      setTimeline(data.timeline ?? null);
      setPoints([]);
    } catch {
      setErr("Failed to start timeline");
    } finally {
      setStarting(false);
    }
  };

  const labels = useMemo(() => points.map((p) => shortDate(p.as_of_date)), [points]);

  /**
   * Attribute the team's own completed games to the point whose window they fall
   * in. Points are sampled, so a game between two plotted dates is what actually
   * moved the number at the later one.
   */
  const resultTicks = useMemo<ResultTick[]>(() => {
    if (points.length === 0) return [];
    const mine = games
      .filter((g) => (g.home === scenario.team_id || g.away === scenario.team_id))
      .filter((g) => SETTLED.has(g.gamestatusid ?? 0) && isoDate(g.gamedate));

    const ticks: ResultTick[] = [];
    for (const g of mine) {
      const d = isoDate(g.gamedate)!;
      const idx = points.findIndex((p) => d <= p.as_of_date);
      if (idx === -1) continue;
      const isHome = g.home === scenario.team_id;
      const opponent = (isHome ? g.away_team : g.home_team) ?? "Opponent";

      let outcome: ResultTick["outcome"];
      if (g.gamestatusid === 6) outcome = isHome ? "L" : "W";
      else if (g.gamestatusid === 7) outcome = isHome ? "W" : "L";
      else if (g.homescore == null || g.awayscore == null) continue;
      else {
        const mineScore = isHome ? g.homescore : g.awayscore;
        const theirs = isHome ? g.awayscore : g.homescore;
        outcome = mineScore > theirs ? "W" : mineScore < theirs ? "L" : "T";
      }

      const score =
        g.homescore != null && g.awayscore != null
          ? ` ${isHome ? g.homescore : g.awayscore}-${isHome ? g.awayscore : g.homescore}`
          : " (forfeit)";
      ticks.push({ pointIndex: idx, outcome, label: `${outcome} vs ${opponent}${score}` });
    }
    return ticks;
  }, [games, points, scenario.team_id]);

  const ticksByPoint = useMemo(() => {
    const m = new Map<number, ResultTick[]>();
    for (const t of resultTicks) {
      const list = m.get(t.pointIndex);
      if (list) list.push(t);
      else m.set(t.pointIndex, [t]);
    }
    return m;
  }, [resultTicks]);

  const isDistribution =
    scenario.question_type === "most_likely_seed" || scenario.question_type === "most_likely_matchup";

  const linePoints = useMemo<ProbabilityPoint[]>(
    () =>
      points.map((p) => ({
        label: shortDate(p.as_of_date),
        value: p.probability == null ? null : Number(p.probability),
        possible: p.is_possible !== false,
        errored: !!p.error_message,
      })),
    [points]
  );

  const stackSeries = useMemo<StackSeries[]>(() => {
    if (scenario.question_type === "most_likely_seed") {
      const peak = new Map<number, number>();
      for (const p of points) {
        for (const d of p.seed_distribution ?? []) {
          peak.set(d.seed, Math.max(peak.get(d.seed) ?? 0, d.probability));
        }
      }
      const seeds = Array.from(peak.keys()).sort((a, b) => a - b);
      if (seeds.length === 0) return [];

      // Slide a window over the seeds and keep the one carrying the most weight.
      const size = Math.min(MAX_SEED_BANDS, seeds.length);
      let bestStart = 0;
      let bestWeight = -1;
      for (let start = 0; start + size <= seeds.length; start++) {
        const weight = seeds.slice(start, start + size).reduce((sum, s) => sum + (peak.get(s) ?? 0), 0);
        if (weight > bestWeight) {
          bestWeight = weight;
          bestStart = start;
        }
      }
      const shown = seeds.slice(bestStart, bestStart + size);
      const better = seeds.slice(0, bestStart);
      const worse = seeds.slice(bestStart + size);

      const sumOf = (group: number[]) => (p: TimelinePoint) =>
        p.error_message
          ? null
          : (p.seed_distribution ?? [])
              .filter((d) => group.includes(d.seed))
              .reduce((sum, d) => sum + d.probability, 0);

      const pool = (group: number[], key: string): StackSeries[] =>
        group.length === 0
          ? []
          : [
              {
                key,
                label:
                  group.length === 1
                    ? `${ordinal(group[0])} seed`
                    : `${ordinal(group[0])}–${ordinal(group[group.length - 1])}`,
                fill: POOL_FILL,
                opacity: POOL_OPACITY,
                values: points.map(sumOf(group)),
              },
            ];

      return [
        ...pool(better, "seed-better"),
        // Ordinal data: one hue at a descending ramp reads as an ordering and
        // needs no colour interpolation to stay theme-safe.
        ...shown.map((seed, i) => ({
          key: `seed-${seed}`,
          label: `${ordinal(seed)} seed`,
          fill: "var(--primary)",
          opacity: shown.length <= 1 ? 1 : 1 - (i / (shown.length - 1)) * 0.75,
          values: points.map((p) =>
            p.error_message
              ? null
              : (p.seed_distribution ?? []).find((d) => d.seed === seed)?.probability ?? 0
          ),
        })),
        ...pool(worse, "seed-worse"),
      ];
    }

    // Opponents are categorical — keep the strongest few and pool the rest.
    const peak = new Map<number, { name: string; peak: number }>();
    for (const p of points) {
      for (const m of p.matchup_distribution ?? []) {
        const cur = peak.get(m.teamId);
        if (!cur || m.probability > cur.peak) peak.set(m.teamId, { name: m.teamName, peak: m.probability });
      }
    }
    const top = Array.from(peak.entries())
      .sort((a, b) => b[1].peak - a[1].peak)
      .slice(0, MAX_MATCHUP_BANDS);
    const topIds = new Set(top.map(([id]) => id));

    const series: StackSeries[] = top.map(([id, info], i) => ({
      key: `opp-${id}`,
      label: info.name,
      fill: MATCHUP_COLORS[i % MATCHUP_COLORS.length],
      values: points.map((p) =>
        p.error_message
          ? null
          : (p.matchup_distribution ?? []).find((m) => m.teamId === id)?.probability ?? 0
      ),
    }));

    const hasOther = points.some((p) =>
      (p.matchup_distribution ?? []).some((m) => !topIds.has(m.teamId))
    );
    if (hasOther) {
      series.push({
        key: "opp-other",
        label: "Other",
        fill: "var(--muted-foreground)",
        opacity: 0.45,
        values: points.map((p) =>
          p.error_message
            ? null
            : (p.matchup_distribution ?? [])
                .filter((m) => !topIds.has(m.teamId))
                .reduce((sum, m) => sum + m.probability, 0)
        ),
      });
    }
    return series;
  }, [points, scenario.question_type]);

  const failedDates = useMemo(
    () => points.filter((p) => p.error_message).map((p) => longDate(p.as_of_date)),
    [points]
  );

  const renderTooltip = (i: number) => {
    const p = points[i];
    if (!p) return null;
    const ticks = ticksByPoint.get(i) ?? [];
    return (
      <div className="space-y-1">
        <p className="font-semibold text-foreground">{longDate(p.as_of_date)}</p>
        {p.error_message ? (
          <p className="text-destructive">{p.error_message}</p>
        ) : isDistribution ? (
          <div className="space-y-0.5">
            {stackSeries
              .map((s) => ({ label: s.label, value: s.values[i] ?? 0 }))
              .filter((s) => s.value > 0.05)
              .sort((a, b) => b.value - a.value)
              .slice(0, 4)
              .map((s) => (
                <p key={s.label} className="text-muted-foreground">
                  {s.label} <span className="text-foreground tabular-nums">{s.value.toFixed(1)}%</span>
                </p>
              ))}
          </div>
        ) : p.is_possible === false ? (
          <p className="text-destructive">Eliminated — no longer reachable</p>
        ) : (
          <p className="text-muted-foreground">
            Chance{" "}
            <span className="text-foreground tabular-nums">
              {Number(p.probability ?? 0).toFixed(1)}%
            </span>
          </p>
        )}
        {ticks.length > 0 && (
          <div className="pt-0.5 border-t border-border space-y-0.5">
            {ticks.map((t, k) => (
              <p key={k} className="text-muted-foreground">{t.label}</p>
            ))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return <div className="h-40 bg-elevated animate-pulse rounded-lg" />;
  }

  const running = timeline?.status === "running";
  const hasChart = points.length >= 2;

  return (
    <div className="space-y-3">
      {err && (
        <div className="border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
          {err}
        </div>
      )}

      {timeline?.status === "error" && timeline.error_message && (
        <div className="border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
          {timeline.error_message}
        </div>
      )}

      {!timeline && !err && (
        <div className="flex flex-col items-center justify-center py-10 text-center border border-dashed border-border/60">
          <LineChart className="h-8 w-8 text-muted-foreground/30 mb-3" />
          <p
            className="text-sm font-medium text-foreground mb-1"
            style={{ fontFamily: "var(--font-display)", textTransform: "uppercase" }}
          >
            No Timeline Yet
          </p>
          <p className="text-xs text-muted-foreground mb-3 max-w-sm" style={{ fontFamily: "var(--font-body)" }}>
            Re-run this question as of each date a game was played, to see how the answer moved
            over the season.
          </p>
        </div>
      )}

      {running && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground animate-pulse" style={{ fontFamily: "var(--font-body)" }}>
            Replaying {timeline.points_done} of {timeline.points_total} dates…
          </p>
          <div className="h-1.5 bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{
                width: `${timeline.points_total > 0 ? (timeline.points_done / timeline.points_total) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
      )}

      {hasChart && (
        <>
          {isDistribution ? (
            <StackedAreaChart
              points={labels.map((label) => ({ label }))}
              series={stackSeries}
              results={resultTicks}
              tooltip={renderTooltip}
            />
          ) : (
            <ProbabilityLineChart points={linePoints} results={resultTicks} tooltip={renderTooltip} />
          )}

          {isDistribution && (
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {stackSeries.map((s) => (
                <span
                  key={s.key}
                  className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  <span
                    className="inline-block h-2 w-2 shrink-0"
                    style={{ background: s.fill, opacity: s.opacity ?? 1 }}
                  />
                  {s.label}
                </span>
              ))}
            </div>
          )}

          <p className="text-[10px] text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
            Ticks under the axis are {scenario.team_name ?? "the team"}&apos;s own results in each window —
            green a win, red a loss. Each point re-runs the question using only games completed on or
            before that date.
          </p>

          {failedDates.length > 0 && (
            <p className="text-[10px] text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
              No result for {failedDates.join(", ")}
              {scenario.simulation_method === "pythagorean"
                ? " — prediction needs every team to have played at least once."
                : "."}
            </p>
          )}
        </>
      )}

      {!running && (
        <button
          type="button"
          onClick={handleRun}
          disabled={starting}
          className="inline-flex items-center gap-1.5 border border-border px-3 py-1.5 text-[11px] font-bold tracking-[0.08em] uppercase text-muted-foreground hover:text-foreground hover:bg-elevated transition-colors disabled:opacity-50 cursor-pointer"
          style={{ fontFamily: "var(--font-display)" }}
        >
          <TrendingUp className="h-3.5 w-3.5" />
          {timeline ? "Re-plot" : "Plot over time"}
        </button>
      )}
    </div>
  );
}
