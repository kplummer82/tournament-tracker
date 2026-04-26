import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import Header from "@/components/Header";
import { ArrowLeft, AlertTriangle } from "lucide-react";

type ConflictRow = {
  coach_id: number;
  coach_name: string;
  gamedate: string;
  gametime: string;
  game1_id: number;
  game1_team_id: number;
  game1_team: string;
  game1_division: string;
  game2_id: number;
  game2_team_id: number;
  game2_team: string;
  game2_division: string;
};

type SeasonGroup = {
  year: number;
  season_type: string;
};

const SEASON_TYPES = ["spring", "summer", "fall", "winter"] as const;
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const INPUT = "border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors";

export default function CoachConflictsPage() {
  const router = useRouter();
  const leagueId = Number(Array.isArray(router.query.leagueid) ? router.query.leagueid[0] : router.query.leagueid);

  const [leagueName, setLeagueName] = useState("");
  const [seasonGroups, setSeasonGroups] = useState<SeasonGroup[]>([]);
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [seasonType, setSeasonType] = useState<string>("spring");
  const [conflicts, setConflicts] = useState<ConflictRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  // Fetch league info to get available season groups
  useEffect(() => {
    if (!router.isReady || !leagueId) return;
    fetch(`/api/leagues/${leagueId}`)
      .then((r) => r.json())
      .then((d) => {
        setLeagueName(d.name ?? "");
        const groups: SeasonGroup[] = d.season_groups ?? [];
        setSeasonGroups(groups);
        // Default to the first (most recent) season group if available
        if (groups.length > 0) {
          setYear(groups[0].year);
          setSeasonType(groups[0].season_type);
        }
      })
      .catch(() => {});
  }, [router.isReady, leagueId]);

  // Fetch conflicts when year/seasonType changes
  useEffect(() => {
    if (!leagueId || !year || !seasonType) return;
    setLoading(true);
    setFetched(false);
    fetch(`/api/leagues/${leagueId}/coaches/conflicts?year=${year}&season_type=${seasonType}`)
      .then((r) => r.json())
      .then((d) => setConflicts(Array.isArray(d.conflicts) ? d.conflicts : []))
      .catch(() => setConflicts([]))
      .finally(() => { setLoading(false); setFetched(true); });
  }, [leagueId, year, seasonType]);

  // Group conflicts by coach
  const grouped = conflicts.reduce<Record<number, { coach_name: string; items: ConflictRow[] }>>((acc, row) => {
    if (!acc[row.coach_id]) {
      acc[row.coach_id] = { coach_name: row.coach_name, items: [] };
    }
    acc[row.coach_id].items.push(row);
    return acc;
  }, {});

  // Unique years from season groups
  const years = [...new Set(seasonGroups.map((sg) => sg.year))].sort((a, b) => b - a);
  // Unique season types for selected year
  const typesForYear = seasonGroups.filter((sg) => sg.year === year).map((sg) => sg.season_type);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      {/* Top bar */}
      <div className="border-b border-border bg-card">
        <div className="mx-auto max-w-7xl px-4 md:px-6 h-10 flex items-center">
          <Link
            href={`/leagues/${leagueId}`}
            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors duration-100"
            style={{ fontFamily: "var(--font-body)", fontSize: "11px", letterSpacing: "0.06em", textTransform: "uppercase" }}
          >
            <ArrowLeft className="h-3 w-3" />
            {leagueName || "Back to League"}
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-7xl w-full px-6 py-8 flex-1">
        <div className="mb-6">
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              fontSize: "24px",
              letterSpacing: "-0.02em",
              textTransform: "uppercase",
            }}
          >
            Coach Scheduling Conflicts
          </h1>
          <p className="text-xs text-muted-foreground mt-1" style={{ fontFamily: "var(--font-body)" }}>
            Coaches assigned to teams in multiple divisions with overlapping game times.
          </p>
        </div>

        {/* Filters */}
        <div className="flex items-end gap-3 mb-6">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>Year</label>
            <select
              className={INPUT}
              value={year}
              onChange={(e) => {
                const y = Number(e.target.value);
                setYear(y);
                // Auto-select first available season type for this year
                const available = seasonGroups.filter((sg) => sg.year === y);
                if (available.length > 0 && !available.find((sg) => sg.season_type === seasonType)) {
                  setSeasonType(available[0].season_type);
                }
              }}
            >
              {years.length > 0 ? (
                years.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))
              ) : (
                <option value={year}>{year}</option>
              )}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>Season</label>
            <select
              className={INPUT}
              value={seasonType}
              onChange={(e) => setSeasonType(e.target.value)}
            >
              {SEASON_TYPES.map((t) => (
                <option key={t} value={t} disabled={typesForYear.length > 0 && !typesForYear.includes(t)}>
                  {capitalize(t)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Results */}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 bg-elevated animate-pulse" />
            ))}
          </div>
        ) : !fetched ? null : Object.keys(grouped).length === 0 ? (
          <div className="py-16 text-center border border-dashed border-border/60">
            <p className="text-sm font-medium text-foreground mb-1" style={{ fontFamily: "var(--font-display)", textTransform: "uppercase" }}>
              No Conflicts Found
            </p>
            <p className="text-xs text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
              No coaches have overlapping game times across divisions for {year} {capitalize(seasonType)}.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <p className="text-xs text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
              {conflicts.length} conflict{conflicts.length !== 1 ? "s" : ""} found across {Object.keys(grouped).length} coach{Object.keys(grouped).length !== 1 ? "es" : ""}
            </p>

            {Object.entries(grouped).map(([coachId, { coach_name, items }]) => (
              <div key={coachId} className="border border-border bg-card">
                <div className="px-4 py-3 border-b border-border bg-surface flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-primary shrink-0" />
                  <span className="font-semibold text-sm">{coach_name}</span>
                  <span className="text-[10px] text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
                    {items.length} conflict{items.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="divide-y divide-border/50">
                  {items.map((c, idx) => (
                    <div key={idx} className="px-4 py-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-semibold text-foreground" style={{ fontFamily: "var(--font-body)" }}>
                          {new Date(c.gamedate + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                        </span>
                        <span className="text-xs text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
                          {c.gametime}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="flex items-center gap-2 px-3 py-2 border border-border bg-elevated/50 text-xs" style={{ fontFamily: "var(--font-body)" }}>
                          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground shrink-0">{c.game1_division}</span>
                          <span className="text-foreground">{c.game1_team}</span>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-2 border border-border bg-elevated/50 text-xs" style={{ fontFamily: "var(--font-body)" }}>
                          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground shrink-0">{c.game2_division}</span>
                          <span className="text-foreground">{c.game2_team}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
