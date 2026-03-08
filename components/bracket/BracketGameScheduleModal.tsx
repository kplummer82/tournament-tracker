import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type BracketGameRecord = {
  id: number;
  bracket_game_id: string;
  gamedate: string | null;
  gametime: string | null;
  location: string | null;
  field: string | null;
  home: number | null;
  away: number | null;
  home_team: string | null;
  away_team: string | null;
  homescore: number | null;
  awayscore: number | null;
  gamestatusid: number | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  game: BracketGameRecord;
  seasonId: number;
  onSaved: () => void;
};

const INPUT =
  "w-full border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors";

const BTN =
  "inline-flex items-center justify-center gap-1.5 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors duration-100 border";

export default function BracketGameScheduleModal({ open, onOpenChange, game, seasonId, onSaved }: Props) {
  const [gamedate, setGamedate] = useState(game.gamedate?.slice(0, 10) ?? "");
  const [gametime, setGametime] = useState(game.gametime?.slice(0, 5) ?? "");
  const [location, setLocation] = useState(game.location ?? "");
  const [field, setField] = useState(game.field ?? "");
  const [homescore, setHomescore] = useState(game.homescore != null ? String(game.homescore) : "");
  const [awayscore, setAwayscore] = useState(game.awayscore != null ? String(game.awayscore) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const homeLabel = game.home_team ?? "TBD";
  const awayLabel = game.away_team ?? "TBD";
  const hasBothTeams = game.home != null && game.away != null;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        gamedate: gamedate || null,
        gametime: gametime || null,
        location: location || null,
        field: field || null,
      };
      // Only include scores if both teams are assigned
      if (hasBothTeams) {
        body.homescore = homescore !== "" ? Number(homescore) : null;
        body.awayscore = awayscore !== "" ? Number(awayscore) : null;
      }

      const res = await fetch(`/api/seasons/${seasonId}/games/${game.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed to save");
      onSaved();
      onOpenChange(false);
    } catch (e: unknown) {
      setError((e as Error).message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle
            className="text-sm font-semibold uppercase tracking-[0.08em]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Schedule Game {game.bracket_game_id}
          </DialogTitle>
          <DialogDescription>
            {homeLabel} vs {awayLabel}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <p className="text-xs text-destructive mt-2" style={{ fontFamily: "var(--font-body)" }}>
            {error}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3 mt-4">
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-1 block">
              Date
            </label>
            <input
              className={INPUT}
              type="date"
              value={gamedate}
              onChange={(e) => setGamedate(e.target.value)}
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-1 block">
              Time
            </label>
            <input
              className={INPUT}
              type="time"
              value={gametime}
              onChange={(e) => setGametime(e.target.value)}
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-1 block">
              Location
            </label>
            <input
              className={INPUT}
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Park, gym, complex..."
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-1 block">
              Field
            </label>
            <input
              className={INPUT}
              type="text"
              value={field}
              onChange={(e) => setField(e.target.value)}
              placeholder="Field 1, Court A..."
            />
          </div>

          {hasBothTeams && (
            <>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-1 block">
                  {homeLabel} Score
                </label>
                <input
                  className={INPUT}
                  type="number"
                  value={homescore}
                  onChange={(e) => setHomescore(e.target.value)}
                  placeholder="—"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-1 block">
                  {awayLabel} Score
                </label>
                <input
                  className={INPUT}
                  type="number"
                  value={awayscore}
                  onChange={(e) => setAwayscore(e.target.value)}
                  placeholder="—"
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter className="mt-5">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className={cn(BTN, "border-border text-muted-foreground hover:bg-muted")}
            style={{ fontFamily: "var(--font-body)" }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className={cn(BTN, "bg-primary text-primary-foreground border-primary hover:opacity-90 disabled:opacity-40")}
            style={{ fontFamily: "var(--font-body)" }}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
