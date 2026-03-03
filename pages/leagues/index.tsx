import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import { ArrowRight, Pencil, Plus, Trash2, X } from "lucide-react";

const US_STATES = [
  { abbr: "AL", name: "Alabama" }, { abbr: "AK", name: "Alaska" }, { abbr: "AZ", name: "Arizona" },
  { abbr: "AR", name: "Arkansas" }, { abbr: "CA", name: "California" }, { abbr: "CO", name: "Colorado" },
  { abbr: "CT", name: "Connecticut" }, { abbr: "DE", name: "Delaware" }, { abbr: "FL", name: "Florida" },
  { abbr: "GA", name: "Georgia" }, { abbr: "HI", name: "Hawaii" }, { abbr: "ID", name: "Idaho" },
  { abbr: "IL", name: "Illinois" }, { abbr: "IN", name: "Indiana" }, { abbr: "IA", name: "Iowa" },
  { abbr: "KS", name: "Kansas" }, { abbr: "KY", name: "Kentucky" }, { abbr: "LA", name: "Louisiana" },
  { abbr: "ME", name: "Maine" }, { abbr: "MD", name: "Maryland" }, { abbr: "MA", name: "Massachusetts" },
  { abbr: "MI", name: "Michigan" }, { abbr: "MN", name: "Minnesota" }, { abbr: "MS", name: "Mississippi" },
  { abbr: "MO", name: "Missouri" }, { abbr: "MT", name: "Montana" }, { abbr: "NE", name: "Nebraska" },
  { abbr: "NV", name: "Nevada" }, { abbr: "NH", name: "New Hampshire" }, { abbr: "NJ", name: "New Jersey" },
  { abbr: "NM", name: "New Mexico" }, { abbr: "NY", name: "New York" }, { abbr: "NC", name: "North Carolina" },
  { abbr: "ND", name: "North Dakota" }, { abbr: "OH", name: "Ohio" }, { abbr: "OK", name: "Oklahoma" },
  { abbr: "OR", name: "Oregon" }, { abbr: "PA", name: "Pennsylvania" }, { abbr: "RI", name: "Rhode Island" },
  { abbr: "SC", name: "South Carolina" }, { abbr: "SD", name: "South Dakota" }, { abbr: "TN", name: "Tennessee" },
  { abbr: "TX", name: "Texas" }, { abbr: "UT", name: "Utah" }, { abbr: "VT", name: "Vermont" },
  { abbr: "VA", name: "Virginia" }, { abbr: "WA", name: "Washington" }, { abbr: "WV", name: "West Virginia" },
  { abbr: "WI", name: "Wisconsin" }, { abbr: "WY", name: "Wyoming" },
];

