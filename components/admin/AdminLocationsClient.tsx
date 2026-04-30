"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { ChevronDown, ChevronRight, MapPin, Pencil, Plus, Trash2, X, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AddressFields } from "./AddressAutofillInput";

const AddressAutofillInput = dynamic(
  () => import("./AddressAutofillInput"),
  { ssr: false }
);

type Field = {
  id: number;
  name: string;
  created_at: string;
};

type Location = {
  id: number;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  latitude: number | null;
  longitude: number | null;
  field_count: number;
  created_at: string;
  fields?: Field[];
  usps_verified?: boolean;
};

const INPUT =
  "w-full border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors";
const BTN_BASE =
  "inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors duration-100 border";

const EMPTY_FORM = { name: "", address: "", city: "", state: "", zip: "" };

export default function AdminLocationsClient() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [streetInput, setStreetInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Expanded location (shows fields)
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [fields, setFields] = useState<Field[]>([]);
  const [fieldsLoading, setFieldsLoading] = useState(false);
  const [newFieldName, setNewFieldName] = useState("");
  const [addingField, setAddingField] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ ...EMPTY_FORM });
  const [editStreetInput, setEditStreetInput] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete state
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDeleteField, setConfirmDeleteField] = useState<number | null>(null);
  const [deletingField, setDeletingField] = useState(false);

  useEffect(() => {
    fetch("/api/locations")
      .then((r) => r.json())
      .then((d) => setLocations(d.locations ?? []))
      .catch(() => setLocations([]))
      .finally(() => setLoading(false));
  }, []);

  // Load fields when expanding a location
  const toggleExpand = async (id: number) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    setFieldsLoading(true);
    setNewFieldName("");
    setConfirmDeleteField(null);
    try {
      const res = await fetch(`/api/locations/${id}`);
      const data = await res.json();
      setFields(data.fields ?? []);
    } catch {
      setFields([]);
    } finally {
      setFieldsLoading(false);
    }
  };

  // Create location
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          address: form.address.trim() || null,
          city: form.city.trim() || null,
          state: form.state.trim() || null,
          zip: form.zip.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to create");
      setLocations((prev) =>
        [...prev, json].sort((a, b) => a.name.localeCompare(b.name))
      );
      setForm({ ...EMPTY_FORM });
      setStreetInput("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  // Edit location
  const startEdit = (loc: Location) => {
    setEditingId(loc.id);
    setEditForm({
      name: loc.name,
      address: loc.address ?? "",
      city: loc.city ?? "",
      state: loc.state ?? "",
      zip: loc.zip ?? "",
    });
    setEditStreetInput(loc.address ?? "");
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
      const res = await fetch(`/api/locations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name.trim(),
          address: editForm.address.trim() || null,
          city: editForm.city.trim() || null,
          state: editForm.state.trim() || null,
          zip: editForm.zip.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to save");
      setLocations((prev) =>
        prev
          .map((l) =>
            l.id === id
              ? {
                  ...l,
                  name: json.name,
                  address: json.address,
                  city: json.city,
                  state: json.state,
                  zip: json.zip,
                  usps_verified: json.usps_verified,
                }
              : l
          )
          .sort((a, b) => a.name.localeCompare(b.name))
      );
      setEditingId(null);
    } catch (e: any) {
      setEditError(e.message);
    } finally {
      setEditSaving(false);
    }
  };

  // Delete location
  const handleDelete = async (id: number) => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/locations/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Failed to delete");
      }
      setLocations((prev) => prev.filter((l) => l.id !== id));
      setConfirmDelete(null);
      if (expandedId === id) setExpandedId(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDeleting(false);
    }
  };

  // Add field
  const handleAddField = async (locationId: number) => {
    if (!newFieldName.trim()) return;
    setAddingField(true);
    try {
      const res = await fetch(`/api/locations/${locationId}/fields`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newFieldName.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to add field");
      setFields((prev) =>
        [...prev, json].sort((a, b) => a.name.localeCompare(b.name))
      );
      setLocations((prev) =>
        prev.map((l) =>
          l.id === locationId ? { ...l, field_count: l.field_count + 1 } : l
        )
      );
      setNewFieldName("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAddingField(false);
    }
  };

  // Delete field
  const handleDeleteField = async (locationId: number, fieldId: number) => {
    setDeletingField(true);
    try {
      const res = await fetch(
        `/api/locations/${locationId}/fields?fieldId=${fieldId}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Failed to delete field");
      }
      setFields((prev) => prev.filter((f) => f.id !== fieldId));
      setLocations((prev) =>
        prev.map((l) =>
          l.id === locationId
            ? { ...l, field_count: Math.max(0, l.field_count - 1) }
            : l
        )
      );
      setConfirmDeleteField(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDeletingField(false);
    }
  };

  const formatAddress = (loc: Location) => {
    const parts = [loc.address, loc.city, loc.state].filter(Boolean);
    if (loc.zip) {
      if (loc.state) {
        parts[parts.length - 1] += ` ${loc.zip}`;
      } else {
        parts.push(loc.zip);
      }
    }
    return parts.join(", ");
  };

  return (
    <div className="space-y-6">
      {/* Create form */}
      <form onSubmit={handleCreate} className="p-4 border border-border bg-card space-y-3">
        <span
          className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground block"
          style={{ fontFamily: "var(--font-body)" }}
        >
          New Location
        </span>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <input
          className={INPUT}
          placeholder="Location Name *"
          value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          required
        />
        <AddressAutofillInput
          value={form}
          onAddressChange={(fields: AddressFields) =>
            setForm((p) => ({ ...p, ...fields }))
          }
          streetInputValue={streetInput}
          onStreetInputChange={setStreetInput}
        />
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving || !form.name.trim()}
            className={cn(
              BTN_BASE,
              "bg-primary text-primary-foreground border-primary hover:opacity-90 disabled:opacity-40"
            )}
            style={{ fontFamily: "var(--font-body)" }}
          >
            {saving ? "Creating\u2026" : "Create Location"}
          </button>
        </div>
      </form>

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 bg-elevated animate-pulse" />
          ))}
        </div>
      ) : locations.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">No locations yet.</p>
      ) : (
        <div className="border border-border divide-y divide-border">
          {locations.map((loc) => (
            <div key={loc.id} className="bg-card">
              {editingId === loc.id ? (
                /* ── Edit mode ── */
                <div className="px-4 py-3 space-y-3">
                  {editError && <p className="text-xs text-destructive">{editError}</p>}
                  <input
                    className={INPUT}
                    placeholder="Location Name *"
                    value={editForm.name}
                    onChange={(e) =>
                      setEditForm((p) => ({ ...p, name: e.target.value }))
                    }
                    autoFocus
                  />
                  <AddressAutofillInput
                    value={editForm}
                    onAddressChange={(fields: AddressFields) =>
                      setEditForm((p) => ({ ...p, ...fields }))
                    }
                    streetInputValue={editStreetInput}
                    onStreetInputChange={setEditStreetInput}
                  />
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
                      onClick={() => handleEditSave(loc.id)}
                      disabled={editSaving || !editForm.name.trim()}
                      className={cn(
                        BTN_BASE,
                        "bg-primary text-primary-foreground border-primary hover:opacity-90 disabled:opacity-40"
                      )}
                      style={{ fontFamily: "var(--font-body)" }}
                    >
                      {editSaving ? "Saving\u2026" : "Save"}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* ── Display mode ── */}
                  <div className="px-4 py-3 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => toggleExpand(loc.id)}
                      className="flex items-center gap-2 text-left min-w-0 flex-1"
                    >
                      {expandedId === loc.id ? (
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm">{loc.name}</span>
                          {loc.usps_verified && (
                            <span
                              className="inline-flex items-center gap-0.5 text-[10px] font-bold tracking-widest border border-green-600/30 bg-green-600/10 text-green-600 px-1.5 py-0.5"
                              style={{ fontFamily: "var(--font-body)" }}
                              title="Address verified by USPS"
                            >
                              <CheckCircle2 className="h-3 w-3" />
                              USPS
                            </span>
                          )}
                          <span
                            className="text-xs text-muted-foreground"
                            style={{ fontFamily: "var(--font-body)" }}
                          >
                            {loc.field_count} field{loc.field_count !== 1 ? "s" : ""}
                          </span>
                        </div>
                        {(loc.address || loc.city) && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span className="truncate">{formatAddress(loc)}</span>
                          </div>
                        )}
                      </div>
                    </button>
                    <div className="flex items-center gap-2 shrink-0">
                      {confirmDelete === loc.id ? (
                        <>
                          <span
                            className="text-xs text-destructive"
                            style={{ fontFamily: "var(--font-body)" }}
                          >
                            Delete?
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDelete(loc.id)}
                            disabled={deleting}
                            className={cn(
                              BTN_BASE,
                              "border-destructive/40 text-destructive hover:bg-destructive/10 disabled:opacity-40"
                            )}
                            style={{ fontFamily: "var(--font-body)" }}
                          >
                            {deleting ? "Deleting\u2026" : "Confirm"}
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
                            onClick={() => startEdit(loc)}
                            className="p-1.5 text-muted-foreground hover:text-foreground transition-colors duration-100"
                            title="Edit location"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(loc.id)}
                            className="p-1.5 text-muted-foreground hover:text-destructive transition-colors duration-100"
                            title="Delete location"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* ── Expanded fields panel ── */}
                  {expandedId === loc.id && (
                    <div className="px-4 pb-4 pt-1 border-t border-border/50 ml-6">
                      <span
                        className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground block mb-2"
                        style={{ fontFamily: "var(--font-body)" }}
                      >
                        Fields / Courts
                      </span>
                      {fieldsLoading ? (
                        <div className="h-8 bg-elevated animate-pulse" />
                      ) : (
                        <>
                          {fields.length === 0 && (
                            <p className="text-xs text-muted-foreground mb-2">
                              No fields defined yet.
                            </p>
                          )}
                          {fields.length > 0 && (
                            <div className="space-y-1 mb-3">
                              {fields.map((f) => (
                                <div
                                  key={f.id}
                                  className="flex items-center justify-between py-1 px-2 bg-muted/40 text-sm"
                                >
                                  <span>{f.name}</span>
                                  {confirmDeleteField === f.id ? (
                                    <div className="flex items-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleDeleteField(loc.id, f.id)
                                        }
                                        disabled={deletingField}
                                        className={cn(
                                          BTN_BASE,
                                          "border-destructive/40 text-destructive hover:bg-destructive/10 disabled:opacity-40 py-0.5 text-[9px]"
                                        )}
                                        style={{ fontFamily: "var(--font-body)" }}
                                      >
                                        {deletingField ? "\u2026" : "Yes"}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setConfirmDeleteField(null)
                                        }
                                        className={cn(
                                          BTN_BASE,
                                          "border-border text-muted-foreground hover:text-foreground py-0.5 text-[9px]"
                                        )}
                                        style={{ fontFamily: "var(--font-body)" }}
                                      >
                                        No
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setConfirmDeleteField(f.id)
                                      }
                                      className="p-1 text-muted-foreground hover:text-destructive transition-colors duration-100"
                                      title="Remove field"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                          {/* Add field */}
                          <div className="flex items-center gap-2">
                            <input
                              className={cn(INPUT, "flex-1 py-1.5 text-xs")}
                              placeholder='Add field (e.g. "Field 1", "Diamond A")'
                              value={newFieldName}
                              onChange={(e) => setNewFieldName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  handleAddField(loc.id);
                                }
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => handleAddField(loc.id)}
                              disabled={addingField || !newFieldName.trim()}
                              className={cn(
                                BTN_BASE,
                                "bg-primary text-primary-foreground border-primary hover:opacity-90 disabled:opacity-40 py-1"
                              )}
                              style={{ fontFamily: "var(--font-body)" }}
                            >
                              <Plus className="h-3 w-3" />
                              {addingField ? "Adding\u2026" : "Add"}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
