// components/tournaments/venues/AddCustomVenueModal.tsx
"use client";
import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tournamentId: number;
  onCreated: () => void;
}

const INPUT =
  "w-full border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors";
const CHIP =
  "inline-flex items-center gap-1 border border-border bg-input px-2 py-0.5 text-xs";

export default function AddCustomVenueModal({ open, onOpenChange, tournamentId, onCreated }: Props) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [fields, setFields] = useState<string[]>([]);
  const [newField, setNewField] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setName("");
    setAddress("");
    setCity("");
    setState("");
    setFields([]);
    setNewField("");
    setError(null);
  };

  const addField = () => {
    const t = newField.trim();
    if (!t) return;
    if (fields.some((f) => f.toLowerCase() === t.toLowerCase())) {
      setNewField("");
      return;
    }
    setFields((f) => [...f, t]);
    setNewField("");
  };

  const submit = async () => {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/venues`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "custom",
          name: name.trim(),
          address: address.trim() || undefined,
          city: city.trim() || undefined,
          state: state.trim() || undefined,
          fields,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to add venue");
      reset();
      onCreated();
      onOpenChange(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-lg rounded-none">
        <DialogHeader>
          <DialogTitle
            style={{ fontFamily: "var(--font-display)", textTransform: "uppercase", fontSize: "18px" }}
          >
            Add Custom Venue
          </DialogTitle>
          <DialogDescription>
            Lives only on this tournament. Not added to the locations directory.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-1 block">
              Name
            </label>
            <input
              className={INPUT}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Westside Field B"
              autoFocus
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-1 block">
              Address (optional)
            </label>
            <input
              className={INPUT}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-1 block">
                City
              </label>
              <input className={INPUT} value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-1 block">
                State
              </label>
              <input className={INPUT} value={state} onChange={(e) => setState(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-1 block">
              Fields (optional)
            </label>
            <div className="flex flex-wrap gap-1.5 items-center">
              {fields.map((f) => (
                <span key={f} className={CHIP}>
                  {f}
                  <button
                    type="button"
                    aria-label={`Remove ${f}`}
                    onClick={() => setFields((cur) => cur.filter((x) => x !== f))}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
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
          </div>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <DialogFooter>
          <button
            type="button"
            className="border border-border px-3 py-1.5 text-xs"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting || !name.trim()}
            onClick={submit}
            className="border border-primary bg-primary text-primary-foreground px-3 py-1.5 text-xs disabled:opacity-50"
          >
            Save Venue
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
