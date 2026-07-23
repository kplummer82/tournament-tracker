"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Loader2, MapPin, Plus, RotateCcw, Trash2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import AddressAutofillInput, { type AddressFields } from "@/components/admin/AddressAutofillInput";
import MapboxPlaceSearch, { type PlaceSearchResult } from "@/components/admin/MapboxPlaceSearch";

// Entry point for crowdsourced suggestions (see /admin/suggestions for the
// review side). Role-holders only — the caller gates rendering with
// usePermissions().hasAnyRole; the API enforces it again server-side.

const INPUT =
  "w-full border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors";

type LocDetail = {
  id: number;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  fields: { id: number; name: string }[];
};

type FieldRowState = { id: number; name: string; newName: string; remove: boolean };

const REMOVAL_OPTIONS = [
  { value: "closed", label: "Permanently closed" },
  { value: "duplicate", label: "Duplicate of another location" },
  { value: "wrong", label: "Wrong / doesn't exist" },
  { value: "other", label: "Other" },
] as const;

export type SuggestLocationModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "edit" — propose changes to (or removal of) locationId; "new" — propose a new location. */
  mode: "edit" | "new";
  locationId?: number | null;
  /** Prefill for the new-location name (e.g. the search text that found nothing). */
  initialName?: string;
};

