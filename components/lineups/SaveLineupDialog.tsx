"use client";

import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { POSITIONS } from "@/lib/positions";
import { playerLabel, type LineupPlayer } from "@/lib/lineups/player";
import type { DefenseAssignment } from "@/lib/lineups/defense";

/**
 * Capture an inning the coach just built as a reusable team lineup, so saved
 * alignments come out of real work instead of having to be authored from
 * scratch on the team page.
 */
export default function SaveLineupDialog({
  open,
  onOpenChange,
  teamId,
  inning,
  defense,
  players,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: number;
  inning: number;
  defense: DefenseAssignment;
  players: LineupPlayer[];
  onSaved: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameOf = (id: number) => {
    const p = players.find((x) => x.roster_id === id);
    return p ? playerLabel(p) : `#${id}`;
  };

  // Coaches describe these alignments by who's pitching ("Jack pitching"), so
  // that's the suggested name. Nothing about the pitcher is stored — it's just
  // a prefilled, editable string.
  useEffect(() => {
    if (!open) return;
    const pitcher = defense.P;
    setName(pitcher != null ? `${nameOf(pitcher)} pitching` : `Inning ${inning} defense`);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, inning, defense.P]);

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Give this lineup a name.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/teams/${teamId}/lineup-templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, defense }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      onSaved(trimmed);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that lineup.");
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Save inning {inning} as a team lineup</DialogTitle>
          <DialogDescription>
            It&apos;ll be available to import into any of this team&apos;s games.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label
              htmlFor="save-lineup-name"
              className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-1"
            >
              Name
            </label>
            <input
              id="save-lineup-name"
              type="text"
              value={name}
              maxLength={60}
              onChange={(e) => { setName(e.target.value); setError(null); }}
              className="w-full border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
            />
          </div>

          <div className="border border-border p-2">
            <table className="w-full text-xs">
              <tbody>
                {POSITIONS.map((pos) => (
                  <tr key={pos}>
                    <td
                      className="py-0.5 pr-2 font-bold text-muted-foreground w-8"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      {pos}
                    </td>
                    <td className={cn("py-0.5", defense[pos] == null && "text-muted-foreground")}>
                      {defense[pos] == null ? "—" : nameOf(defense[pos] as number)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {error && <p className="text-[11px] text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.07em] border border-border text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.07em] border border-primary text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save lineup"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
