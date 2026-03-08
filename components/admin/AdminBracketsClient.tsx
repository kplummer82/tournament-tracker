"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import BracketPreview from "@/components/bracket/BracketPreview";
import { singleEliminationPreset } from "@/components/bracket/types";
import type { BracketStructure } from "@/components/bracket/types";
import { getBracketTypeLabel } from "@/lib/bracket-types";
import { Plus, Pencil, Trash2, LayoutTemplate } from "lucide-react";

type BracketTemplateRow = {
  id: number;
  name: string;
  description: string | null;
  structure: Record<string, unknown>;
  is_library: boolean;
  created_at: string | null;
  created_by: number | null;
  bracket_type: string | null;
  seed_count: number | null;
};

const PRESET_TEAMS = [4, 8, 16] as const;

export default function AdminBracketsClient() {
  const [templates, setTemplates] = useState<BracketTemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createPreset, setCreatePreset] = useState("8");
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [editStructureTemplate, setEditStructureTemplate] = useState<BracketTemplateRow | null>(null);
  const [editingStructure, setEditingStructure] = useState<BracketStructure | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/bracket-templates?library=1", { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setTemplates(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load system brackets");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const name = createName.trim();
    const description = createDescription.trim() || null;
    const presetTeams = parseInt(createPreset, 10);
    if (!name || !Number.isFinite(presetTeams)) return;
    let structure: BracketStructure;
    try {
      structure = singleEliminationPreset(presetTeams);
    } catch {
      setError("Invalid preset");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/bracket-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name,
          description,
          structure,
          is_library: true,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setCreateOpen(false);
      setCreateName("");
      setCreateDescription("");
      setCreatePreset("8");
      await fetchTemplates();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async (e: React.FormEvent<HTMLFormElement>, id: number) => {
    e.preventDefault();
    const name = editName.trim();
    const description = editDescription.trim() || null;
    if (!name) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/bracket-templates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name,
          description,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setEditId(null);
      await fetchTemplates();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/bracket-templates/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setDeleteId(null);
      await fetchTemplates();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveStructure = async (id: number) => {
    if (!editingStructure) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/bracket-templates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ structure: editingStructure }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      setEditStructureTemplate(null);
      setEditingStructure(null);
      await fetchTemplates();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save structure");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <p className="text-muted-foreground">Loading system brackets…</p>;
  if (error && templates.length === 0) return <p className="text-destructive">{error}</p>;

  const editingTemplate = editId != null ? templates.find((t) => t.id === editId) : null;

  const openEdit = (t: BracketTemplateRow) => {
    setEditId(t.id);
    setEditName(t.name);
    setEditDescription(t.description ?? "");
  };

  return (
    <div className="space-y-6">
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {templates.length} system bracket{templates.length !== 1 ? "s" : ""} in the library.
        </p>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" />
              Create system bracket
            </Button>
          </DialogTrigger>
          <DialogContent size="md">
            <DialogHeader>
              <DialogTitle>Create system bracket</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <Label htmlFor="create-name">Name</Label>
                <Input id="create-name" value={createName} onChange={(e) => setCreateName(e.target.value)} required placeholder="e.g. 8-team single elimination" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="create-description">Description (optional)</Label>
                <Input id="create-description" value={createDescription} onChange={(e) => setCreateDescription(e.target.value)} placeholder="Optional description" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="create-preset">Preset (structure)</Label>
                <Select value={createPreset} onValueChange={setCreatePreset}>
                  <SelectTrigger id="create-preset" className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRESET_TEAMS.map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        Single elimination, {n} teams
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">Only single-elimination presets are supported for creation here. Use Bracket Builder to create other structures and save as system bracket.</p>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Creating…" : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {templates.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center">
          No system brackets yet. Create one to show in the library for all users.
        </p>
      ) : (
        <div className="rounded-xl border border-border bg-muted/20 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left p-3 font-medium">Name</th>
                <th className="text-left p-3 font-medium">Type</th>
                <th className="text-left p-3 font-medium">Seeds</th>
                <th className="text-left p-3 font-medium">Description</th>
                <th className="text-right p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id} className="border-b border-border/60 last:border-0">
                  <td className="p-3 font-medium">{t.name}</td>
                  <td className="p-3 text-muted-foreground">{t.bracket_type ? getBracketTypeLabel(t.bracket_type) : "—"}</td>
                  <td className="p-3 text-muted-foreground">{t.seed_count ?? "—"}</td>
                  <td className="p-3 text-muted-foreground max-w-[200px] truncate">{t.description ?? "—"}</td>
                  <td className="p-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="gap-1"
                        onClick={() => openEdit(t)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="gap-1"
                        onClick={() => {
                          setEditStructureTemplate(t);
                          setEditingStructure(t.structure as BracketStructure);
                        }}
                      >
                        <LayoutTemplate className="h-3.5 w-3.5" />
                        Structure
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="gap-1 text-destructive hover:text-destructive"
                        onClick={() => setDeleteId(t.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editingTemplate && (
        <Dialog open={editId !== null} onOpenChange={(open) => !open && setEditId(null)}>
          <DialogContent size="md">
            <DialogHeader>
              <DialogTitle>Edit system bracket</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => handleEdit(e, editingTemplate.id)} className="space-y-3">
              <div>
                <Label htmlFor="edit-name">Name</Label>
                <Input
                  id="edit-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="edit-description">Description (optional)</Label>
                <Input
                  id="edit-description"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="mt-1"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Seed count is derived from the bracket structure and cannot be edited here.
              </p>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditId(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Saving…" : "Save"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {deleteId != null && (
        <Dialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
          <DialogContent size="sm">
            <DialogHeader>
              <DialogTitle>Delete system bracket</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete this system bracket? It will be removed from the library for all users.
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDeleteId(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={submitting}
                onClick={() => handleDelete(deleteId)}
              >
                {submitting ? "Deleting…" : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {editStructureTemplate && (
        <Dialog
          open={editStructureTemplate !== null}
          onOpenChange={(open) => {
            if (!open) {
              setEditStructureTemplate(null);
              setEditingStructure(null);
            }
          }}
        >
          <DialogContent size="xl" className="flex flex-col" style={{ height: "85vh" }}>
            <DialogHeader>
              <DialogTitle>Edit Structure — {editStructureTemplate.name}</DialogTitle>
            </DialogHeader>
            <div className="flex-1 min-h-0 overflow-hidden">
              <BracketPreview
                structure={editingStructure}
                editable
                onStructureChange={setEditingStructure}
              />
            </div>
            <DialogFooter className="shrink-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditStructureTemplate(null);
                  setEditingStructure(null);
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={submitting}
                onClick={() => handleSaveStructure(editStructureTemplate.id)}
              >
                {submitting ? "Saving…" : "Save Structure"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
