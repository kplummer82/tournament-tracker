// pages/seasons/[seasonid]/standings.tsx
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import SeasonProvider, { useSeason } from "@/components/seasons/SeasonProvider";
import SeasonShell from "@/components/seasons/SeasonShell";
import { Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import SosView, { type SosGameRow } from "@/components/seasons/SosView";

type StandingsRow = {
  teamid: number;
  team: string;
  seasonid: number;
  seasonname: string;
  wins: number;
  games: number;
  wltpct: number | null;
  runsscored: number;
  runsagainst: number;
  rundifferential: number;
  rank_final: number;
};

type ViewMode = "standings" | "sos";
type SosMode = "full" | "remaining";

/** Derive W/L/T from the DB's win_pts (wins=1, ties=0.5) and games played */
function derivedRecord(wins: number, games: number) {
  const ties = Math.round((wins % 1) * 2);
  const w = Math.floor(wins);
  const l = games - w - ties;
  return { w, l, t: ties };
}

const formatWLPct = (wltpct: unknown, games: number): string => {
  const n = Number(wltpct);
  if (!Number.isFinite(n) || games === 0) return "—";
  const pct = n.toFixed(3);
  return pct.startsWith("0.") ? pct.slice(1) : pct;
};

function computeGB(rows: StandingsRow[]) {
  const leader = rows.find((r) => r.rank_final === 1);
  if (!leader) return new Map<number, number | null>();
  const { w: lw, l: ll } = derivedRecord(leader.wins, leader.games);
  return new Map(
    rows.map((r) => {
      if (r.rank_final === 1) return [r.teamid, null];
      const { w, l } = derivedRecord(r.wins, r.games);
      return [r.teamid, ((lw - w) + (l - ll)) / 2];
    })
  );
}

const formatGB = (gb: number | null): string => {
  if (gb === null) return "—";
  if (gb === 0) return "—";
  return gb % 1 === 0 ? String(gb) : gb.toFixed(1);
};

/* ── Segmented control ─────────────────────────────────────────────── */

function SegmentedControl<T extends string>({
  options,
  active,
  onChange,
  size = "default",
}: {
  options: { key: T; label: string }[];
  active: T;
  onChange: (key: T) => void;
  size?: "default" | "sm";
}) {
  const pad = size === "sm" ? "px-2.5 py-1 text-[10px]" : "px-3 py-1.5 text-[11px]";
  return (
    <div className="inline-flex border border-border overflow-hidden">
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={cn(
            "font-bold tracking-[0.08em] uppercase transition-colors cursor-pointer",
            pad,
            o.key === active
              ? "bg-primary text-primary-foreground"
              : "bg-transparent text-muted-foreground hover:text-foreground"
          )}
          style={{ fontFamily: "var(--font-display)" }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ── Standings table (unchanged) ───────────────────────────────────── */

function StandingsTable({
  rows,
  advancesToPlayoffs,
  seasonId,
}: {
  rows: StandingsRow[];
  advancesToPlayoffs: number | null;
  seasonId: string;
}) {
  const gbMap = computeGB(rows);

  return (
    <div className="border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-surface">
            <th className="p-3 pl-4 text-left label-section w-14">Rank</th>
            <th className="p-3 text-left label-section">Team</th>
            <th className="p-3 text-right label-section">W</th>
            <th className="p-3 text-right label-section">L</th>
            <th className="p-3 text-right label-section">T</th>
            <th className="p-3 text-right label-section">G</th>
            <th className="p-3 text-right label-section">Pct</th>
            <th className="p-3 text-right label-section">GB</th>
            <th className="p-3 text-right label-section">RS</th>
            <th className="p-3 text-right label-section">RA</th>
            <th className="p-3 pr-4 text-right label-section">Diff</th>
            {advancesToPlayoffs !== null && <th className="p-3 pr-4 text-right label-section w-16" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const advances = advancesToPlayoffs !== null && r.rank_final <= advancesToPlayoffs;
            const isTop = r.rank_final === 1;
            const diff = r.rundifferential;
            const { w, l, t } = derivedRecord(r.wins, r.games);
            return (
              <tr
                key={r.teamid}
                className={cn(
                  "border-b border-border/50 last:border-0 transition-colors duration-100",
                  advances
                    ? "bg-primary/5 hover:bg-primary/8"
                    : isTop && advancesToPlayoffs === null
                      ? "bg-primary/5 hover:bg-primary/8"
                      : "hover:bg-elevated"
                )}
                style={
                  advances
                    ? { borderLeft: "3px solid var(--primary)" }
                    : isTop && advancesToPlayoffs === null
                      ? { borderLeft: "3px solid var(--primary)" }
                      : { borderLeft: "3px solid transparent" }
                }
              >
                <td className="p-3 pl-3 w-14">
                  <span
                    className={cn(
                      "tabular-nums leading-none",
                      advances || (isTop && advancesToPlayoffs === null)
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
                  <Link
                    href={`/teams/${r.teamid}?returnTo=/seasons/${seasonId}/standings`}
                    className="hover:text-primary transition-colors"
                  >
                    {r.team ?? "—"}
                  </Link>
                </td>
                <td className="p-3 text-right tabular-nums" style={{ fontFamily: "var(--font-body)" }}>{w}</td>
                <td className="p-3 text-right tabular-nums" style={{ fontFamily: "var(--font-body)" }}>{l}</td>
                <td className="p-3 text-right tabular-nums" style={{ fontFamily: "var(--font-body)" }}>{t}</td>
                <td className="p-3 text-right tabular-nums text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>{r.games}</td>
                <td className="p-3 text-right tabular-nums font-medium" style={{ fontFamily: "var(--font-body)" }}>
                  {formatWLPct(r.wltpct, r.games)}
                </td>
                <td className="p-3 text-right tabular-nums text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
                  {formatGB(gbMap.get(r.teamid) ?? null)}
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
                {advancesToPlayoffs !== null && (
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

/* ── Standings card list (unchanged) ───────────────────────────────── */

function StandingsCardList({
  rows,
  advancesToPlayoffs,
  seasonId,
}: {
  rows: StandingsRow[];
  advancesToPlayoffs: number | null;
  seasonId: string;
}) {
  const gbMap = computeGB(rows);

  return (
    <div className="border border-border divide-y divide-border/50">
      {rows.map((r) => {
        const advances = advancesToPlayoffs !== null && r.rank_final <= advancesToPlayoffs;
        const isTop = r.rank_final === 1;
        const highlighted = advances || (isTop && advancesToPlayoffs === null);
        const diff = r.rundifferential;
        const { w, l, t } = derivedRecord(r.wins, r.games);
        const gb = gbMap.get(r.teamid) ?? null;

        return (
          <div
            key={r.teamid}
            className={cn(
              "flex gap-3 px-3 py-3",
              highlighted ? "bg-primary/5" : ""
            )}
            style={highlighted ? { borderLeft: "3px solid var(--primary)" } : { borderLeft: "3px solid transparent" }}
          >
            {/* Rank */}
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

            {/* Details */}
            <div className="flex-1 min-w-0">
              {/* Row 1: Team + PCT */}
              <div className="flex items-baseline justify-between gap-2">
                <Link
                  href={`/teams/${r.teamid}?returnTo=/seasons/${seasonId}/standings`}
                  className="font-semibold text-sm text-foreground truncate hover:text-primary transition-colors"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  {r.team ?? "—"}
                </Link>
                <span className="tabular-nums text-sm font-medium shrink-0" style={{ fontFamily: "var(--font-body)" }}>
                  {formatWLPct(r.wltpct, r.games)}
                </span>
              </div>

              {/* Row 2: Record + GB */}
              <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
                <span className="tabular-nums">{w}-{l}-{t}</span>
                <span>({r.games}G)</span>
                {gb !== null && gb !== 0 && (
                  <>
                    <span className="text-border">·</span>
                    <span className="tabular-nums">GB: {formatGB(gb)}</span>
                  </>
                )}
                {advances && (
                  <span
                    className="inline-block px-1 py-px text-[8px] font-bold tracking-[0.1em] uppercase border border-primary text-primary ml-1"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    ADV
                  </span>
                )}
              </div>

              {/* Row 3: RS / RA / Diff */}
              <div className="flex items-center gap-2.5 mt-0.5 text-[11px] text-muted-foreground/70" style={{ fontFamily: "var(--font-body)" }}>
                <span className="tabular-nums">RS {r.runsscored}</span>
                <span className="tabular-nums">RA {r.runsagainst}</span>
                <span
                  className="tabular-nums font-semibold"
                  style={{
                    color:
                      diff > 0 ? "var(--success)" : diff < 0 ? "var(--destructive)" : "var(--muted-foreground)",
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

/* ── Main body ─────────────────────────────────────────────────────── */

function StandingsBody() {
  const { seasonId, season } = useSeason();
  const [rows, setRows] = useState<StandingsRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [includeInProgress, setIncludeInProgress] = useState(false);

  const [viewMode, setViewMode] = useState<ViewMode>("standings");
  const [sosMode, setSosMode] = useState<SosMode>("full");
  const [games, setGames] = useState<SosGameRow[]>([]);
  const [gamesLoading, setGamesLoading] = useState(false);
  const gamesLoaded = useRef(false);

  const advancesToPlayoffs = season?.advances_to_playoffs ?? null;

  // Fetch standings
  useEffect(() => {
    if (!seasonId) return;
    let cancelled = false;
    (async () => {
      setLoading(true); setErr(null);
      try {
        const res = await fetch(`/api/seasons/${seasonId}/standings?includeInProgress=${includeInProgress}`, {
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || `HTTP ${res.status}`);
        }
        const data = await res.json();
        if (!cancelled) setRows(Array.isArray(data?.standings) ? data.standings : []);
      } catch (e: unknown) {
        if (!cancelled) { setErr((e as Error).message || "Failed to load standings"); setRows([]); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [seasonId, includeInProgress]);

  // Lazy-fetch games when SoS view is activated
  useEffect(() => {
    if (viewMode !== "sos" || !seasonId || gamesLoaded.current) return;
    let cancelled = false;
    (async () => {
      setGamesLoading(true);
      try {
        const res = await fetch(`/api/seasons/${seasonId}/games`, {
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) {
          setGames(Array.isArray(data?.games) ? data.games : []);
          gamesLoaded.current = true;
        }
      } catch {
        if (!cancelled) setGames([]);
      } finally {
        if (!cancelled) setGamesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [viewMode, seasonId]);

  // Reset games cache when season changes
  const prevSeasonId = useRef(seasonId);
  useEffect(() => {
    if (seasonId !== prevSeasonId.current) {
      gamesLoaded.current = false;
      prevSeasonId.current = seasonId;
    }
  }, [seasonId]);

  const handleViewChange = useCallback((v: ViewMode) => {
    setViewMode(v);
  }, []);

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col gap-3 mb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "20px", textTransform: "uppercase", letterSpacing: "-0.01em" }}>
            {viewMode === "standings" ? "Standings" : "Strength of Schedule"}
          </h2>
          {viewMode === "standings" && !loading && rows.length > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5" style={{ fontFamily: "var(--font-body)" }}>
              {rows.length} teams ranked
              {advancesToPlayoffs !== null && ` · top ${advancesToPlayoffs} advance to playoffs`}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* View-specific controls */}
          {viewMode === "standings" && (
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
          {viewMode === "sos" && (
            <SegmentedControl<SosMode>
              options={[
                { key: "full", label: "Full Season" },
                { key: "remaining", label: "Remaining" },
              ]}
              active={sosMode}
              onChange={setSosMode}
              size="sm"
            />
          )}

          {/* View switcher */}
          <SegmentedControl<ViewMode>
            options={[
              { key: "standings", label: "Standings" },
              { key: "sos", label: "SoS" },
            ]}
            active={viewMode}
            onChange={handleViewChange}
          />
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 bg-elevated animate-pulse" />
          ))}
        </div>
      ) : err ? (
        <div className="border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{err}</div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border/60">
          <Trophy className="h-8 w-8 text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium text-foreground mb-1" style={{ fontFamily: "var(--font-display)", textTransform: "uppercase" }}>
            No Standings Yet
          </p>
          <p className="text-xs text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
            Add teams and regular season games to see standings.
          </p>
        </div>
      ) : viewMode === "standings" ? (
        <>
          <div className="hidden md:block">
            <StandingsTable rows={rows} advancesToPlayoffs={advancesToPlayoffs} seasonId={String(seasonId)} />
          </div>
          <div className="md:hidden">
            <StandingsCardList rows={rows} advancesToPlayoffs={advancesToPlayoffs} seasonId={String(seasonId)} />
          </div>
        </>
      ) : gamesLoading ? (
        <div className="space-y-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 bg-elevated animate-pulse" />
          ))}
        </div>
      ) : (
        <SosView standings={rows} games={games} mode={sosMode} seasonId={String(seasonId)} />
      )}
    </div>
  );
}

export default function SeasonStandingsPage() {
  return (
    <SeasonProvider>
      <SeasonShell tab="standings">
        <StandingsBody />
      </SeasonShell>
    </SeasonProvider>
  );
}
