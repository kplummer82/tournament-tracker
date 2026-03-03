"use client";

import { useEffect, useState } from "react";
import { Pencil, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";

type GoverningBody = {
  id: number;
  name: string;
  abbreviation: string | null;
  league_count: number;
  created_at: string;
};

const INPUT = "w-full border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors";
const BTN_BASE = "inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors duration-100 border";

export default function AdminGoverningBodiesClient() {
  const [bodies, setBodies] = useState<GoverningBody[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: "", abbreviation: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ name: "", abbreviation: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/governing-bodies")
      .then((r) => r.json())
      .then((d) => setBodies(d.rows ?? []))
      .catch(() => setBodies([]))
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/governing-bodies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name.trim(), abbreviation: form.abbreviation.trim() || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to create");
      setBodies((prev) => [...prev, { ...json, league_count: 0 }].sort((a, b) => a.name.localeCompare(b.name)));
      setForm({ name: "", abbreviation: "" });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/governing-bodies/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Failed to delete");
      }
      setBodies((prev) => prev.filter((b) => b.id !== id));
      setConfirmDelete(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDeleting(false);
    }
  };

  const startEdit = (b: GoverningBody) => {
    setEditingId(b.id);
    setEditForm({ name: b.name, abbreviation: b.abbreviation ?? "" });
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
      const res = await fetch(`/api/governing-bodies/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name.trim(),
          abbreviation: editForm.abbreviation.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to save");
      setBodies((prev) =>
        prev
          .map((b) => (b.id === id ? { ...b, name: json.name, abbreviation: json.abbreviation } : b))
          .sort((a, b) => a.name.localeCompare(b.name))
      );
      setEditingId(null);
    } catch (e: any) {
      setEditError(e.message);
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Create form */}
      <form onSubmit={handleCreate} className="p-4 border border-border bg-card space-y-3">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground block" style={{ fontFamily: "var(--font-body)" }}>
          New Governing Body
        </span>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="grid grid-cols-2 gap-3">
          <input
            className={INPUT}
            placeholder="Name *"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            required
          />
          <input
            className={INPUT}
            placeholder="Abbreviation (e.g. PONY)"
            value={form.abbreviation}
            onChange={(e) => setForm((p) => ({ ...p, abbreviation: e.target.value }))}
          />
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving || !form.name.trim()}
            className={cn(BTN_BASE, "bg-primary text-primary-foreground border-primary hover:opacity-90 disabled:opacity-40")}
            style={{ fontFamily: "var(--font-body)" }}
          >
            {saving ? "Creating…" : "Create"}
          </button>
        </div>
      </form>

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-12 bg-elevated animate-pulse" />
          ))}
        </div>
      ) : bodies.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">No governing bodies yet.</p>
      ) : (
        <div className="border border-border divide-y divide-border">
          {bodies.map((b) => (
            <div key={b.id} className="px-4 py-3 bg-card">
              {editingId === b.id ? (
                /* ── Edit mode ── */
                <div className="space-y-2">
                  {editError && <p className="text-xs text-destructive">{editError}</p>}
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      className={INPUT}
                      placeholder="Name *"
                      value={editForm.name}
                      onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                      autoFocus
                    />
                    <input
                      className={INPUT}
                      placeholder="Abbreviation (e.g. PONY)"
                      value={editForm.abbreviation}
                      onChange={(e) => setEditForm((p) => ({ ...p, abbreviation: e.target.value }))}
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className={cn(BTN_BASE, "border-border text-muted-foreground hover:text-foreground")}
                      style={{ fontFamily: "var(--font-body)" }}
                    >
                      <X className="h-3 w-3" />
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEditSave(b.id)}
                      disabled={editSaving || !editForm.name.trim()}
                      className={cn(BTN_BASE, "bg-primary text-primary-foreground border-primary hover:opacity-90 disabled:opacity-40")}
                      style={{ fontFamily: "var(--font-body)" }}
                    >
                      {editSaving ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
              ) : (
                /* ── Display mode ── */
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-sm">{b.name}</span>
                    {b.abbreviation && (
                      <span className="ml-2 text-[10px] font-bold tracking-widest border border-border px-1.5 py-0.5 text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
                        {b.abbreviation}
                      </span>
                    )}
                    <span className="ml-3 text-xs text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
                      {b.league_count} league{b.league_count !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {confirmDelete === b.id ? (
                      <>
                        <span className="text-xs text-destructive" style={{ fontFamily: "var(--font-body)" }}>Delete?</span>
                        <button
                          type="button"
                          onClick={() => handleDelete(b.id)}
                          disabled={deleting}
                          className={cn(BTN_BASE, "border-destructive/40 text-destructive hover:bg-destructive/10 disabled:opacity-40")}
                          style={{ fontFamily: "var(--font-body)" }}
                        >
                          {deleting ? "Deleting…" : "Confirm"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(null)}
                          className={cn(BTN_BASE, "border-border text-muted-foreground hover:text-foreground")}
                          style={{ fontFamily: "var(--font-body)" }}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => startEdit(b)}
                          className="p-1.5 text-muted-foreground hover:text-foreground transition-colors duration-100"
                          title="Edit governing body"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(b.id)}
                          className="p-1.5 text-muted-foreground hover:text-destructive transition-colors duration-100"
                          title="Delete governing body"
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
      )}
    </div>
  );
}