export default function SuggestLocationModal({
  open,
  onOpenChange,
  mode,
  locationId,
  initialName,
}: SuggestLocationModalProps) {
  const [tab, setTab] = useState<"edit" | "removal">("edit");

  const [original, setOriginal] = useState<LocDetail | null>(null);
  const [loadingOriginal, setLoadingOriginal] = useState(false);

  const [name, setName] = useState("");
  const [addr, setAddr] = useState<AddressFields>({ address: "", city: "", state: "", zip: "" });
  const [coords, setCoords] = useState<{ lat: number | null; lng: number | null }>({
    lat: null,
    lng: null,
  });
  const [fieldRows, setFieldRows] = useState<FieldRowState[]>([]);
  const [newFields, setNewFields] = useState<string[]>([]);
  const [newFieldDraft, setNewFieldDraft] = useState("");
  const [reason, setReason] = useState("");

  const [removalReason, setRemovalReason] = useState<string>("closed");
  const [dupQuery, setDupQuery] = useState("");
  const [dupResults, setDupResults] = useState<{ id: number; name: string; city: string | null }[]>([]);
  const [dupSelected, setDupSelected] = useState<{ id: number; name: string } | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // Reset + (for edit) load the target whenever the modal opens.
  useEffect(() => {
    if (!open) return;
    setTab("edit");
    setSubmitted(false);
    setSubmitError(null);
    setReason("");
    setNewFields([]);
    setNewFieldDraft("");
    setCoords({ lat: null, lng: null });
    setRemovalReason("closed");
    setDupQuery("");
    setDupResults([]);
    setDupSelected(null);

    if (mode === "new") {
      setOriginal(null);
      setName(initialName ?? "");
      setAddr({ address: "", city: "", state: "", zip: "" });
      setFieldRows([]);
      return;
    }

    if (locationId == null) return;
    setLoadingOriginal(true);
    fetch(`/api/locations/${locationId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d || typeof d.id !== "number") return;
        const detail: LocDetail = {
          id: d.id,
          name: d.name,
          address: d.address ?? null,
          city: d.city ?? null,
          state: d.state ?? null,
          zip: d.zip ?? null,
          fields: Array.isArray(d.fields)
            ? d.fields.map((f: any) => ({ id: f.id, name: f.name }))
            : [],
        };
        setOriginal(detail);
        setName(detail.name);
        setAddr({
          address: detail.address ?? "",
          city: detail.city ?? "",
          state: detail.state ?? "",
          zip: detail.zip ?? "",
        });
        setFieldRows(
          detail.fields.map((f) => ({ id: f.id, name: f.name, newName: f.name, remove: false }))
        );
      })
      .finally(() => setLoadingOriginal(false));
  }, [open, mode, locationId, initialName]);

  // Duplicate-target mini search (removal tab).
  useEffect(() => {
    if (removalReason !== "duplicate" || dupQuery.trim().length < 2) {
      setDupResults([]);
      return;
    }
    const t = setTimeout(() => {
      fetch(`/api/locations?q=${encodeURIComponent(dupQuery.trim())}&pageSize=8`)
        .then((r) => r.json())
        .then((d) => {
          const rows = Array.isArray(d.rows) ? d.rows : [];
          setDupResults(
            rows
              .filter((r: any) => r.id !== locationId)
              .map((r: any) => ({ id: r.id, name: r.name, city: r.city ?? null }))
          );
        })
        .catch(() => setDupResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [dupQuery, removalReason, locationId]);

  const handlePlacePick = useCallback((result: PlaceSearchResult) => {
    setName((prev) => (prev.trim() ? prev : result.name));
    setAddr({
      address: result.address,
      city: result.city,
      state: result.state,
      zip: result.zip,
    });
    setCoords({ lat: result.latitude, lng: result.longitude });
  }, []);

  const addNewField = () => {
    const v = newFieldDraft.trim();
    if (!v) return;
    if (!newFields.includes(v)) setNewFields((prev) => [...prev, v]);
    setNewFieldDraft("");
  };

  const editPayload = useMemo(() => {
    if (mode !== "edit" || !original) return null;
    const attributes: Record<string, unknown> = {};
    if (name.trim() && name.trim() !== original.name) attributes.name = name.trim();
    const cmp = (v: string, orig: string | null) => {
      const t = v.trim();
      return t !== (orig ?? "") ? t || null : undefined;
    };
    const a = cmp(addr.address, original.address);
    const c = cmp(addr.city, original.city);
    const s = cmp(addr.state, original.state);
    const z = cmp(addr.zip, original.zip);
    if (a !== undefined) attributes.address = a;
    if (c !== undefined) attributes.city = c;
    if (s !== undefined) attributes.state = s;
    if (z !== undefined) attributes.zip = z;

    const add = newFields.filter((f) => f.trim());
    const rename = fieldRows
      .filter((r) => !r.remove && r.newName.trim() && r.newName.trim() !== r.name)
      .map((r) => ({ id: r.id, from: r.name, to: r.newName.trim() }));
    const remove = fieldRows.filter((r) => r.remove).map((r) => ({ id: r.id, name: r.name }));

    const fields =
      add.length || rename.length || remove.length
        ? {
            ...(add.length ? { add } : {}),
            ...(rename.length ? { rename } : {}),
            ...(remove.length ? { remove } : {}),
          }
        : undefined;

    const hasAttrs = Object.keys(attributes).length > 0;
    if (!hasAttrs && !fields) return null;
    return {
      ...(hasAttrs ? { attributes } : {}),
      ...(fields ? { fields } : {}),
    };
  }, [mode, original, name, addr, fieldRows, newFields]);

  const submit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      let body: Record<string, unknown>;
      if (mode === "new") {
        if (!name.trim()) throw new Error("Location name is required");
        body = {
          suggestion_type: "new",
          payload: {
            name: name.trim(),
            address: addr.address.trim() || null,
            city: addr.city.trim() || null,
            state: addr.state.trim() || null,
            zip: addr.zip.trim() || null,
            ...(coords.lat != null && coords.lng != null
              ? { latitude: coords.lat, longitude: coords.lng }
              : {}),
            ...(newFields.length ? { fields: newFields } : {}),
          },
          reason: reason.trim() || undefined,
        };
      } else if (tab === "removal") {
        body = {
          suggestion_type: "removal",
          location_id: locationId,
          payload: {
            removal_reason: removalReason,
            ...(removalReason === "duplicate" && dupSelected
              ? { duplicate_of_location_id: dupSelected.id }
              : {}),
          },
          reason: reason.trim() || undefined,
        };
      } else {
        if (!editPayload) throw new Error("You haven't suggested any changes yet");
        body = {
          suggestion_type: "edit",
          location_id: locationId,
          payload: editPayload,
          reason: reason.trim() || undefined,
        };
      }

      const res = await fetch("/api/locations/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setSubmitted(true);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Failed to submit suggestion");
    } finally {
      setSubmitting(false);
    }
  };

  const title =
    mode === "new"
      ? "Suggest a new location"
      : tab === "removal"
        ? "Report a problem"
        : "Suggest an edit";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-primary" />
            {title}
          </DialogTitle>
          <DialogDescription>
            {mode === "new"
              ? "Propose a location for the directory. An admin will review it before it appears."
              : "Your suggestion is reviewed by an admin before any change is made."}
          </DialogDescription>
        </DialogHeader>

        {submitted ? (
          <div className="py-6 text-center space-y-3">
            <div className="mx-auto w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <Check className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <p className="text-sm">
              Thanks — an admin will review your suggestion. You can track it on your{" "}
              <Link href="/account" className="text-primary underline">
                account page
              </Link>
              .
            </p>
            <Button size="sm" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        ) : (
          <div className="space-y-4 mt-2">
            {mode === "edit" && (
              <div className="inline-flex bg-muted/60 border border-border p-1 rounded-lg gap-0.5">
                {(["edit", "removal"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTab(t)}
                    className={cn(
                      "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                      tab === t
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {t === "edit" ? "Suggest edits" : "Report a problem"}
                  </button>
                ))}
              </div>
            )}

            {mode === "edit" && loadingOriginal && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading location…
              </div>
            )}

            {/* ── New location / edit form ── */}
            {(mode === "new" || (tab === "edit" && !loadingOriginal && original)) && (
              <div className="space-y-3">
                {mode === "new" && (
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">
                      Search for the park or facility (fills everything below)
                    </label>
                    <MapboxPlaceSearch onSelect={handlePlacePick} />
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Location name</label>
                  <input
                    className={INPUT}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Mission Sports Park"
                  />
                </div>

                <AddressAutofillInput value={addr} onAddressChange={setAddr} />

                {/* Fields */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">Fields</label>
                  {mode === "edit" &&
                    fieldRows.map((row, i) => (
                      <div key={row.id} className="flex items-center gap-2">
                        <input
                          className={cn(INPUT, "flex-1", row.remove && "opacity-40 line-through")}
                          value={row.newName}
                          disabled={row.remove}
                          onChange={(e) =>
                            setFieldRows((prev) =>
                              prev.map((r, j) => (j === i ? { ...r, newName: e.target.value } : r))
                            )
                          }
                        />
                        <button
                          type="button"
                          title={row.remove ? "Keep this field" : "Suggest removing this field"}
                          onClick={() =>
                            setFieldRows((prev) =>
                              prev.map((r, j) =>
                                j === i ? { ...r, remove: !r.remove, newName: r.name } : r
                              )
                            )
                          }
                          className={cn(
                            "shrink-0 transition-colors",
                            row.remove
                              ? "text-primary hover:text-foreground"
                              : "text-muted-foreground hover:text-destructive"
                          )}
                        >
                          {row.remove ? <RotateCcw className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
                        </button>
                      </div>
                    ))}
                  {newFields.map((f) => (
                    <div key={f} className="flex items-center gap-2 text-sm">
                      <span className="flex-1 px-3 py-1.5 border border-dashed border-emerald-500/50 bg-emerald-500/5 rounded">
                        + {f}
                      </span>
                      <button
                        type="button"
                        onClick={() => setNewFields((prev) => prev.filter((x) => x !== f))}
                        className="text-muted-foreground hover:text-destructive shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <div className="flex items-center gap-2">
                    <input
                      className={cn(INPUT, "flex-1")}
                      placeholder="Add a field (e.g. Field 3)"
                      value={newFieldDraft}
                      onChange={(e) => setNewFieldDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addNewField();
                        }
                      }}
                    />
                    <Button type="button" size="sm" variant="outline" onClick={addNewField}>
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Removal form ── */}
            {mode === "edit" && tab === "removal" && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  {REMOVAL_OPTIONS.map((opt) => (
                    <label key={opt.value} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="radio"
                        name="removal_reason"
                        value={opt.value}
                        checked={removalReason === opt.value}
                        onChange={() => setRemovalReason(opt.value)}
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
                {removalReason === "duplicate" && (
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">
                      Which location is it a duplicate of?
                    </label>
                    {dupSelected ? (
                      <div className="inline-flex items-center gap-2 border border-border bg-elevated px-2 py-1 text-sm">
                        <MapPin className="h-3 w-3 text-primary" />
                        {dupSelected.name}
                        <button
                          type="button"
                          onClick={() => setDupSelected(null)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="relative">
                        <input
                          className={INPUT}
                          placeholder="Search locations…"
                          value={dupQuery}
                          onChange={(e) => setDupQuery(e.target.value)}
                        />
                        {dupResults.length > 0 && (
                          <div className="absolute z-20 mt-1 w-full border border-border bg-card shadow-lg max-h-48 overflow-y-auto">
                            {dupResults.map((r) => (
                              <button
                                key={r.id}
                                type="button"
                                onClick={() => {
                                  setDupSelected({ id: r.id, name: r.name });
                                  setDupQuery("");
                                  setDupResults([]);
                                }}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-elevated border-b border-border/30 last:border-b-0"
                              >
                                {r.name}
                                {r.city ? <span className="text-xs text-muted-foreground"> — {r.city}</span> : null}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Reason + submit */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                {tab === "removal" && mode === "edit"
                  ? "Tell us more (optional)"
                  : "Why this change? (optional)"}
              </label>
              <textarea
                className={cn(INPUT, "resize-none")}
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Anything that helps an admin verify this — e.g. a link to a website or league page that documents the location and its fields"
              />
            </div>

            {submitError && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3 text-sm text-destructive">
                {submitError}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={submit}
                disabled={
                  submitting ||
                  (mode === "edit" && tab === "edit" && !editPayload) ||
                  (mode === "new" && !name.trim())
                }
              >
                {submitting && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                Submit suggestion
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
