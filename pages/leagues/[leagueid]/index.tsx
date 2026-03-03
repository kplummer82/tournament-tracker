import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import Header from "@/components/Header";
import { ArrowLeft, ArrowRight, Plus, X } from "lucide-react";

type League = {
  id: number;
  name: string;
  abbreviation: string | null;
  city: string | null;
  state: string | null;
  governing_body_id: number | null;
  governing_body_name: string | null;
  governing_body_abbreviation: string | null;
  sportid: number | null;
  sport: string | null;
};

type Division = {
  id: number;
  name: string;
  age_range: string | null;
  sort_order: number;
  season_count: number;
};

const INPUT = "w-full border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors";
const BTN_BASE = "inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors duration-100 border";

export default function LeagueDetailPage() {
  const router = useRouter();
  const leagueId = Number(Array.isArray(router.query.leagueid) ? router.query.leagueid[0] : router.query.leagueid);

  const [league, setLeague] = useState<League | null>(null);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", age_range: "", sort_order: "0" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!router.isReady || !leagueId) return;
    fetch(`/api/leagues/${leagueId}`)
      .then((r) => r.json())
      .then((d) => {
        setLeague(d);
        setDivisions(d.divisions ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [router.isReady, leagueId]);

  const createDivision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/leagues/${leagueId}/divisions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name, age_range: form.age_range || null, sort_order: Number(form.sort_order) || 0 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to create");
      setDivisions((prev) => [...prev, { ...json, season_count: 0 }].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)));
      setForm({ name: "", age_range: "", sort_order: "0" });
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
        <div className="mx-auto max-w-7xl px-6 h-10 flex items-center">
          <Link
            href="/leagues"
            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors duration-100"
            style={{ fontFamily: "var(--font-body)", fontSize: "11px", letterSpacing: "0.06em", textTransform: "uppercase" }}
          >
            <ArrowLeft className="h-3 w-3" />
            All Leagues
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-7xl w-full px-6 py-8 flex-1">
        {loading ? (
          <div className="space-y-4">
            <div className="h-8 w-64 bg-elevated animate-pulse" />
            <div className="h-4 w-40 bg-elevated animate-pulse" />
          </div>
        ) : !league ? (
          <p className="text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>League not found.</p>
        ) : (
          <>
            {/* League header */}
            <div className="mb-8">
              <div className="flex items-start gap-3 mb-2">
                {league.abbreviation && (
                  <span className="text-[10px] font-bold tracking-widest px-2 py-0.5 border border-border text-muted-foreground mt-2" style={{ fontFamily: "var(--font-body)" }}>
                    {league.abbreviation}
                  </span>
                )}
                <h1
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 800,
                    fontSize: "28px",
                    letterSpacing: "-0.02em",
                    textTransform: "uppercase",
                  }}
                >
                  {league.name}
                </h1>
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
                {league.governing_body_name && <span>{league.governing_body_name}</span>}
                {[league.city, league.state].filter(Boolean).join(", ") && (
                  <span>{[league.city, league.state].filter(Boolean).join(", ")}</span>
                )}
                {league.sport && <span>{league.sport}</span>}
              </div>
            </div>

            {/* Divisions */}
            <div className="flex items-center justify-between mb-4">
              <h2
                className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground"
                style={{ fontFamily: "var(--font-body)" }}
              >
                Divisions
              </h2>
              <button
                type="button"
                onClick={() => setShowCreate((s) => !s)}
                className={`${BTN_BASE} bg-primary text-primary-foreground border-primary hover:opacity-90`}
                style={{ fontFamily: "var(--font-body)" }}
              >
                <Plus className="h-3 w-3" />
                Add Division
              </button>
            </div>

            {showCreate && (
              <form onSubmit={createDivision} className="mb-4 p-4 border border-border bg-card space-y-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
                    New Division
                  </span>
                  <button type="button" onClick={() => setShowCreate(false)}>
                    <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                  </button>
                </div>
                {error && <p className="text-xs text-destructive" style={{ fontFamily: "var(--font-body)" }}>{error}</p>}
                <div className="grid grid-cols-3 gap-3">
                  <input className={INPUT} placeholder="Division name * (e.g. Mustang)" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
                  <input className={INPUT} placeholder="Age range (e.g. 9-10)" value={form.age_range} onChange={(e) => setForm((p) => ({ ...p, age_range: e.target.value }))} />
                  <input className={INPUT} type="number" placeholder="Sort order" value={form.sort_order} onChange={(e) => setForm((p) => ({ ...p, sort_order: e.target.value }))} />
                </div>
                <div className="flex justify-end">
                  <button type="submit" disabled={saving} className={`${BTN_BASE} bg-primary text-primary-foreground border-primary hover:opacity-90 disabled:opacity-40`} style={{ fontFamily: "var(--font-body)" }}>
                    {saving ? "Creating…" : "Create Division"}
                  </button>
                </div>
              </form>
            )}

            {divisions.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground" style={{ fontFamily: "var(--font-body)", fontSize: "14px" }}>
                No divisions yet. Add the first division above.
              </div>
            ) : (
              <div className="space-y-2">
                {divisions.map((div) => (
                  <Link
                    key={div.id}
                    href={`/leagues/${leagueId}/divisions/${div.id}`}
                    className="flex items-center justify-between px-4 py-3 border border-border hover:border-primary/40 bg-card hover:bg-elevated transition-colors duration-100 group"
                  >
                    <div>
                      <p className="font-semibold text-sm">{div.name}</p>
                      <p className="text-xs text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
                        {div.age_range ? `Ages ${div.age_range}` : ""}
                        {div.age_range && div.season_count > 0 ? " · " : ""}
                        {div.season_count > 0 ? `${div.season_count} season${div.season_count !== 1 ? "s" : ""}` : "No seasons yet"}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