function StateCombobox({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = value.trim()
    ? US_STATES.filter(
        (s) =>
          s.abbr.toLowerCase().startsWith(value.toLowerCase()) ||
          s.name.toLowerCase().includes(value.toLowerCase())
      )
    : US_STATES;

  const pick = (abbr: string) => {
    onChange(abbr);
    setOpen(false);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={containerRef}>
      <input
        className={className}
        placeholder="State"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 left-0 right-0 top-full mt-0.5 bg-card border border-border shadow-lg max-h-48 overflow-y-auto">
          {filtered.map((s) => (
            <button
              key={s.abbr}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); pick(s.abbr); }}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-elevated transition-colors duration-75 flex items-baseline gap-2"
            >
              <span className="font-semibold text-xs w-7 shrink-0" style={{ fontFamily: "var(--font-body)" }}>{s.abbr}</span>
              <span className="text-muted-foreground text-xs">{s.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type League = {
  id: number;
  name: string;
  abbreviation: string | null;
  city: string | null;
  state: string | null;
  governing_body_id: number | null;
  governing_body_name: string | null;
  sport: string | null;
  division_count: number;
};

type GovBody = { id: number; name: string; abbreviation: string | null };

const INPUT = "w-full border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors";
const BTN_BASE = "inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors duration-100 border";

type EditForm = { name: string; abbreviation: string; city: string; state: string; governing_body_id: string };

export default function LeaguesPage() {
  const [leagues, setLeagues] = useState<League[]>([]);
  const [loading, setLoading] = useState(true);
  const [govBodies, setGovBodies] = useState<GovBody[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", abbreviation: "", city: "", state: "", governing_body_id: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ name: "", abbreviation: "", city: "", state: "", governing_body_id: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/leagues").then((r) => r.json()),
      fetch("/api/governing-bodies").then((r) => r.json()),
    ]).then(([leaguesData, gbData]) => {
      setLeagues(leaguesData.rows ?? []);
      setGovBodies(gbData.rows ?? []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const createLeague = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        abbreviation: form.abbreviation.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim() || null,
        governing_body_id: form.governing_body_id ? Number(form.governing_body_id) : null,
      };
      const res = await fetch("/api/leagues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to create");
      const gb = govBodies.find((g) => g.id === body.governing_body_id);
      setLeagues((prev) => [{ ...json, governing_body_name: gb?.name ?? null, division_count: 0 }, ...prev]);
      setForm({ name: "", abbreviation: "", city: "", state: "", governing_body_id: "" });
      setShowCreate(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteLeague = async (id: number) => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/leagues/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Failed to delete");
      }
      setLeagues((prev) => prev.filter((l) => l.id !== id));
      setConfirmDelete(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDeleting(false);
    }
  };

  const startEdit = (league: League) => {
    setEditingId(league.id);
    setEditForm({
      name: league.name,
      abbreviation: league.abbreviation ?? "",
      city: league.city ?? "",
      state: league.state ?? "",
      governing_body_id: league.governing_body_id ? String(league.governing_body_id) : "",
    });
    setEditError(null);
    setConfirmDelete(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditError(null);
  };

  const handleEditSave = async (id: number) => {
    if (!editForm.name.trim()) return;
    setEditSaving(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/leagues/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name.trim(),
          abbreviation: editForm.abbreviation.trim() || null,
          city: editForm.city.trim() || null,
          state: editForm.state.trim() || null,
          governing_body_id: editForm.governing_body_id ? Number(editForm.governing_body_id) : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to save");
      const newGb = govBodies.find((g) => g.id === json.governing_body_id) ?? null;
      setLeagues((prev) =>
        prev.map((l) =>
          l.id === id
            ? {
                ...l,
                name: json.name,
                abbreviation: json.abbreviation,
                city: json.city,
                state: json.state,
                governing_body_id: json.governing_body_id,
                governing_body_name: newGb?.name ?? null,
              }
            : l
        )
      );
      setEditingId(null);
    } catch (e: any) {
      setEditError(e.message);
    } finally {
      setEditSaving(false);
    }
  };

  // Group leagues by governing body
  const grouped = leagues.reduce<Record<string, { label: string | null; items: League[] }>>((acc, l) => {
    const key = l.governing_body_name ?? "__none__";
    if (!acc[key]) acc[key] = { label: l.governing_body_name, items: [] };
    acc[key].items.push(l);
    return acc;
  }, {});

  const groups = Object.entries(grouped).sort(([a], [b]) => {
    if (a === "__none__") return 1;
    if (b === "__none__") return -1;
    return a.localeCompare(b);
  });

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <div className="mx-auto max-w-7xl w-full px-6 py-8 flex-1">
        <div className="flex items-center justify-between mb-6">
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              fontSize: "28px",
              letterSpacing: "-0.02em",
              textTransform: "uppercase",
            }}
          >
            Leagues
          </h1>
          <button
            type="button"
            onClick={() => setShowCreate((s) => !s)}
            className={`${BTN_BASE} bg-primary text-primary-foreground border-primary hover:opacity-90`}
            style={{ fontFamily: "var(--font-body)" }}
          >
            <Plus className="h-3 w-3" />
            New League
          </button>
        </div>

        {showCreate && (
          <form
            onSubmit={createLeague}
            className="mb-6 p-4 border border-border bg-card space-y-3"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
                New League
              </span>
              <button type="button" onClick={() => setShowCreate(false)}>
                <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
              </button>
            </div>
            {error && <p className="text-xs text-destructive" style={{ fontFamily: "var(--font-body)" }}>{error}</p>}
            <div className="grid grid-cols-2 gap-3">
              <input className={INPUT} placeholder="League name *" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
              <input className={INPUT} placeholder="Abbreviation (e.g. SMYB)" value={form.abbreviation} onChange={(e) => setForm((p) => ({ ...p, abbreviation: e.target.value }))} />
              <input className={INPUT} placeholder="City" value={form.city} onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))} />
              <StateCombobox className={INPUT} value={form.state} onChange={(v) => setForm((p) => ({ ...p, state: v }))} />
              <select
                className={INPUT}
                value={form.governing_body_id}
                onChange={(e) => setForm((p) => ({ ...p, governing_body_id: e.target.value }))}
              >
                <option value="">Governing body (optional)</option>
                {govBodies.map((g) => (
                  <option key={g.id} value={String(g.id)}>
                    {g.abbreviation ? `${g.abbreviation} – ${g.name}` : g.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end">
              <button type="submit" disabled={saving} className={`${BTN_BASE} bg-primary text-primary-foreground border-primary hover:opacity-90 disabled:opacity-40`} style={{ fontFamily: "var(--font-body)" }}>
                {saving ? "Creating…" : "Create League"}
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 bg-elevated animate-pulse" />
            ))}
          </div>
        ) : leagues.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground" style={{ fontFamily: "var(--font-body)", fontSize: "14px" }}>
            No leagues yet. Create your first league above.
          </div>
        ) : (
          <div className="space-y-8">
            {groups.map(([key, group]) => (
              <section key={key}>
                <div className="pb-2 mb-3 border-b border-border">
                  <span
                    className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground"
                    style={{ fontFamily: "var(--font-body)" }}
                  >
                    {group.label ?? "Independent"}
                  </span>
                </div>
                <div className="space-y-2">
                  {group.items.map((league) => (
                    <div key={league.id} className="border border-border bg-card">
                      {editingId === league.id ? (
                        /* ── Edit mode ── */
                        <div className="p-4 space-y-3">
                          {editError && <p className="text-xs text-destructive" style={{ fontFamily: "var(--font-body)" }}>{editError}</p>}
                          <div className="grid grid-cols-2 gap-3">
                            <input
                              className={INPUT}
                              placeholder="League name *"
                              value={editForm.name}
                              onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                              autoFocus
                            />
                            <input
                              className={INPUT}
                              placeholder="Abbreviation (e.g. SMYB)"
                              value={editForm.abbreviation}
                              onChange={(e) => setEditForm((p) => ({ ...p, abbreviation: e.target.value }))}
                            />
                            <input
                              className={INPUT}
                              placeholder="City"
                              value={editForm.city}
                              onChange={(e) => setEditForm((p) => ({ ...p, city: e.target.value }))}
                            />
                            <StateCombobox
                              className={INPUT}
                              value={editForm.state}
                              onChange={(v) => setEditForm((p) => ({ ...p, state: v }))}
                            />
                            <select
                              className={INPUT}
                              value={editForm.governing_body_id}
                              onChange={(e) => setEditForm((p) => ({ ...p, governing_body_id: e.target.value }))}
                            >
                              <option value="">Governing body (optional)</option>
                              {govBodies.map((g) => (
                                <option key={g.id} value={String(g.id)}>
                                  {g.abbreviation ? `${g.abbreviation} – ${g.name}` : g.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={cancelEdit}
                              className={`${BTN_BASE} border-border text-muted-foreground hover:text-foreground`}
                              style={{ fontFamily: "var(--font-body)" }}
                            >
                              <X className="h-3 w-3" />
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => handleEditSave(league.id)}
                              disabled={editSaving || !editForm.name.trim()}
                              className={`${BTN_BASE} bg-primary text-primary-foreground border-primary hover:opacity-90 disabled:opacity-40`}
                              style={{ fontFamily: "var(--font-body)" }}
                            >
                              {editSaving ? "Saving…" : "Save"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* ── Display mode ── */
                        <div className="flex items-center hover:border-primary/40 hover:bg-elevated transition-colors duration-100 group">
                          <Link
                            href={`/leagues/${league.id}`}
                            className="flex flex-1 items-center justify-between px-4 py-3 min-w-0"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              {league.abbreviation && (
                                <span
                                  className="text-[10px] font-bold tracking-widest px-2 py-0.5 border border-border text-muted-foreground shrink-0"
                                  style={{ fontFamily: "var(--font-body)" }}
                                >
                                  {league.abbreviation}
                                </span>
                              )}
                              <div className="min-w-0">
                                <p className="font-semibold text-sm">{league.name}</p>
                                <p className="text-xs text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
                                  {[league.city, league.state].filter(Boolean).join(", ")}
                                  {league.sport ? ` · ${league.sport}` : ""}
                                  {league.division_count > 0 ? ` · ${league.division_count} division${league.division_count !== 1 ? "s" : ""}` : ""}
                                </p>
                              </div>
                            </div>
                            <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0 ml-3" />
                          </Link>
                          <div className="flex items-center gap-1 pr-3 shrink-0">
                            {confirmDelete === league.id ? (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-destructive" style={{ fontFamily: "var(--font-body)" }}>Delete?</span>
                                <button
                                  type="button"
                                  onClick={() => deleteLeague(league.id)}
                                  disabled={deleting}
                                  className={`${BTN_BASE} border-destructive/40 text-destructive hover:bg-destructive/10 disabled:opacity-40`}
                                  style={{ fontFamily: "var(--font-body)" }}
                                >
                                  {deleting ? "…" : "Yes"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDelete(null)}
                                  className={`${BTN_BASE} border-border text-muted-foreground hover:text-foreground`}
                                  style={{ fontFamily: "var(--font-body)" }}
                                >
                                  No
                                </button>
                              </div>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => startEdit(league)}
                                  className="p-1.5 text-muted-foreground hover:text-foreground transition-colors duration-100"
                                  title="Edit league"
                                >
                                  <Pencil className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDelete(league.id)}
                                  className="p-1.5 text-muted-foreground hover:text-destructive transition-colors duration-100"
                                  title="Delete league"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
