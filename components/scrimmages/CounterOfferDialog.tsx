"use client";

import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import LocationPicker from "@/components/LocationPicker";

export default function CounterOfferDialog({
  open,
  onOpenChange,
  listingId,
  offerId,
  listingWillTravel,
  currentProposedTime,
  currentLocationId,
  currentLocation,
  currentField,
  onSubmitted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listingId: number;
  offerId: number;
  listingWillTravel: boolean;
  currentProposedTime: string | null;
  currentLocationId: number | null;
  currentLocation: string | null;
  currentField: string | null;
  onSubmitted: () => void;
}) {
  const [locationId, setLocationId] = useState<number | null>(null);
  const [location, setLocation] = useState("");
  const [field, setField] = useState("");
  const [proposedTime, setProposedTime] = useState("");
  const [note, setNote] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLocationId(currentLocationId);
    setLocation(currentLocation ?? "");
    setField(currentField ?? "");
    setProposedTime(currentProposedTime ?? "");
    setNote("");
    setError(null);
  }, [open, currentLocationId, currentLocation, currentField, currentProposedTime]);

  const handleSubmit = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/scrimmage-marketplace/${listingId}/offers/${offerId}/counter`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            proposed_location_id: listingWillTravel ? locationId : null,
            proposed_location: listingWillTravel ? (location.trim() || null) : null,
            proposed_location_field: listingWillTravel ? (field.trim() || null) : null,
            proposed_time: proposedTime || null,
            note: note.trim() || null,
          }),
        }
      );

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }

      onOpenChange(false);
      onSubmitted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send counter");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle
            style={{ fontFamily: "var(--font-display)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "-0.01em" }}
          >
            Counter Offer
          </DialogTitle>
          <DialogDescription>
            Adjust the proposed terms and send back. The other side can accept, counter, or decline.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {listingWillTravel && (
            <div>
              <Label className="text-[11px] uppercase tracking-wider">
                Proposed Location <span className="text-muted-foreground">(optional)</span>
              </Label>
              <div className="mt-1">
                <LocationPicker
                  locationId={locationId}
                  location={location}
                  field={field}
                  onChange={(v) => {
                    setLocationId(v.locationId);
                    setLocation(v.location);
                    setField(v.field);
                  }}
                />
              </div>
            </div>
          )}

          <div>
            <Label className="text-[11px] uppercase tracking-wider">
              Proposed Time <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              type="time"
              value={proposedTime}
              onChange={(e) => setProposedTime(e.target.value)}
              className="mt-1 h-9"
            />
          </div>

          <div>
            <Label className="text-[11px] uppercase tracking-wider">
              Note <span className="text-muted-foreground">(optional)</span>
            </Label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why these terms? Any context for the other manager…"
              rows={2}
              className="w-full mt-1 border border-border bg-input px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary resize-none"
            />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter className="gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="px-4 py-2 text-[11px] font-semibold tracking-[0.08em] uppercase border border-border text-muted-foreground hover:text-foreground transition-colors"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="bg-primary text-primary-foreground px-4 py-2 text-[11px] font-semibold tracking-[0.08em] uppercase hover:opacity-90 transition-opacity disabled:opacity-40"
            style={{ fontFamily: "var(--font-body)" }}
          >
            {saving ? "Sending…" : "Send Counter"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
