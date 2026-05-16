"use client";

import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePermissions, type UserRoleRow } from "@/lib/hooks/usePermissions";

type ManagedTeam = {
  id: number;
  name: string;
};

export default function OfferDialog({
  open,
  onOpenChange,
  listingId,
  listingTeamId,
  onOffered,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listingId: number;
  listingTeamId: number;
  onOffered: () => void;
}) {
  const { roles } = usePermissions();

  const [teams, setTeams] = useState<ManagedTeam[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);

  const [teamId, setTeamId] = useState("");
  const [proposedLocation, setProposedLocation] = useState("");
  const [proposedTime, setProposedTime] = useState("");
  const [message, setMessage] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load managed teams, excluding the listing team
  useEffect(() => {
    if (!open) return;
    const teamRoles = roles.filter(
      (r: UserRoleRow) =>
        r.role === "team_manager" &&
        r.scope_type === "team" &&
        r.scope_id !== listingTeamId
    );
    if (teamRoles.length === 0) {
      setTeams([]);
      return;
    }

    setTeamsLoading(true);
    Promise.all(
      teamRoles.map((r: UserRoleRow) =>
        fetch(`/api/teams/${r.scope_id}`)
          .then((res) => res.json())
          .then((d) => {
            const t = d.team;
            if (!t) return null;
            return { id: t.teamid ?? t.id, name: t.name } as ManagedTeam;
          })
          .catch(() => null)
      )
    ).then((results) => {
      const valid = results.filter(Boolean) as ManagedTeam[];
      setTeams(valid);
      if (valid.length === 1) setTeamId(String(valid[0].id));
      setTeamsLoading(false);
    });
  }, [open, roles, listingTeamId]);

  const canSubmit = !!(teamId && !saving);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/scrimmage-marketplace/${listingId}/offers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          team_id: parseInt(teamId, 10),
          proposed_location: proposedLocation.trim() || null,
          proposed_time: proposedTime || null,
          message: message.trim() || null,
        }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }

      setTeamId("");
      setProposedLocation("");
      setProposedTime("");
      setMessage("");
      onOpenChange(false);
      onOffered();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit offer");
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
            Offer to Play
          </DialogTitle>
          <DialogDescription>
            Submit your team to scrimmage. The listing manager will review and accept or decline.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Team selector */}
          <div>
            <Label className="text-[11px] uppercase tracking-wider">Your Team</Label>
            {teamsLoading ? (
              <div className="h-9 bg-elevated animate-pulse mt-1" />
            ) : teams.length === 0 ? (
              <p className="text-sm text-muted-foreground mt-1">
                No eligible teams to offer.
              </p>
            ) : teams.length === 1 ? (
              <p className="text-sm text-foreground mt-1" style={{ fontFamily: "var(--font-body)" }}>
                {teams[0].name}
              </p>
            ) : (
              <select
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                className="w-full mt-1 h-9 border border-border bg-input px-3 text-sm text-foreground focus:outline-none focus:border-primary"
              >
                <option value="">Select a team…</option>
                {teams.map((t) => (
                  <option key={t.id} value={String(t.id)}>{t.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Proposed location */}
          <div>
            <Label className="text-[11px] uppercase tracking-wider">
              Proposed Location <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              value={proposedLocation}
              onChange={(e) => setProposedLocation(e.target.value)}
              placeholder="e.g. Our home field at Lincoln Park"
              className="mt-1 h-9"
            />
          </div>

          {/* Proposed time */}
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

          {/* Message */}
          <div>
            <Label className="text-[11px] uppercase tracking-wider">
              Message <span className="text-muted-foreground">(optional)</span>
            </Label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Any details for the other manager…"
              rows={2}
              className="w-full mt-1 border border-border bg-input px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary resize-none"
            />
          </div>

          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}
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
            disabled={!canSubmit}
            className="bg-primary text-primary-foreground px-4 py-2 text-[11px] font-semibold tracking-[0.08em] uppercase hover:opacity-90 transition-opacity disabled:opacity-40"
            style={{ fontFamily: "var(--font-body)" }}
          >
            {saving ? "Sending…" : "Send Offer"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
