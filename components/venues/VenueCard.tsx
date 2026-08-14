// components/venues/VenueCard.tsx
// Scope-agnostic venue card. `basePath` is the venues API prefix, e.g.
// `/api/tournaments/123/venues` or `/api/seasons/10/venues`.
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, X, Pencil, Check, Navigation } from "lucide-react";
import { cn } from "@/lib/utils";
import type { VenueDTO, VenueFieldDTO } from "@/components/venues/types";

interface Props {
  basePath: string;
  venue: VenueDTO;
  canEdit: boolean;
  scopeNoun?: string; // "tournament" | "season" — tunes copy
  onChanged: () => void; // re-fetch venues from parent (venue-level edits only)
}

const INPUT =
  "border border-border bg-input px-2 py-1 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors";
const CHIP_BASE =
  "inline-flex items-center gap-1 border px-2 py-0.5 text-xs transition-colors duration-100";
const CHIP_ON = "border-border bg-input text-foreground";
const CHIP_OFF =
  "border-dashed border-border/70 bg-transparent text-muted-foreground hover:text-foreground/80";

/** How long to wait after the last click on a field before persisting it. */
const TOGGLE_DEBOUNCE_MS = 400;

type FieldRow = VenueFieldDTO & { active: boolean };

/**
 * The API splits fields by state so pickers can't accidentally offer an
 * inactive one; the card is the one place that wants both, in venue order.
 */
function mergeFields(venue: VenueDTO): FieldRow[] {
  return [
    ...venue.fields.map((f) => ({ ...f, active: true })),
    ...(venue.inactiveFields ?? []).map((f) => ({ ...f, active: false })),
  ].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
}

