import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import Header from "@/components/Header";
import { ArrowLeft, ArrowRight, Plus, X } from "lucide-react";

type DivisionSeason = {
  season_id: number;
  season_name: string;
  status: string;
  division_id: number;
  division_name: string;
  age_range: string | null;
  sort_order: number;
  team_count: number;
  game_count: number;
};

type LeagueDivision = {
  id: number;
  name: string;
  age_range: string | null;
};

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  draft:     { bg: "#5a5a5a18", text: "#888",     border: "#5a5a5a40" },
  active:    { bg: "#00c85318", text: "#00c853",  border: "#00c85340" },
  playoffs:  { bg: "#ff8c0018", text: "#ff8c00",  border: "#ff8c0040" },
  completed: { bg: "var(--badge-completed-bg)", text: "var(--badge-completed-text)", border: "var(--badge-completed-border)" },
  archived:  { bg: "#3a3a3a18", text: "#5a5a5a",  border: "#3a3a3a40" },
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const BTN_BASE = "inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors duration-100 border";

export default function SeasonGroupPage() {
  const router = useRouter();
  const leagueId = Number(Array.isArray(router.query.leagueid) ? router.query.leagueid[0] : router.query.leagueid);
  const slug = Array.isArray(router.query.slug) ? router.query.slug[0] : router.query.slug;

  const [divisions, setDivisions] = useState<DivisionSeason[]>([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState<number>(0);
  const [seasonType, setSeasonType] = useState("");

  // Add division form
  const [showAdd, setShowAdd] = useState(false);
  const [allDivisions, setAllDivisions] = useState<LeagueDivision[]>([]);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    if (!router.isReady || !leagueId || !slug) return;

    const m = slug.match(/^(\d{4})-(spring|summer|fall|winter)$/);
    if (!m) { setLoading(false); return; }
    setYear(parseInt(m[1], 10));
    setSeasonType(m[2]);

    Promise.all([
      fetch(`/api/leagues/${leagueId}/seasons/${slug}`).then((r) => r.json()),
      fetch(`/api/leagues/${leagueId}`).then((r) => r.json()),
    ])
      .then(([seasonData, leagueData]) => {
        setDivisions(seasonData.divisions ?? []);
        setAllDivisions(leagueData.divisions ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [router.isReady, leagueId, slug]);

  const existingDivIds = new Set(divisions.map((d) => d.division_id));
  const availableDivisions = allDivisions.filter((d) => !existingDivIds.has(d.id));

  const addDivision = async (divId: number) => {
    setAdding(true);
    setAddError(null);
    try {
      const name = `${year} ${capitalize(seasonType)} Season`;
      const res = await fetch("/api/seasons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          league_division_id: divId,
          name,
          year,
          season_type: seasonType,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to create");

      const div = allDivisions.find((d) => d.id === divId);
      setDivisions((prev) => [
        ...prev,
        {
          season_id: json.id,
          season_name: json.name,
          status: json.status,
          division_id: divId,
          division_name: div?.name ?? "",
          age_range: div?.age_range ?? null,
          sort_order: 0,
          team_count: 0,
          game_count: 0,
        },
      ].sort((a, b) => a.sort_order - b.sort_order || a.division_name.localeCompare(b.division_name)));
      setShowAdd(false);
    } catch (e: any) {
      setAddError(e.message);
    } finally {
      setAdding(false);
    }
  };

  const title = year ? `${year} ${capitalize(seasonType)}` : "Season";

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
            League
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-7xl w-full px-6 py-8 flex-1">
        {loading ? (
          <div className="space-y-4">
            <div className="h-8 w-64 bg-elevated animate-pulse" />
          </div>
        ) : !year ? (
          <p className="text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>Invalid season.</p>
        ) : (
          <>
            {/* Season group header */}
            <div className="mb-8">
              <h1
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 800,
                  fontSize: "28px",
                  letterSpacing: "-0.02em",
                  textTransform: "uppercase",
                }}
              >
                {title}
              </h1>
              <p className="text-sm text-muted-foreground mt-1" style={{ fontFamily: "var(--font-body)" }}>
                {divisions.length} division{divisions.length !== 1 ? "s" : ""}
              </p>
            </div>

            {/* Divisions list */}
            <div className="flex items-center justify-between mb-4">
              <h2
                className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground"
                style={{ fontFamily: "var(--font-body)" }}
              >
                Divisions
              </h2>
              {availableDivisions.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAdd((s) => !s)}
                  className={`${BTN_BASE} bg-primary text-primary-foreground border-primary hover:opacity-90`}
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  <Plus className="h-3 w-3" />
                  Add Division
                </button>
              )}
            </div>

            {showAdd && (
              <div className="mb-4 p-4 border border-border bg-card space-y-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
                    Add Division to {title}
                  </span>
                  <button type="button" onClick={() => setShowAdd(false)}>
                    <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                  </button>
                </div>
                {addError && <p className="text-xs text-destructive" style={{ fontFamily: "var(--font-body)" }}>{addError}</p>}
                <div className="flex flex-wrap gap-2">
                  {availableDivisions.map((div) => (
                    <button
                      key={div.id}
                      type="button"
                      onClick={() => addDivision(div.id)}
                      disabled={adding}
                      className={`${BTN_BASE} border-border text-foreground hover:border-primary hover:bg-primary/10 disabled:opacity-40`}
                      style={{ fontFamily: "var(--font-body)" }}
                    >
                      <Plus className="h-3 w-3" />
                      {div.name}
                      {div.age_range ? ` (${div.age_range})` : ""}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {divisions.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground" style={{ fontFamily: "var(--font-body)", fontSize: "14px" }}>
                No divisions in this season yet.
              </div>
            ) : (
              <div className="space-y-2">
                {divisions.map((ds) => {
                  const sc = STATUS_COLORS[ds.status] ?? STATUS_COLORS.draft;
                  return (
                    <Link
                      key={ds.season_id}
                      href={`/seasons/${ds.season_id}/overview`}
                      className="flex items-center justify-between px-4 py-3 border border-border bg-card hover:border-primary/40 hover:bg-elevated transition-colors duration-100 group"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className="badge text-[10px]"
                          style={{ background: sc.bg, color: sc.text, borderColor: sc.border }}
                        >
                          {ds.status}
                        </span>
                        <div>
                          <p className="font-semibold text-sm">{ds.division_name}</p>
                          <p className="text-xs text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
                            {ds.age_range ? `Ages ${ds.age_range} · ` : ""}
                            {ds.team_count} team{ds.team_count !== 1 ? "s" : ""}
                            {ds.game_count > 0 ? ` · ${ds.game_count} game${ds.game_count !== 1 ? "s" : ""}` : ""}
                          </p>
                        </div>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                    </Link>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
