import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import Header from "@/components/Header";
import { usePermissions } from "@/lib/hooks/usePermissions";
import ManageAccessPanel from "@/components/ManageAccessPanel";
import { ArrowLeft, ArrowRight, ChevronDown, ChevronRight, Pencil, Plus, Trash2, X } from "lucide-react";
import FollowButton from "@/components/FollowButton";

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

type SeasonGroup = {
  year: number;
  season_type: string;
  division_count: number;
  statuses: string[];
};

const SEASON_TYPES = ["spring", "summer", "fall", "winter"] as const;

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  draft:     { bg: "#5a5a5a18", text: "#888",     border: "#5a5a5a40" },
  active:    { bg: "#00c85318", text: "#00c853",  border: "#00c85340" },
  playoffs:  { bg: "#ff8c0018", text: "#ff8c00",  border: "#ff8c0040" },
  completed: { bg: "var(--badge-completed-bg)", text: "var(--badge-completed-text)", border: "var(--badge-completed-border)" },
  archived:  { bg: "#3a3a3a18", text: "#5a5a5a",  border: "#3a3a3a40" },
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const INPUT = "w-full border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors";
const BTN_BASE = "inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors duration-100 border";

export default function LeagueDetailPage() {
  const router = useRouter();
  const leagueId = Number(Array.isArray(router.query.leagueid) ? router.query.leagueid[0] : router.query.leagueid);

  const permissions = usePermissions();
  const canEdit = permissions.canEditLeague(leagueId);

  const [league, setLeague] = useState<League | null>(null);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [seasonGroups, setSeasonGroups] = useState<SeasonGroup[]>([]);
  const [loading, setLoading] = useState(true);

  // Division management (collapsible)
  const [showDivisions, setShowDivisions] = useState(false);
  const [showCreateDiv, setShowCreateDiv] = useState(false);
  const [divForm, setDivForm] = useState({ name: "", age_range: "", sort_order: "0" });
  const [divSaving, setDivSaving] = useState(false);
  const [divError, setDivError] = useState<string | null>(null);
  const [editingDivId, setEditingDivId] = useState<number | null>(null);
  const [editDivForm, setEditDivForm] = useState({ name: "", age_range: "", sort_order: "0" });
  const [editDivSaving, setEditDivSaving] = useState(false);
  const [editDivError, setEditDivError] = useState<string | null>(null);
  const [confirmDeleteDiv, setConfirmDeleteDiv] = useState<number | null>(null);
  const [deletingDiv, setDeletingDiv] = useState(false);

  // New season form
  const [showCreateSeason, setShowCreateSeason] = useState(false);
  const [seasonForm, setSeasonForm] = useState({ year: String(new Date().getFullYear()), season_type: "spring" as string, divisionIds: [] as number[] });
  const [seasonSaving, setSeasonSaving] = useState(false);
  const [seasonError, setSeasonError] = useState<string | null>(null);

  // Inline division creation within the season form
  const [inlineDivs, setInlineDivs] = useState<{ name: string; age_range: string; sort_order: string }[]>([]);
  const [showInlineDivForm, setShowInlineDivForm] = useState(false);
  const [inlineDivForm, setInlineDivForm] = useState({ name: "", age_range: "", sort_order: "0" });

  useEffect(() => {
    if (!router.isReady || !leagueId) return;
    fetch(`/api/leagues/${leagueId}`)
      .then((r) => r.json())
      .then((d) => {
        setLeague(d);
        setDivisions(d.divisions ?? []);
        setSeasonGroups(d.season_groups ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [router.isReady, leagueId]);

  // ── Division CRUD ──
  const createDivision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!divForm.name.trim()) return;
    setDivSaving(true);
    setDivError(null);
    try {
      const res = await fetch(`/api/leagues/${leagueId}/divisions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: divForm.name, age_range: divForm.age_range || null, sort_order: Number(divForm.sort_order) || 0 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to create");
      setDivisions((prev) => [...prev, { ...json, season_count: 0 }].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)));
      setDivForm({ name: "", age_range: "", sort_order: "0" });
      setShowCreateDiv(false);
    } catch (e: any) {
      setDivError(e.message);
    } finally {
      setDivSaving(false);
    }
  };

  const startEditDiv = (div: Division) => {
    setEditingDivId(div.id);
    setEditDivForm({ name: div.name, age_range: div.age_range ?? "", sort_order: String(div.sort_order) });
    setEditDivError(null);
    setConfirmDeleteDiv(null);
  };

  const handleEditDivSave = async (id: number) => {
    if (!editDivForm.name.trim()) return;
    setEditDivSaving(true);
    setEditDivError(null);
    try {
      const res = await fetch(`/api/leagues/${leagueId}/divisions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editDivForm.name.trim(),
          age_range: editDivForm.age_range.trim() || null,
          sort_order: Number(editDivForm.sort_order) || 0,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to save");
      setDivisions((prev) =>
        prev
          .map((d) => (d.id === id ? { ...d, name: json.name, age_range: json.age_range, sort_order: json.sort_order } : d))
          .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
      );
      setEditingDivId(null);
    } catch (e: any) {
      setEditDivError(e.message);
    } finally {
      setEditDivSaving(false);
    }
  };

  const deleteDivision = async (id: number) => {
    setDeletingDiv(true);
    try {
      const res = await fetch(`/api/leagues/${leagueId}/divisions/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Failed to delete");
      }
      setDivisions((prev) => prev.filter((d) => d.id !== id));
      setConfirmDeleteDiv(null);
    } catch (e: any) {
      setDivError(e.message);
    } finally {
      setDeletingDiv(false);
    }
  };

  // ── Create season group ──
  const toggleDivisionSelection = (divId: number) => {
    setSeasonForm((prev) => ({
      ...prev,
      divisionIds: prev.divisionIds.includes(divId)
        ? prev.divisionIds.filter((id) => id !== divId)
        : [...prev.divisionIds, divId],
    }));
  };

  const addInlineDiv = () => {
    if (!inlineDivForm.name.trim()) return;
    setInlineDivs((prev) => [...prev, { ...inlineDivForm }]);
    setInlineDivForm({ name: "", age_range: "", sort_order: String(inlineDivs.length + 1) });
    setShowInlineDivForm(false);
  };

  const removeInlineDiv = (idx: number) => {
    setInlineDivs((prev) => prev.filter((_, i) => i !== idx));
  };

  const createSeasonGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    // Must have either existing divisions selected or inline divisions queued
    if (seasonForm.divisionIds.length === 0 && inlineDivs.length === 0) {
      setSeasonError("Add at least one division");
      return;
    }
    setSeasonSaving(true);
    setSeasonError(null);
    try {
      // Step 1: Create any inline divisions first
      const newDivIds: number[] = [];
      for (const div of inlineDivs) {
        const res = await fetch(`/api/leagues/${leagueId}/divisions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: div.name, age_range: div.age_range || null, sort_order: Number(div.sort_order) || 0 }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to create division");
        newDivIds.push(json.id);
        setDivisions((prev) => [...prev, { ...json, season_count: 0 }].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)));
      }

      // Step 2: Create one season per selected/new division
      const allDivIds = [...seasonForm.divisionIds, ...newDivIds];
      const name = `${seasonForm.year} ${capitalize(seasonForm.season_type)} Season`;
      for (const divId of allDivIds) {
        const res = await fetch("/api/seasons", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            league_division_id: divId,
            name,
            year: Number(seasonForm.year),
            season_type: seasonForm.season_type,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to create season");
      }
      // Navigate to the new season group
      router.push(`/leagues/${leagueId}/seasons/${seasonForm.year}-${seasonForm.season_type}`);
    } catch (e: any) {
      setSeasonError(e.message);
    } finally {
      setSeasonSaving(false);
    }
  };

  // Helper: dominant status for a season group
  const dominantStatus = (statuses: string[]) => {
    for (const s of ["active", "playoffs", "draft", "completed", "archived"]) {
      if (statuses.includes(s)) return s;
    }
    return "draft";
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      {/* Top bar */}
      <div className="border-b border-border bg-card">
        <div className="mx-auto max-w-7xl px-4 md:px-6 h-10 flex items-center">
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
                <div className="mt-1.5">
                  <FollowButton entityType="league" entityId={leagueId} />
                </div>
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
                {league.governing_body_name && <span>{league.governing_body_name}</span>}
                {[league.city, league.state].filter(Boolean).join(", ") && (
                  <span>{[league.city, league.state].filter(Boolean).join(", ")}</span>
                )}
                {league.sport && <span>{league.sport}</span>}
              </div>
            </div>

            {/* ════ Seasons (primary) ════ */}
            <div className="flex items-center justify-between mb-4">
              <h2
                className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground"
                style={{ fontFamily: "var(--font-body)" }}
              >
                Seasons
              </h2>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateSeason((s) => !s);
                    if (!showCreateSeason && divisions.length === 0) {
                      setInlineDivs([]);
                      setShowInlineDivForm(true);
                    }
                  }}
                  className={`${BTN_BASE} bg-primary text-primary-foreground border-primary hover:opacity-90`}
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  <Plus className="h-3 w-3" />
                  New Season
                </button>
              )}
            </div>

            {showCreateSeason && (
              <form onSubmit={createSeasonGroup} className="mb-4 p-4 border border-border bg-card space-y-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
                    New Season
                  </span>
                  <button type="button" onClick={() => { setShowCreateSeason(false); setInlineDivs([]); setShowInlineDivForm(false); }}>
                    <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                  </button>
                </div>
                {seasonError && <p className="text-xs text-destructive" style={{ fontFamily: "var(--font-body)" }}>{seasonError}</p>}
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>Year *</label>
                    <input
                      className={INPUT}
                      type="number"
                      placeholder="Year"
                      value={seasonForm.year}
                      onChange={(e) => setSeasonForm((p) => ({ ...p, year: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>Season Type *</label>
                    <select
                      className={INPUT}
                      value={seasonForm.season_type}
                      onChange={(e) => setSeasonForm((p) => ({ ...p, season_type: e.target.value }))}
                    >
                      {SEASON_TYPES.map((t) => (
                        <option key={t} value={t}>{capitalize(t)}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Divisions section */}
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>Divisions *</label>

                  {/* Existing divisions (toggle to select) */}
                  {divisions.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-1">
                      {divisions.map((div) => {
                        const selected = seasonForm.divisionIds.includes(div.id);
                        return (
                          <button
                            key={div.id}
                            type="button"
                            onClick={() => toggleDivisionSelection(div.id)}
                            className={`px-3 py-1.5 text-xs border transition-colors ${
                              selected
                                ? "border-primary bg-primary/10 text-foreground"
                                : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                            }`}
                            style={{ fontFamily: "var(--font-body)" }}
                          >
                            {div.name}
                            {div.age_range ? ` (${div.age_range})` : ""}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Inline new divisions queued for creation */}
                  {inlineDivs.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-1">
                      {inlineDivs.map((d, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-primary bg-primary/10 text-foreground"
                          style={{ fontFamily: "var(--font-body)" }}
                        >
                          {d.name}{d.age_range ? ` (${d.age_range})` : ""}
                          <button type="button" onClick={() => removeInlineDiv(idx)} className="text-muted-foreground hover:text-foreground">
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Inline division creation mini-form */}
                  {showInlineDivForm ? (
                    <div className="p-3 border border-border bg-elevated space-y-2">
                      <div className="grid grid-cols-3 gap-2">
                        <input className={INPUT} placeholder="Division name *" value={inlineDivForm.name} onChange={(e) => setInlineDivForm((p) => ({ ...p, name: e.target.value }))} autoFocus />
                        <input className={INPUT} placeholder="Age range (e.g. 9-10)" value={inlineDivForm.age_range} onChange={(e) => setInlineDivForm((p) => ({ ...p, age_range: e.target.value }))} />
                        <input className={INPUT} type="number" placeholder="Sort order" value={inlineDivForm.sort_order} onChange={(e) => setInlineDivForm((p) => ({ ...p, sort_order: e.target.value }))} />
                      </div>
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setShowInlineDivForm(false)} className={`${BTN_BASE} border-border text-muted-foreground hover:text-foreground`} style={{ fontFamily: "var(--font-body)" }}>
                          Cancel
                        </button>
                        <button type="button" onClick={addInlineDiv} disabled={!inlineDivForm.name.trim()} className={`${BTN_BASE} bg-primary text-primary-foreground border-primary hover:opacity-90 disabled:opacity-40`} style={{ fontFamily: "var(--font-body)" }}>
                          Add
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { setShowInlineDivForm(true); setInlineDivForm({ name: "", age_range: "", sort_order: String(divisions.length + inlineDivs.length) }); }}
                      className="self-start flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
                      style={{ fontFamily: "var(--font-body)" }}
                    >
                      <Plus className="h-3 w-3" />
                      Add new division
                    </button>
                  )}
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={seasonSaving || (seasonForm.divisionIds.length === 0 && inlineDivs.length === 0)}
                    className={`${BTN_BASE} bg-primary text-primary-foreground border-primary hover:opacity-90 disabled:opacity-40`}
                    style={{ fontFamily: "var(--font-body)" }}
                  >
                    {seasonSaving ? "Creating…" : "Create Season"}
                  </button>
                </div>
              </form>
            )}

            {seasonGroups.length === 0 && !showCreateSeason ? (
              <div className="py-12 text-center text-muted-foreground" style={{ fontFamily: "var(--font-body)", fontSize: "14px" }}>
                No seasons yet. Create the first season above.
              </div>
            ) : (
              <div className="space-y-2 mb-10">
                {seasonGroups.map((sg) => {
                  const status = dominantStatus(sg.statuses);
                  const sc = STATUS_COLORS[status] ?? STATUS_COLORS.draft;
                  const slug = `${sg.year}-${sg.season_type}`;
                  return (
                    <Link
                      key={slug}
                      href={`/leagues/${leagueId}/seasons/${slug}`}
                      className="flex items-center justify-between px-4 py-3 border border-border bg-card hover:border-primary/40 hover:bg-elevated transition-colors duration-100 group"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className="badge text-[10px]"
                          style={{ background: sc.bg, color: sc.text, borderColor: sc.border }}
                        >
                          {status}
                        </span>
                        <div>
                          <p className="font-semibold text-sm">
                            {sg.year} {capitalize(sg.season_type)}
                          </p>
                          <p className="text-xs text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
                            {sg.division_count} division{sg.division_count !== 1 ? "s" : ""}
                          </p>
                        </div>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                    </Link>
                  );
                })}
              </div>
            )}

            {/* ════ Divisions (collapsible management) ════ */}
            <div className="border-t border-border pt-6">
              <button
                type="button"
                onClick={() => setShowDivisions((s) => !s)}
                className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                style={{ fontFamily: "var(--font-body)" }}
              >
                {showDivisions ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                Manage Divisions
                <span className="text-[11px] font-normal">({divisions.length})</span>
              </button>

              {showDivisions && (
                <div className="mt-4">
                  {canEdit && (
                    <div className="flex justify-end mb-3">
                      <button
                        type="button"
                        onClick={() => setShowCreateDiv((s) => !s)}
                        className={`${BTN_BASE} bg-primary text-primary-foreground border-primary hover:opacity-90`}
                        style={{ fontFamily: "var(--font-body)" }}
                      >
                        <Plus className="h-3 w-3" />
                        Add Division
                      </button>
                    </div>
                  )}

                  {showCreateDiv && (
                    <form onSubmit={createDivision} className="mb-4 p-4 border border-border bg-card space-y-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
                          New Division
                        </span>
                        <button type="button" onClick={() => setShowCreateDiv(false)}>
                          <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                        </button>
                      </div>
                      {divError && <p className="text-xs text-destructive" style={{ fontFamily: "var(--font-body)" }}>{divError}</p>}
                      <div className="grid grid-cols-3 gap-3">
                        <div className="flex flex-col gap-1">
                          <label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>Name *</label>
                          <input className={INPUT} placeholder="e.g. Mustang" value={divForm.name} onChange={(e) => setDivForm((p) => ({ ...p, name: e.target.value }))} required />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>Age Range</label>
                          <input className={INPUT} placeholder="e.g. 9-10" value={divForm.age_range} onChange={(e) => setDivForm((p) => ({ ...p, age_range: e.target.value }))} />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>Sort Order</label>
                          <input className={INPUT} type="number" placeholder="0" value={divForm.sort_order} onChange={(e) => setDivForm((p) => ({ ...p, sort_order: e.target.value }))} />
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <button type="submit" disabled={divSaving} className={`${BTN_BASE} bg-primary text-primary-foreground border-primary hover:opacity-90 disabled:opacity-40`} style={{ fontFamily: "var(--font-body)" }}>
                          {divSaving ? "Creating…" : "Create Division"}
                        </button>
                      </div>
                    </form>
                  )}

                  {divisions.length === 0 ? (
                    <div className="py-8 text-center text-muted-foreground" style={{ fontFamily: "var(--font-body)", fontSize: "14px" }}>
                      No divisions yet. Add the first division above.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {divisions.map((div) => (
                        <div key={div.id} className="border border-border bg-card">
                          {editingDivId === div.id ? (
                            <div className="p-4 space-y-3">
                              {editDivError && <p className="text-xs text-destructive" style={{ fontFamily: "var(--font-body)" }}>{editDivError}</p>}
                              <div className="grid grid-cols-3 gap-3">
                                <div className="flex flex-col gap-1">
                                  <label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>Name *</label>
                                  <input className={INPUT} placeholder="Division name" value={editDivForm.name} onChange={(e) => setEditDivForm((p) => ({ ...p, name: e.target.value }))} autoFocus />
                                </div>
                                <div className="flex flex-col gap-1">
                                  <label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>Age Range</label>
                                  <input className={INPUT} placeholder="e.g. 9-10" value={editDivForm.age_range} onChange={(e) => setEditDivForm((p) => ({ ...p, age_range: e.target.value }))} />
                                </div>
                                <div className="flex flex-col gap-1">
                                  <label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>Sort Order</label>
                                  <input className={INPUT} type="number" placeholder="0" value={editDivForm.sort_order} onChange={(e) => setEditDivForm((p) => ({ ...p, sort_order: e.target.value }))} />
                                </div>
                              </div>
                              <div className="flex justify-end gap-2">
                                <button type="button" onClick={() => setEditingDivId(null)} className={`${BTN_BASE} border-border text-muted-foreground hover:text-foreground`} style={{ fontFamily: "var(--font-body)" }}>
                                  <X className="h-3 w-3" /> Cancel
                                </button>
                                <button type="button" onClick={() => handleEditDivSave(div.id)} disabled={editDivSaving || !editDivForm.name.trim()} className={`${BTN_BASE} bg-primary text-primary-foreground border-primary hover:opacity-90 disabled:opacity-40`} style={{ fontFamily: "var(--font-body)" }}>
                                  {editDivSaving ? "Saving…" : "Save"}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center px-4 py-3">
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-sm">{div.name}</p>
                                <p className="text-xs text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
                                  {div.age_range ? `Ages ${div.age_range}` : ""}
                                  {div.age_range && div.season_count > 0 ? " · " : ""}
                                  {div.season_count > 0 ? `${div.season_count} season${div.season_count !== 1 ? "s" : ""}` : "No seasons yet"}
                                </p>
                              </div>
                              <div className="shrink-0 mr-2">
                                <FollowButton entityType="division" entityId={div.id} />
                              </div>
                              {canEdit && (
                                <div className="flex items-center gap-1 shrink-0">
                                  {confirmDeleteDiv === div.id ? (
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-destructive" style={{ fontFamily: "var(--font-body)" }}>Delete?</span>
                                      <button type="button" onClick={() => deleteDivision(div.id)} disabled={deletingDiv} className={`${BTN_BASE} border-destructive/40 text-destructive hover:bg-destructive/10 disabled:opacity-40`} style={{ fontFamily: "var(--font-body)" }}>
                                        {deletingDiv ? "…" : "Yes"}
                                      </button>
                                      <button type="button" onClick={() => setConfirmDeleteDiv(null)} className={`${BTN_BASE} border-border text-muted-foreground hover:text-foreground`} style={{ fontFamily: "var(--font-body)" }}>
                                        No
                                      </button>
                                    </div>
                                  ) : (
                                    <>
                                      <button type="button" onClick={() => startEditDiv(div)} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors duration-100" title="Edit division">
                                        <Pencil className="h-4 w-4" />
                                      </button>
                                      <button type="button" onClick={() => setConfirmDeleteDiv(div.id)} className="p-1.5 text-muted-foreground hover:text-destructive transition-colors duration-100" title="Delete division">
                                        <Trash2 className="h-4 w-4" />
                                      </button>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Manage Access */}
            {canEdit && (
              <ManageAccessPanel
                scopeType="league"
                scopeId={leagueId}
                divisions={divisions.map((d) => ({ id: d.id, name: d.name }))}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
