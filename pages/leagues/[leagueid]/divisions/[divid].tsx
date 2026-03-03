import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import Header from "@/components/Header";
import { ArrowLeft, ArrowRight, Plus, X } from "lucide-react";

type Division = {
  id: number;
  league_id: number;
  name: string;
  age_range: string | null;
  sort_order: number;
};

type Season = {
  id: number;
  name: string;
  year: number;
  season_type: string;
  status: string;
  team_count: number;
};

const SEASON_TYPES = ["spring", "summer", "fall", "winter"] as const;
const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  draft:     { bg: "#5a5a5a18", text: "#888",     border: "#5a5a5a40" },
  active:    { bg: "#00c85318", text: "#00c853",  border: "#00c85340" },
  playoffs:  { bg: "#ff8c0018", text: "#ff8c00",  border: "#ff8c0040" },
  completed: { bg: "#ffe50018", text: "#ffe500",  border: "#ffe50040" },
  archived:  { bg: "#3a3a3a18", text: "#5a5a5a",  border: "#3a3a3a40" },
};

const INPUT = "w-full border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors";
const BTN_BASE = "inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors duration-100 border";

export default function DivisionDetailPage() {
  const router = useRouter();
  const leagueId = Number(Array.isArray(router.query.leagueid) ? router.query.leagueid[0] : router.query.leagueid);
  const divId = Number(Array.isArray(router.query.divid) ? router.query.divid[0] : router.query.divid);

  const [division, setDivision] = useState<Division | null>(null);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", year: String(new Date().getFullYear()), season_type: "spring" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!router.isReady || !leagueId || !divId) return;
    fetch(`/api/leagues/${leagueId}/divisions/${divId}`)
      .then((r) => r.json())
      .then((d) => {
        setDivision(d);
        setSeasons(d.seasons ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [router.isReady, leagueId, divId]);

  // Auto-generate season name from year + type
  const autoName = `${form.year} ${form.season_type.charAt(0).toUpperCase() + form.season_type.slice(1)} Season`;

  const createSeason = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/seasons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          league_division_id: divId,
          name: form.name || autoName,
          year: Number(form.year),
          season_type: form.season_type,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to create");
      setSeasons((prev) => [{ ...json, team_count: 0 }, ...prev]);
      setForm({ name: "", year: String(new Date().getFullYear()), season_type: "spring" });
      setShowCreate(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      {/* Top bar */}
      <div className="border-b border-border bg-card">
        <div className="mx-auto max-w-7xl px-6 h-10 flex items-center gap-4">
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
        ) : !division ? (
          <p className="text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>Division not found.</p>
        ) : (
          <>
            {/* Division header */}
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
                {division.name}
              </h1>
              {division.age_range && (
                <p className="text-sm text-muted-foreground mt-1" style={{ fontFamily: "var(--font-body)" }}>
                  Ages {division.age_range}
                </p>
              )}
            </div>

            {/* Seasons */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
                Seasons
              </h2>
              <button
                type="button"
                onClick={() => setShowCreate((s) => !s)}
                className={`${BTN_BASE} bg-primary text-primary-foreground border-primary hover:opacity-90`}
                style={{ fontFamily: "var(--font-body)" }}
              >
                <Plus className="h-3 w-3" />
                New Season
              </button>
            </div>

            {showCreate && (
              <form onSubmit={createSeason} className="mb-4 p-4 border border-border bg-card space-y-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
                    New Season
                  </span>
                  <button type="button" onClick={() => setShowCreate(false)}>
                    <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                  </button>
                </div>
                {error && <p className="text-xs text-destructive" style={{ fontFamily: "var(--font-body)" }}>{error}</p>}
                <div className="grid grid-cols-3 gap-3">
                  <input
                    className={INPUT}
                    type="number"
                    placeholder="Year"
                    value={form.year}
                    onChange={(e) => setForm((p) => ({ ...p, year: e.target.value }))}
                    required
                  />
                  <select
                    className={INPUT}
                    value={form.season_type}
                    onChange={(e) => setForm((p) => ({ ...p, season_type: e.target.value }))}
                  >
                    {SEASON_TYPES.map((t) => (
                      <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                    ))}
                  </select>
                  <input
                    className={INPUT}
                    placeholder={`Name (default: ${autoName})`}
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  />
                </div>
                <div className="flex justify-end">
                  <button type="submit" disabled={saving} className={`${BTN_BASE} bg-primary text-primary-foreground border-primary hover:opacity-90 disabled:opacity-40`} style={{ fontFamily: "var(--font-body)" }}>
                    {saving ? "Creating…" : "Create Season"}
                  </button>
                </div>
              </form>
            )}

            {seasons.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground" style={{ fontFamily: "var(--font-body)", fontSize: "14px" }}>
                No seasons yet. Create the first season above.
              </div>
            ) : (
              <div className="space-y-2">
                {seasons.map((s) => {
                  const sc = STATUS_COLORS[s.status] ?? STATUS_COLORS.draft;
                  return (
                    <Link
                      key={s.id}
                      href={`/seasons/${s.id}/overview`}
                      className="flex items-center justify-between px-4 py-3 border border-border hover:border-primary/40 bg-card hover:bg-elevated transition-colors duration-100 group"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className="badge text-[10px]"
                          style={{ background: sc.bg, color: sc.text, borderColor: sc.border }}
                        >
                          {s.status}
                        </span>
                        <div>
                          <p className="font-semibold text-sm">{s.name}</p>
                          <p className="text-xs text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
                            {s.team_count} team{s.team_count !== 1 ? "s" : ""}
                          </p>
                        </div>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
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
