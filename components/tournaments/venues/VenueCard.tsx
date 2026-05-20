// components/tournaments/venues/VenueCard.tsx
"use client";
import { useState } from "react";
import { Plus, X, Pencil, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { VenueDTO, VenueFieldDTO } from "@/lib/tournaments/venues";

export type { VenueDTO, VenueFieldDTO };

interface Props {
  tournamentId: number;
  venue: VenueDTO;
  canEdit: boolean;
  onChanged: () => void; // re-fetch venues from parent
}

const INPUT =
  "border border-border bg-input px-2 py-1 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors";
const CHIP =
  "inline-flex items-center gap-1 border border-border bg-input px-2 py-0.5 text-xs text-foreground";

export default function VenueCard({ tournamentId, venue, canEdit, onChanged }: Props) {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(venue.name);
  const [addressDraft, setAddressDraft] = useState(venue.address ?? "");
  const [newField, setNewField] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveCustom = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/venues/${venue.id}`, {
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
      const res = await fetch(`/api/tournaments/${tournamentId}/venues/${venue.id}`, {
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

  const addField = async () => {
    const t = newField.trim();
    if (!t) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/tournaments/${tournamentId}/venues/${venue.id}/fields`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: t }),
        },
      );
      if (!res.ok) throw new Error((await res.json()).error || "Add field failed");
      setNewField("");
      onChanged();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const removeField = async (fieldId: number) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/tournaments/${tournamentId}/venues/${venue.id}/fields/${fieldId}`,
        { method: "DELETE" },
      );
      if (!res.ok && res.status !== 204) throw new Error((await res.json()).error || "Delete field failed");
      onChanged();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

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
        {venue.fields.map((f) => (
          <span key={f.id} className={CHIP}>
            {f.name}
            {canEdit && (
              <button
                type="button"
                aria-label={`Remove field ${f.name}`}
                disabled={busy}
                onClick={() => removeField(f.id)}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}
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
              disabled={busy || !newField.trim()}
              onClick={addField}
              className="inline-flex items-center gap-1 border border-border px-2 py-1 text-xs disabled:opacity-50"
            >
              <Plus className="h-3 w-3" /> Add
            </button>
          </div>
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
