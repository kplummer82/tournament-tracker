// pages/tournaments/[tournamentid]/standings.tsx
import { useCallback, useEffect, useState } from "react";
import TournamentProvider, { useTournament } from "@/components/tournaments/TournamentProvider";
import TournamentShell from "@/components/tournaments/TournamentShell";
import type { TournamentStandingsRow as StandingsRow } from "@/pages/api/tournaments/[tournamentid]/standings";
import { Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import CoinTossResolver, { type CoinTossGroup } from "@/components/standings/CoinTossResolver";
import type { CoinTossPhase } from "@/lib/standings/types";
import GameSourceToggles from "@/components/tournaments/GameSourceToggles";
import PredictTournamentButton, { PredictionBanner } from "@/components/tournaments/PredictTournamentButton";
import { useGameSources } from "@/lib/hooks/useGameSources";
import { fetchTournamentPrediction, type TournamentPrediction } from "@/lib/tournaments/prediction";

const formatWLPct = (wltpct: unknown, games: number): string => {
  const n = Number(wltpct);
  if (!Number.isFinite(n) || games === 0) return "—";
  const pct = n.toFixed(3);
  return pct.startsWith("0.") ? pct.slice(1) : pct;
};

function CoinTossPill() {
  return (
    <span
      className="inline-flex items-center gap-0.5 align-middle ml-1.5 px-1.5 py-0.5 text-[9px] font-bold tracking-[0.08em] uppercase border border-amber-400 text-amber-700 dark:border-yellow-500/40 dark:text-yellow-300"
      style={{ fontFamily: "var(--font-display)" }}
      title="Provisional rank — tied teams need a coin toss"
    >
      Coin Toss
    </span>
  );
}

function StandingsTable({
  rows,
  advancesPerGroup,
  unresolvedTeamIds,
}: {
  rows: StandingsRow[];
  advancesPerGroup: number | null;
  unresolvedTeamIds?: Set<number>;
}) {
  return (
    <div className="border border-border overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-border bg-surface">
            <th className="p-3 pl-4 text-left label-section w-14">Rank</th>
            <th className="p-3 text-left label-section">Team</th>
            <th className="p-3 text-right label-section">W</th>
            <th className="p-3 text-right label-section">G</th>
            <th className="p-3 text-right label-section">Pct</th>
            <th className="p-3 text-right label-section">RS</th>
            <th className="p-3 text-right label-section">RA</th>
            <th className="p-3 pr-4 text-right label-section">Diff</th>
            {advancesPerGroup !== null && (
              <th className="p-3 pr-4 text-right label-section w-16" />
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const isTop = r.rank_final === 1;
            const advances =
              advancesPerGroup !== null && r.rank_final <= advancesPerGroup;
            const diff = r.rundifferential;
            return (
              <tr
                key={r.teamid}
                className={cn(
                  "border-b border-border/50 last:border-0 transition-colors duration-100 relative",
                  advances
                    ? "bg-primary/5 hover:bg-primary/8"
                    : isTop
                      ? "bg-primary/5 hover:bg-primary/8"
                      : "hover:bg-elevated"
                )}
                style={
                  advances
                    ? { borderLeft: "3px solid var(--primary)" }
                    : isTop && advancesPerGroup === null
                      ? { borderLeft: "3px solid var(--primary)" }
                      : { borderLeft: "3px solid transparent" }
                }
              >
                <td className="p-3 pl-3 w-14">
                  <span
                    className={cn(
                      "tabular-nums leading-none",
                      advances || (isTop && advancesPerGroup === null)
                        ? "text-primary"
                        : "text-muted-foreground"
                    )}
                    style={{
                      fontFamily: "var(--font-display)",
                      fontWeight: 800,
                      fontSize: "26px",
                      letterSpacing: "-0.03em",
                    }}
                  >
                    {r.rank_final}
                  </span>
                </td>
                <td className="p-3 font-semibold text-foreground" style={{ fontFamily: "var(--font-body)" }}>
                  {r.team ?? "—"}
                  {unresolvedTeamIds?.has(r.teamid) && <CoinTossPill />}
                </td>
                <td className="p-3 text-right tabular-nums" style={{ fontFamily: "var(--font-body)" }}>{r.wins}</td>
                <td className="p-3 text-right tabular-nums text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>{r.games}</td>
                <td className="p-3 text-right tabular-nums font-medium" style={{ fontFamily: "var(--font-body)" }}>
                  {formatWLPct(r.wltpct, r.games)}
                </td>
                <td className="p-3 text-right tabular-nums text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>{r.runsscored}</td>
                <td className="p-3 text-right tabular-nums text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>{r.runsagainst}</td>
                <td
                  className="p-3 pr-4 text-right tabular-nums font-semibold"
                  style={{
                    fontFamily: "var(--font-body)",
                    color:
                      diff > 0
                        ? "var(--success)"
                        : diff < 0
                          ? "var(--destructive)"
                          : "var(--muted-foreground)",
                  }}
                >
                  {diff > 0 ? "+" : ""}{diff}
                </td>
                {advancesPerGroup !== null && (
                  <td className="p-3 pr-4 text-right">
                    {advances && (
                      <span
                        className="inline-block px-1.5 py-0.5 text-[9px] font-bold tracking-[0.1em] uppercase border border-primary text-primary"
                        style={{ fontFamily: "var(--font-display)" }}
                      >
                        ADV
                      </span>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TournamentStandingsCardList({
  rows,
  advancesPerGroup,
  unresolvedTeamIds,
}: {
  rows: StandingsRow[];
  advancesPerGroup: number | null;
  unresolvedTeamIds?: Set<number>;
}) {
  return (
    <div className="border border-border divide-y divide-border/50">
      {rows.map((r) => {
        const isTop = r.rank_final === 1;
        const advances = advancesPerGroup !== null && r.rank_final <= advancesPerGroup;
        const highlighted = advances || (isTop && advancesPerGroup === null);
        const diff = r.rundifferential;

        return (
          <div
            key={r.teamid}
            className={cn(
              "flex gap-3 px-3 py-3",
              highlighted ? "bg-primary/5" : ""
            )}
            style={highlighted ? { borderLeft: "3px solid var(--primary)" } : { borderLeft: "3px solid transparent" }}
          >
            <span
              className={cn(
                "tabular-nums leading-none shrink-0 w-8 text-center",
                highlighted ? "text-primary" : "text-muted-foreground"
              )}
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 800,
                fontSize: "22px",
                letterSpacing: "-0.03em",
              }}
            >
              {r.rank_final}
            </span>

            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="flex items-center min-w-0 font-semibold text-sm text-foreground truncate" style={{ fontFamily: "var(--font-body)" }}>
                  {r.team ?? "—"}
                  {unresolvedTeamIds?.has(r.teamid) && <CoinTossPill />}
                </span>
                <span className="tabular-nums text-sm font-medium shrink-0" style={{ fontFamily: "var(--font-body)" }}>
                  {formatWLPct(r.wltpct, r.games)}
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
                <span className="tabular-nums">{r.wins}W</span>
                <span>({r.games}G)</span>
                {advances && (
                  <span
                    className="inline-block px-1 py-px text-[8px] font-bold tracking-[0.1em] uppercase border border-primary text-primary ml-1"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    ADV
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2.5 mt-0.5 text-[11px] text-muted-foreground/70" style={{ fontFamily: "var(--font-body)" }}>
                <span className="tabular-nums">RS {r.runsscored}</span>
                <span className="tabular-nums">RA {r.runsagainst}</span>
                <span
                  className="tabular-nums font-semibold"
                  style={{
                    color: diff > 0 ? "var(--success)" : diff < 0 ? "var(--destructive)" : "var(--muted-foreground)",
                  }}
                >
                  {diff > 0 ? "+" : ""}{diff}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ResponsiveStandings({
  rows,
  advancesPerGroup,
  unresolvedTeamIds,
}: {
  rows: StandingsRow[];
  advancesPerGroup: number | null;
  unresolvedTeamIds?: Set<number>;
}) {
  return (
    <>
      <div className="hidden md:block">
        <StandingsTable rows={rows} advancesPerGroup={advancesPerGroup} unresolvedTeamIds={unresolvedTeamIds} />
      </div>
      <div className="md:hidden">
        <TournamentStandingsCardList rows={rows} advancesPerGroup={advancesPerGroup} unresolvedTeamIds={unresolvedTeamIds} />
      </div>
    </>
  );
}

function StandingsBody() {
  const { tid, t, canEdit } = useTournament();
  const [rows, setRows] = useState<StandingsRow[]>([]);
  const [coinTossGroups, setCoinTossGroups] = useState<CoinTossGroup[]>([]);
  const [coinTossPhase, setCoinTossPhase] = useState<CoinTossPhase>("none");
  const [remainingGames, setRemainingGames] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [includeInProgress, setIncludeInProgress] = useState(false);

  const { sources, toggleSource } = useGameSources();
  const [prediction, setPrediction] = useState<TournamentPrediction | null>(null);
  const [predicting, setPredicting] = useState(false);
  const [predictError, setPredictError] = useState<string | null>(null);

  const advancesPerGroup = t?.advances_per_group ?? null;

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

  useEffect(() => {
    if (!tid) return;
    let cancelled = false;
    (async () => {
      setLoading(true); setErr(null);
      try {
        const res = await fetch(`/api/tournaments/${tid}/standings?includeInProgress=${includeInProgress}`, {
          method: "GET",
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        const ct = res.headers.get("content-type") || "";
        if (!res.ok) {
          if (ct.includes("application/json")) throw new Error((await res.json())?.error || `HTTP ${res.status}`);
          await res.text();
          throw new Error(`HTTP ${res.status}`);
        }
        if (!ct.includes("application/json")) { await res.text(); throw new Error("Expected JSON response."); }
        const data = await res.json();
        if (!cancelled) {
          setRows(Array.isArray(data?.standings) ? data.standings : []);
          setCoinTossGroups(Array.isArray(data?.coinToss?.groups) ? data.coinToss.groups : []);
          const p = data?.coinToss?.phase;
          setCoinTossPhase(p === "final" || p === "provisional" ? p : "none");
          setRemainingGames(Number(data?.coinToss?.remainingGames ?? 0));
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : "Failed to load standings");
          setRows([]);
          setCoinTossGroups([]);
          setCoinTossPhase("none");
          setRemainingGames(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tid, includeInProgress, reloadKey]);

  // While a projection is active the table shows the projected finish instead
  // of the real one. Nothing is persisted — clearing restores the live table.
  const displayRows: StandingsRow[] = prediction
    ? (prediction.standings as unknown as StandingsRow[])
    : rows;

  // Determine if pool groups are in use
  const hasGroups = displayRows.some((r) => r.pool_group != null);

  // Build per-group sections when groups are present
  const groups = hasGroups
    ? Array.from(new Set(displayRows.map((r) => r.pool_group).filter(Boolean) as string[])).sort()
    : [];

  // Re-rank within each group (rows are sorted by global rank_final, so relative order is preserved)
  const groupRows = (group: string): StandingsRow[] =>
    displayRows
      .filter((r) => r.pool_group === group)
      .map((r, idx) => ({ ...r, rank_final: idx + 1 }));

  // Teams whose rank is provisional pending a manual coin toss. Only meaningful once
  // pool play is over — mid-pool every tie would get a pill, which is just noise.
  // Projected ranks are hypothetical, so coin-toss state is suppressed entirely.
  const unresolvedTeamIds =
    !prediction && coinTossPhase === "final"
      ? new Set<number>(
          coinTossGroups.filter((g) => !g.resolved).flatMap((g) => g.teams.map((t) => t.teamid))
        )
      : new Set<number>();

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "20px", textTransform: "uppercase", letterSpacing: "-0.01em" }}>
            Standings
          </h2>
          {!loading && displayRows.length > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5" style={{ fontFamily: "var(--font-body)" }}>
              {displayRows.length} teams ranked
              {hasGroups && ` · ${groups.length} pool groups`}
              {hasGroups && advancesPerGroup !== null && ` · top ${advancesPerGroup} per group advance`}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
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
          <PredictTournamentButton
            active={!!prediction}
            loading={predicting}
            onPredict={handlePredict}
            onClear={() => setPrediction(null)}
          />
        </div>
      </div>

      <div className="mb-4">
        <GameSourceToggles value={sources} onToggle={toggleSource} label="Predict from" />
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

      {!err && !prediction && (
        <CoinTossResolver
          scope="tournament"
          scopeId={Number(tid)}
          groups={coinTossGroups}
          phase={coinTossPhase}
          remainingGames={remainingGames}
          canEdit={canEdit}
          onSaved={() => setReloadKey((k) => k + 1)}
        />
      )}

      {loading ? (
        <div className="space-y-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 bg-elevated animate-pulse" />
          ))}
        </div>
      ) : err ? (
        <div className="border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{err}</div>
      ) : displayRows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border/60">
          <Trophy className="h-8 w-8 text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium text-foreground mb-1" style={{ fontFamily: "var(--font-display)", textTransform: "uppercase" }}>
            No Standings Yet
          </p>
          <p className="text-xs text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
            Add teams and pool games to see standings.
          </p>
        </div>
      ) : hasGroups ? (
        // Groups mode: render one table per group
        <div className="space-y-8">
          {groups.map((group) => {
            const gRows = groupRows(group);
            return (
              <div key={group}>
                <div className="flex items-center gap-3 mb-3">
                  <h3
                    style={{
                      fontFamily: "var(--font-display)",
                      fontWeight: 800,
                      fontSize: "14px",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                    }}
                  >
                    Group {group}
                  </h3>
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
                    {gRows.length} team{gRows.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <ResponsiveStandings rows={gRows} advancesPerGroup={advancesPerGroup} unresolvedTeamIds={unresolvedTeamIds} />
              </div>
            );
          })}

          {/* If any teams have no group, show them separately */}
          {displayRows.filter((r) => !r.pool_group).length > 0 && (
            <div>
              <div className="flex items-center gap-3 mb-3">
                <h3
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 800,
                    fontSize: "14px",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    opacity: 0.5,
                  }}
                >
                  Unassigned
                </h3>
                <div className="flex-1 h-px bg-border opacity-50" />
              </div>
              <ResponsiveStandings
                rows={displayRows.filter((r) => !r.pool_group).map((r, idx) => ({ ...r, rank_final: idx + 1 }))}
                advancesPerGroup={null}
                unresolvedTeamIds={unresolvedTeamIds}
              />
            </div>
          )}
        </div>
      ) : (
        // No-groups mode: existing flat table
        <ResponsiveStandings rows={displayRows} advancesPerGroup={null} unresolvedTeamIds={unresolvedTeamIds} />
      )}
    </div>
  );
}

export default function StandingsPage() {
  return (
    <TournamentProvider>
      <TournamentShell tab="standings">
        <StandingsBody />
      </TournamentShell>
    </TournamentProvider>
  );
}
