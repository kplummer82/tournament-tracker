"use client";

import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

export type RespondAction = "accepted" | "declined" | "withdrawn";

const COPY: Record<RespondAction, { title: string; description: string; button: string; primary: boolean; destructive: boolean }> = {
  accepted: {
    title: "Accept Offer",
    description: "This will lock in the current proposed terms and decline all other open offers on this listing.",
    button: "Accept Offer",
    primary: true,
    destructive: false,
  },
  declined: {
    title: "Decline Offer",
    description: "The other side will be notified. They can still submit a new offer if the listing is open.",
    button: "Decline Offer",
    primary: false,
    destructive: true,
  },
  withdrawn: {
    title: "Withdraw Offer",
    description: "Pull this offer back. The listing manager will no longer see it.",
    button: "Withdraw Offer",
    primary: false,
    destructive: true,
  },
};

export default function RespondWithNoteDialog({
  open,
  onOpenChange,
  listingId,
  offerId,
  action,
  onSubmitted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listingId: number;
  offerId: number;
  action: RespondAction;
  onSubmitted: () => void;
}) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setNote("");
      setError(null);
    }
  }, [open]);

  const copy = COPY[action];

  const handleSubmit = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/scrimmage-marketplace/${listingId}/offers/${offerId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: action, note: note.trim() || null }),
        }
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      onOpenChange(false);
      onSubmitted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setSaving(false);
    }
  };

  const buttonClass = copy.primary
    ? "bg-primary text-primary-foreground px-4 py-2 text-[11px] font-semibold tracking-[0.08em] uppercase hover:opacity-90 transition-opacity disabled:opacity-40"
    : copy.destructive
      ? "border border-destructive/40 text-destructive px-4 py-2 text-[11px] font-semibold tracking-[0.08em] uppercase hover:bg-destructive/10 transition-colors disabled:opacity-40"
      : "border border-border text-foreground px-4 py-2 text-[11px] font-semibold tracking-[0.08em] uppercase hover:bg-elevated transition-colors disabled:opacity-40";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle
            style={{ fontFamily: "var(--font-display)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "-0.01em" }}
          >
            {copy.title}
          </DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label className="text-[11px] uppercase tracking-wider">
              Note <span className="text-muted-foreground">(optional)</span>
            </Label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Any message for the other manager…"
              rows={3}
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
            className={buttonClass}
            style={{ fontFamily: "var(--font-body)" }}
          >
            {saving ? "Saving…" : copy.button}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
