import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import Header from "@/components/Header";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { ArrowLeft, ArrowRight, Pencil, Trash2, X } from "lucide-react";
import FollowButton from "@/components/FollowButton";

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

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  draft:     { bg: "#5a5a5a18", text: "#888",     border: "#5a5a5a40" },
  active:    { bg: "#00c85318", text: "#00c853",  border: "#00c85340" },
  playoffs:  { bg: "#ff8c0018", text: "#ff8c00",  border: "#ff8c0040" },
  completed: { bg: "var(--badge-completed-bg)", text: "var(--badge-completed-text)", border: "var(--badge-completed-border)" },
  archived:  { bg: "#3a3a3a18", text: "#5a5a5a",  border: "#3a3a3a40" },
};

const INPUT = "w-full border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors";
const BTN_BASE = "inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors duration-100 border";

export default function DivisionDetailPage() {
  const router = useRouter();
  const leagueId = Number(Array.isArray(router.query.leagueid) ? router.query.leagueid[0] : router.query.leagueid);
  const divId = Number(Array.isArray(router.query.divid) ? router.query.divid[0] : router.query.divid);

  const permissions = usePermissions();
  const canEdit = permissions.canEditDivision(divId, leagueId);

  const [division, setDivision] = useState<Division | null>(null);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loading, setLoading] = useState(true);

  // Division edit state
  const [editingDiv, setEditingDiv] = useState(false);
  const [divForm, setDivForm] = useState({ name: "", age_range: "", sort_order: "0" });
  const [divSaving, setDivSaving] = useState(false);
  const [divError, setDivError] = useState<string | null>(null);
  const [confirmDeleteDiv, setConfirmDeleteDiv] = useState(false);
  const [deletingDiv, setDeletingDiv] = useState(false);

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

  // Division edit handlers
  const startEditDiv = () => {
    if (!division) return;
    setEditingDiv(true);
    setDivForm({ name: division.name, age_range: division.age_range ?? "", sort_order: String(division.sort_order) });
    setDivError(null);
  };

  const handleDivSave = async () => {
    if (!divForm.name.trim()) return;
    setDivSaving(true);
    setDivError(null);
    try {
      const res = await fetch(`/api/leagues/${leagueId}/divisions/${divId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: divForm.name.trim(),
          age_range: divForm.age_range.trim() || null,
          sort_order: Number(divForm.sort_order) || 0,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to save");
      setDivision((prev) => prev ? { ...prev, name: json.name, age_range: json.age_range, sort_order: json.sort_order } : prev);
      setEditingDiv(false);
    } catch (e: any) {
      setDivError(e.message);
    } finally {
      setDivSaving(false);
    }
  };

  const handleDeleteDiv = async () => {
    setDeletingDiv(true);
    try {
      const res = await fetch(`/api/leagues/${leagueId}/divisions/${divId}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Failed to delete");
      }
      router.push(`/leagues/${leagueId}`);
    } catch (e: any) {
      setDivError(e.message);
      setDeletingDiv(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      {/* Top bar */}
      <div className="border-b border-border bg-card">
        <div className="mx-auto max-w-7xl px-4 md:px-6 h-10 flex items-center gap-4">
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
              {editingDiv ? (
                <div className="p-4 border border-border bg-card space-y-3 max-w-xl">
                  {divError && <p className="text-xs text-destructive" style={{ fontFamily: "var(--font-body)" }}>{divError}</p>}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>Name *</label>
                      <input className={INPUT} placeholder="Division name" value={divForm.name} onChange={(e) => setDivForm((p) => ({ ...p, name: e.target.value }))} autoFocus />
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
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setEditingDiv(false)} className={`${BTN_BASE} border-border text-muted-foreground hover:text-foreground`} style={{ fontFamily: "var(--font-body)" }}>
                      <X className="h-3 w-3" /> Cancel
                    </button>
                    <button type="button" onClick={handleDivSave} disabled={divSaving || !divForm.name.trim()} className={`${BTN_BASE} bg-primary text-primary-foreground border-primary hover:opacity-90 disabled:opacity-40`} style={{ fontFamily: "var(--font-body)" }}>
                      {divSaving ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between">
                  <div>
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
                  <div className="flex items-center gap-2">
                    <FollowButton entityType="division" entityId={divId} />
                    {canEdit && (
                      <div className="flex items-center gap-1">
                        {confirmDeleteDiv ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-destructive" style={{ fontFamily: "var(--font-body)" }}>Delete division?</span>
                          <button type="button" onClick={handleDeleteDiv} disabled={deletingDiv} className={`${BTN_BASE} border-destructive/40 text-destructive hover:bg-destructive/10 disabled:opacity-40`} style={{ fontFamily: "var(--font-body)" }}>
                            {deletingDiv ? "…" : "Yes"}
                          </button>
                          <button type="button" onClick={() => setConfirmDeleteDiv(false)} className={`${BTN_BASE} border-border text-muted-foreground hover:text-foreground`} style={{ fontFamily: "var(--font-body)" }}>
                            No
                          </button>
                        </div>
                      ) : (
                        <>
                          <button type="button" onClick={startEditDiv} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors duration-100" title="Edit division">
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button type="button" onClick={() => setConfirmDeleteDiv(true)} className="p-1.5 text-muted-foreground hover:text-destructive transition-colors duration-100" title="Delete division">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Seasons (read-only reference) */}
            <div className="mb-4">
              <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
                Seasons
              </h2>
            </div>

            {seasons.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground" style={{ fontFamily: "var(--font-body)", fontSize: "14px" }}>
                No seasons use this division yet.
              </div>
            ) : (
              <div className="space-y-2">
                {seasons.map((s) => {
                  const sc = STATUS_COLORS[s.status] ?? STATUS_COLORS.draft;
                  return (
                    <Link
                      key={s.id}
                      href={`/seasons/${s.id}/overview`}
                      className="flex items-center justify-between px-4 py-3 border border-border bg-card hover:border-primary/40 hover:bg-elevated transition-colors duration-100 group"
                    >
                      <div className="flex items-center gap-3">
                        <span className="badge text-[10px]" style={{ background: sc.bg, color: sc.text, borderColor: sc.border }}>
                          {s.status}
                        </span>
                        <div>
                          <p className="font-semibold text-sm">{s.name}</p>
                          <p className="text-xs text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
                            {s.team_count} team{s.team_count !== 1 ? "s" : ""}
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
