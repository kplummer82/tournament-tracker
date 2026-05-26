"use client";

import { useEffect, useState } from "react";
import { Pencil, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Sport = { id: number; name: string };

type Bat = {
  id: number;
  name: string;
  sport_id: number;
  sport_name: string;
};

const INPUT =
  "w-full border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors";
const BTN_BASE =
  "inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors duration-100 border";

function sortBats(list: Bat[]): Bat[] {
  return [...list].sort(
    (a, b) =>
      a.sport_name.localeCompare(b.sport_name) || a.name.localeCompare(b.name)
  );
}

export default function AdminBatsClient() {
  const [bats, setBats] = useState<Bat[]>([]);
  const [sports, setSports] = useState<Sport[]>([]);
  const [loading, setLoading] = useState(true);

  // Create form
  const [form, setForm] = useState<{ name: string; sport_id: string }>({
    name: "",
    sport_id: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Delete state
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; sport_id: string }>({
    name: "",
    sport_id: "",
  });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/bats").then((r) => r.json()),
      fetch("/api/lookups").then((r) => r.json()),
    ])
      .then(([batsRes, lookupsRes]) => {
        setBats(sortBats(batsRes.rows ?? []));
        setSports(lookupsRes?.sports ?? []);
      })
      .catch(() => {
        setBats([]);
        setSports([]);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.sport_id) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/bats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          sport_id: parseInt(form.sport_id, 10),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to create");
      setBats((prev) => sortBats([...prev, json]));
      setForm({ name: "", sport_id: "" });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/bats/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Failed to delete");
      }
      setBats((prev) => prev.filter((b) => b.id !== id));
      setConfirmDelete(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDeleting(false);
    }
  };

  const startEdit = (b: Bat) => {
    setEditingId(b.id);
    setEditForm({ name: b.name, sport_id: String(b.sport_id) });
    setEditError(null);
    setConfirmDelete(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditError(null);
  };

  const handleEditSave = async (id: number) => {
    if (!editForm.name.trim() || !editForm.sport_id) return;
    setEditSaving(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/admin/bats/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name.trim(),
          sport_id: parseInt(editForm.sport_id, 10),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to save");
      setBats((prev) =>
        sortBats(prev.map((b) => (b.id === id ? (json as Bat) : b)))
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
      <form
        onSubmit={handleCreate}
        className="p-4 border border-border bg-card space-y-3"
      >
        <span
          className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground block"
          style={{ fontFamily: "var(--font-body)" }}
        >
          New Bat
        </span>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="grid grid-cols-2 gap-3">
          <input
            className={INPUT}
            placeholder="Name * (e.g. BBCOR)"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            required
          />
          <Select
            value={form.sport_id}
            onValueChange={(v) => setForm((p) => ({ ...p, sport_id: v }))}
          >
            <SelectTrigger className="h-auto py-2 text-sm">
              <SelectValue placeholder="Sport *" />
            </SelectTrigger>
            <SelectContent>
              {sports.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving || !form.name.trim() || !form.sport_id}
            className={cn(
              BTN_BASE,
              "bg-primary text-primary-foreground border-primary hover:opacity-90 disabled:opacity-40"
            )}
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
      ) : bats.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">No bats yet.</p>
      ) : (
        <div className="border border-border divide-y divide-border">
          {bats.map((b) => (
            <div key={b.id} className="px-4 py-3 bg-card">
              {editingId === b.id ? (
                /* ── Edit mode ── */
                <div className="space-y-2">
                  {editError && (
                    <p className="text-xs text-destructive">{editError}</p>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      className={INPUT}
                      placeholder="Name *"
                      value={editForm.name}
                      onChange={(e) =>
                        setEditForm((p) => ({ ...p, name: e.target.value }))
                      }
                      autoFocus
                    />
                    <Select
                      value={editForm.sport_id}
                      onValueChange={(v) =>
                        setEditForm((p) => ({ ...p, sport_id: v }))
                      }
                    >
                      <SelectTrigger className="h-auto py-2 text-sm">
                        <SelectValue placeholder="Sport *" />
                      </SelectTrigger>
                      <SelectContent>
                        {sports.map((s) => (
                          <SelectItem key={s.id} value={String(s.id)}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className={cn(
                        BTN_BASE,
                        "border-border text-muted-foreground hover:text-foreground"
                      )}
                      style={{ fontFamily: "var(--font-body)" }}
                    >
                      <X className="h-3 w-3" />
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEditSave(b.id)}
                      disabled={
                        editSaving ||
                        !editForm.name.trim() ||
                        !editForm.sport_id
                      }
                      className={cn(
                        BTN_BASE,
                        "bg-primary text-primary-foreground border-primary hover:opacity-90 disabled:opacity-40"
                      )}
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
                    <span
                      className="ml-2 text-[10px] font-bold tracking-widest border border-border px-1.5 py-0.5 text-muted-foreground"
                      style={{ fontFamily: "var(--font-body)" }}
                    >
                      {b.sport_name.toUpperCase()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {confirmDelete === b.id ? (
                      <>
                        <span
                          className="text-xs text-destructive"
                          style={{ fontFamily: "var(--font-body)" }}
                        >
                          Delete?
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDelete(b.id)}
                          disabled={deleting}
                          className={cn(
                            BTN_BASE,
                            "border-destructive/40 text-destructive hover:bg-destructive/10 disabled:opacity-40"
                          )}
                          style={{ fontFamily: "var(--font-body)" }}
                        >
                          {deleting ? "Deleting…" : "Confirm"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(null)}
                          className={cn(
                            BTN_BASE,
                            "border-border text-muted-foreground hover:text-foreground"
                          )}
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
                          title="Edit bat"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(b.id)}
                          className="p-1.5 text-muted-foreground hover:text-destructive transition-colors duration-100"
                          title="Delete bat"
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