export default function VenueCard({ basePath, venue, canEdit, scopeNoun = "tournament", onChanged }: Props) {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(venue.name);
  const [addressDraft, setAddressDraft] = useState(venue.address ?? "");
  const [newField, setNewField] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");

  // Toggling a field must never wait on the network, so the chip row is driven
  // entirely by local state and the write is debounced in the background. The
  // ref mirrors it so rapid clicks compose off the latest value, not a stale
  // closure.
  const [fields, setFieldsState] = useState<FieldRow[]>(() => mergeFields(venue));
  const fieldsRef = useRef<FieldRow[]>(fields);
  // Last state the server confirmed, per field — where a failed save rolls back to.
  const confirmedRef = useRef(new Map<number, boolean>());
  const timersRef = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  // Bumped per field so a slow response can't clobber a newer click.
  const seqRef = useRef(new Map<number, number>());

  const setFields = useCallback((next: FieldRow[] | ((prev: FieldRow[]) => FieldRow[])) => {
    const value = typeof next === "function" ? next(fieldsRef.current) : next;
    fieldsRef.current = value;
    setFieldsState(value);
  }, []);

  // Adopt server state whenever the parent re-fetches — unless a toggle is
  // still pending, in which case the user's clicks are the newer truth.
  useEffect(() => {
    if (timersRef.current.size > 0) return;
    const merged = mergeFields(venue);
    confirmedRef.current = new Map(merged.map((f) => [f.id, f.active]));
    setFields(merged);
  }, [venue, setFields]);

  // Let "Saved" fade out rather than sit there indefinitely.
  useEffect(() => {
    if (saveState !== "saved") return;
    const t = setTimeout(() => setSaveState("idle"), 1500);
    return () => clearTimeout(t);
  }, [saveState]);

  // A pending toggle must survive navigating away mid-debounce. `keepalive`
  // lets the request outlive the unmount; there's no response to handle by then.
  useEffect(() => {
    const timers = timersRef.current;
    const confirmed = confirmedRef.current;
    return () => {
      for (const [fieldId, timer] of timers) {
        clearTimeout(timer);
        const row = fieldsRef.current.find((f) => f.id === fieldId);
        if (!row || confirmed.get(fieldId) === row.active) continue;
        void fetch(`${basePath}/${venue.id}/fields/${fieldId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: row.active }),
          keepalive: true,
        }).catch(() => {});
      }
      timers.clear();
    };
  }, [basePath, venue.id]);

  const directionsQuery = [
    venue.name,
    venue.address,
    [venue.city, venue.state].filter(Boolean).join(", "),
  ]
    .filter(Boolean)
    .join(", ");
  const directionsUrl = directionsQuery
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(directionsQuery)}`
    : null;

  const saveCustom = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${basePath}/${venue.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameDraft, address: addressDraft }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Save failed");
      setEditingName(false);
      onChanged();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const removeVenue = async () => {
    if (venue.gameCount > 0) {
      const ok = window.confirm(
        `${venue.gameCount} game${venue.gameCount === 1 ? "" : "s"} ${venue.gameCount === 1 ? "is" : "are"} scheduled here. Removing this venue will leave ${venue.gameCount === 1 ? "that game" : "those games"} with their last-known location label but unlinked. Continue?`,
      );
      if (!ok) return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${basePath}/${venue.id}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 204) throw new Error((await res.json()).error || "Delete failed");
      onChanged();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  /** Persist whatever state the chip is in right now. */
  const persistActive = useCallback(
    async (fieldId: number) => {
      timersRef.current.delete(fieldId);
      const row = fieldsRef.current.find((f) => f.id === fieldId);
      if (!row) return;
      // Switched off and back on again while the debounce ran — nothing to send.
      if (confirmedRef.current.get(fieldId) === row.active) return;

      const seq = (seqRef.current.get(fieldId) ?? 0) + 1;
      seqRef.current.set(fieldId, seq);
      setSaveState("saving");
      setError(null);
      try {
        const res = await fetch(`${basePath}/${venue.id}/fields/${fieldId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: row.active }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        // A newer write is already in flight — let it have the last word.
        if (seq !== seqRef.current.get(fieldId)) return;
        confirmedRef.current.set(fieldId, row.active);
        setSaveState("saved");
      } catch (e: any) {
        if (seq !== seqRef.current.get(fieldId)) return;
        // Roll back to the last confirmed state rather than the pre-click one:
        // the user may have clicked again since this save started.
        const back = confirmedRef.current.get(fieldId);
        if (back !== undefined) {
          setFields((prev) => prev.map((f) => (f.id === fieldId ? { ...f, active: back } : f)));
        }
        setSaveState("idle");
        setError(e.message || "Failed to save field");
      }
    },
    [basePath, venue.id, setFields],
  );

  const toggleField = useCallback(
    (fieldId: number) => {
      setFields((prev) => prev.map((f) => (f.id === fieldId ? { ...f, active: !f.active } : f)));
      const pending = timersRef.current.get(fieldId);
      if (pending) clearTimeout(pending);
      timersRef.current.set(
        fieldId,
        setTimeout(() => void persistActive(fieldId), TOGGLE_DEBOUNCE_MS),
      );
    },
    [setFields, persistActive],
  );

  const addField = async () => {
    const t = newField.trim();
    if (!t) return;
    setNewField("");
    setError(null);

    // Typing the name of a field that's only switched off is a request to
    // switch it back on, not to create a second one.
    const existing = fieldsRef.current.find((f) => f.name.toLowerCase() === t.toLowerCase());
    if (existing) {
      if (!existing.active) toggleField(existing.id);
      return;
    }

    // Show the chip straight away; swap in the real row when the id comes back.
    const tempId = -Date.now();
    setFields((prev) => [
      ...prev,
      { id: tempId, name: t, sortOrder: Number.MAX_SAFE_INTEGER, active: true },
    ]);
    setSaveState("saving");
    try {
      const res = await fetch(`${basePath}/${venue.id}/fields`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: t }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Add field failed");
      const created = json.field ?? {};
      const id = Number(created.id);
      setFields((prev) =>
        prev.map((f) =>
          f.id === tempId
            ? { id, name: String(created.name ?? t), sortOrder: Number(created.sortOrder ?? 0), active: true }
            : f,
        ),
      );
      confirmedRef.current.set(id, true);
      setSaveState("saved");
    } catch (e: any) {
      setFields((prev) => prev.filter((f) => f.id !== tempId));
      setSaveState("idle");
      setError(e.message);
    }
  };

  /**
   * Only offered for switched-off fields on custom venues. A predefined venue's
   * fields belong to the location, so deleting one there would just have it
   * re-appear (switched off) on the next load — deactivating is the real op.
   */
  const deleteField = async (fieldId: number) => {
    const snapshot = fieldsRef.current;
    const pending = timersRef.current.get(fieldId);
    if (pending) {
      clearTimeout(pending);
      timersRef.current.delete(fieldId);
    }
    setFields((prev) => prev.filter((f) => f.id !== fieldId));
    setError(null);
    try {
      const res = await fetch(`${basePath}/${venue.id}/fields/${fieldId}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Delete field failed");
      }
      confirmedRef.current.delete(fieldId);
    } catch (e: any) {
      setFields(snapshot);
      setError(e.message);
    }
  };

  const visibleFields = canEdit ? fields : fields.filter((f) => f.active);
  const activeCount = fields.filter((f) => f.active).length;

  return (
    <div className="border border-border bg-card p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={cn(
                "text-[9px] font-semibold uppercase tracking-[0.1em] border px-1.5 py-0.5",
                venue.kind === "predefined"
                  ? "border-primary/40 text-primary"
                  : "border-muted-foreground/40 text-muted-foreground",
              )}
            >
              {venue.kind}
            </span>
            {venue.gameCount > 0 && (
              <span className="text-xs text-muted-foreground">
                {venue.gameCount} game{venue.gameCount === 1 ? "" : "s"}
              </span>
            )}
          </div>

          {venue.kind === "custom" && editingName ? (
            <div className="flex flex-col gap-2">
              <input
                className={INPUT}
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                placeholder="Venue name"
              />
              <input
                className={INPUT}
                value={addressDraft}
                onChange={(e) => setAddressDraft(e.target.value)}
                placeholder="Address (optional)"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={saveCustom}
                  className="inline-flex items-center gap-1 border border-primary bg-primary text-primary-foreground px-2 py-1 text-xs"
                >
                  <Check className="h-3 w-3" /> Save
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setEditingName(false);
                    setNameDraft(venue.name);
                    setAddressDraft(venue.address ?? "");
                  }}
                  className="inline-flex items-center gap-1 border border-border px-2 py-1 text-xs"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="font-medium text-sm flex items-center gap-2">
                {venue.name}
                {canEdit && venue.kind === "custom" && (
                  <button
                    type="button"
                    aria-label="Edit name"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => setEditingName(true)}
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                )}
              </div>
              {(venue.address || venue.city || venue.state) && (
                <div className="text-xs text-muted-foreground">
                  {[venue.address, [venue.city, venue.state].filter(Boolean).join(", ")]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              )}
              {directionsUrl && (
                <a
                  href={directionsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 mt-1 text-xs text-primary hover:underline"
                >
                  <Navigation className="h-3 w-3" /> Directions
                </a>
              )}
            </>
          )}
        </div>
        {canEdit && (
          <button
            type="button"
            aria-label="Remove venue"
            disabled={busy}
            onClick={removeVenue}
            className="text-muted-foreground hover:text-destructive transition-colors p-1"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5 items-center">
        {visibleFields.map((f) =>
          canEdit ? (
            <span key={f.id} className={cn(CHIP_BASE, f.active ? CHIP_ON : CHIP_OFF)}>
              <button
                type="button"
                onClick={() => toggleField(f.id)}
                aria-pressed={f.active}
                title={
                  f.active
                    ? `Turn off ${f.name} for this ${scopeNoun}`
                    : `Turn on ${f.name} for this ${scopeNoun}`
                }
                className="inline-flex items-center gap-1.5 cursor-pointer"
              >
                <span
                  className={cn(
                    "w-1.5 h-1.5 rounded-full",
                    f.active ? "bg-primary" : "border border-muted-foreground/60",
                  )}
                />
                {f.name}
              </button>
              {venue.kind === "custom" && !f.active && (
                <button
                  type="button"
                  aria-label={`Delete field ${f.name}`}
                  title="Delete this field for good"
                  onClick={() => deleteField(f.id)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ) : (
            <span key={f.id} className={cn(CHIP_BASE, CHIP_ON)}>
              {f.name}
            </span>
          ),
        )}
        {visibleFields.length === 0 && (
          <span className="text-xs text-muted-foreground">No fields yet.</span>
        )}
        {canEdit && (
          <div className="inline-flex items-center gap-1">
            <input
              className={cn(INPUT, "w-32")}
              value={newField}
              onChange={(e) => setNewField(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addField();
                }
              }}
              placeholder="Add field"
            />
            <button
              type="button"
              disabled={!newField.trim()}
              onClick={addField}
              className="inline-flex items-center gap-1 border border-border px-2 py-1 text-xs disabled:opacity-50"
            >
              <Plus className="h-3 w-3" /> Add
            </button>
          </div>
        )}
        {/* Saving happens in the background — this reports it without ever
            blocking a click. */}
        <span
          aria-live="polite"
          className={cn(
            "text-[10px] text-muted-foreground transition-opacity duration-200",
            saveState === "idle" && "opacity-0",
          )}
        >
          {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : ""}
        </span>
      </div>

      {canEdit && fields.length > 0 && (
        <p className="text-[10px] text-muted-foreground">
          {activeCount} of {fields.length} field{fields.length === 1 ? "" : "s"} in use. Click a
          field to switch it off for this {scopeNoun} — it stays here, out of the scheduling
          pickers, until you switch it back on.
        </p>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
