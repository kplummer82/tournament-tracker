"use client";

import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import LocationPicker, { type LocationPickerValue } from "@/components/LocationPicker";
import { usePermissions, type UserRoleRow } from "@/lib/hooks/usePermissions";

type ManagedTeam = {
  id: number;
  name: string;
  league_id: number | null;
  league_division_id: number | null;
  division_age_range: string | null;
};

export default function CreateListingModal({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const { roles } = usePermissions();

  // Teams the user manages
  const [teams, setTeams] = useState<ManagedTeam[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);

  // Form state
  const [teamId, setTeamId] = useState<string>("");
  const [availableDate, setAvailableDate] = useState("");
  const [timeEarliest, setTimeEarliest] = useState("");
  const [timeLatest, setTimeLatest] = useState("");
  const [willTravel, setWillTravel] = useState(false);
  const [travelRadius, setTravelRadius] = useState("25");
  const [location, setLocation] = useState<LocationPickerValue>({
    locationId: null, location: "", field: "",
  });
  const [opponentScope, setOpponentScope] = useState<"any" | "league" | "division">("any");
  const [ageMin, setAgeMin] = useState("");
  const [ageMax, setAgeMax] = useState("");
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load managed teams when modal opens
  useEffect(() => {
    if (!open) return;
    const teamRoles = roles.filter(
      (r: UserRoleRow) => r.role === "team_manager" && r.scope_type === "team"
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
            return {
              id: t.teamid ?? t.id,
              name: t.name,
              league_id: t.league_id ?? null,
              league_division_id: t.league_division_id ?? null,
              division_age_range: t.division_age_range ?? t.league_division_age_range ?? null,
            } as ManagedTeam;
          })
          .catch(() => null)
      )
    ).then((results) => {
      setTeams(results.filter(Boolean) as ManagedTeam[]);
      setTeamsLoading(false);
    });
  }, [open, roles]);

  // When team changes, auto-populate age range from division
  useEffect(() => {
    const team = teams.find((t) => String(t.id) === teamId);
    if (!team) return;

    // Disable division/league scope if team has no league
    if (!team.league_id && opponentScope !== "any") {
      setOpponentScope("any");
    }

    // Auto-populate age range from division
    if (team.division_age_range) {
      const parts = team.division_age_range.split("-");
      if (parts.length === 2) {
        setAgeMin(parts[0].trim());
        setAgeMax(parts[1].trim());
      }
    }
  }, [teamId, teams]);

  const selectedTeam = teams.find((t) => String(t.id) === teamId);

  const canSubmit = !!(teamId && availableDate && !saving);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);

    try {
      const body: Record<string, unknown> = {
        team_id: parseInt(teamId, 10),
        available_date: availableDate,
        time_earliest: timeEarliest || null,
        time_latest: timeLatest || null,
        will_travel: willTravel,
        travel_radius_miles: willTravel ? parseInt(travelRadius, 10) || null : null,
        location_id: !willTravel ? location.locationId : null,
        location_name: !willTravel && !location.locationId ? location.location : null,
        opponent_scope: opponentScope,
        age_range_min: ageMin ? parseInt(ageMin, 10) : null,
        age_range_max: ageMax ? parseInt(ageMax, 10) : null,
        notes: notes.trim() || null,
      };

      const res = await fetch("/api/scrimmage-marketplace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }

      // Reset form
      setTeamId("");
      setAvailableDate("");
      setTimeEarliest("");
      setTimeLatest("");
      setWillTravel(false);
      setTravelRadius("25");
      setLocation({ locationId: null, location: "", field: "" });
      setOpponentScope("any");
      setAgeMin("");
      setAgeMax("");
      setNotes("");

      onOpenChange(false);
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create listing");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle
            style={{ fontFamily: "var(--font-display)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "-0.01em" }}
          >
            Post Scrimmage Listing
          </DialogTitle>
          <DialogDescription>
            List your team as available for a scrimmage. Other managers can browse and offer to play.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Team selector */}
          <div>
            <Label className="text-[11px] uppercase tracking-wider">Team</Label>
            {teamsLoading ? (
              <div className="h-9 bg-elevated animate-pulse mt-1" />
            ) : teams.length === 0 ? (
              <p className="text-sm text-muted-foreground mt-1">
                You don&apos;t manage any teams. Ask an admin to assign you as a team manager.
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

          {/* Date */}
          <div>
            <Label className="text-[11px] uppercase tracking-wider">Available Date</Label>
            <Input
              type="date"
              value={availableDate}
              onChange={(e) => setAvailableDate(e.target.value)}
              className="mt-1 h-9"
            />
          </div>

          {/* Time window */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[11px] uppercase tracking-wider">Earliest Time</Label>
              <Input
                type="time"
                value={timeEarliest}
                onChange={(e) => setTimeEarliest(e.target.value)}
                className="mt-1 h-9"
                placeholder="Flexible"
              />
            </div>
            <div>
              <Label className="text-[11px] uppercase tracking-wider">Latest Time</Label>
              <Input
                type="time"
                value={timeLatest}
                onChange={(e) => setTimeLatest(e.target.value)}
                className="mt-1 h-9"
                placeholder="Flexible"
              />
            </div>
          </div>

          {/* Travel toggle */}
          <div>
            <Label className="text-[11px] uppercase tracking-wider mb-2 block">Location</Label>
            <div className="flex items-center gap-3 mb-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="travel"
                  checked={!willTravel}
                  onChange={() => setWillTravel(false)}
                  className="accent-primary"
                />
                <span className="text-sm">Host at our field</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="travel"
                  checked={willTravel}
                  onChange={() => setWillTravel(true)}
                  className="accent-primary"
                />
                <span className="text-sm">Will travel</span>
              </label>
            </div>

            {willTravel ? (
              <div>
                <Label className="text-[11px] uppercase tracking-wider">Travel Radius (miles)</Label>
                <Input
                  type="number"
                  min="1"
                  max="500"
                  value={travelRadius}
                  onChange={(e) => setTravelRadius(e.target.value)}
                  className="mt-1 h-9 w-32"
                />
              </div>
            ) : (
              <LocationPicker
                locationId={location.locationId}
                location={location.location}
                field={location.field}
                onChange={setLocation}
              />
            )}
          </div>

          {/* Opponent scope */}
          <div>
            <Label className="text-[11px] uppercase tracking-wider mb-2 block">Looking For</Label>
            <div className="flex flex-wrap gap-2">
              {(["any", "league", "division"] as const).map((s) => {
                const disabled =
                  s !== "any" && (!selectedTeam?.league_id);
                return (
                  <button
                    key={s}
                    type="button"
                    disabled={disabled}
                    onClick={() => setOpponentScope(s)}
                    className={`px-3 py-1.5 text-xs uppercase tracking-wider border transition-colors duration-100 ${
                      opponentScope === s
                        ? "border-primary bg-primary/10 text-primary"
                        : disabled
                          ? "border-border text-muted-foreground/40 cursor-not-allowed"
                          : "border-border text-muted-foreground hover:border-primary hover:text-primary"
                    }`}
                    style={{ fontFamily: "var(--font-body)" }}
                  >
                    {s === "any" ? "Any team" : s === "league" ? "Same league" : "Same division"}
                  </button>
                );
              })}
            </div>
            {selectedTeam && !selectedTeam.league_id && (
              <p className="text-[10px] text-muted-foreground mt-1">
                This team isn&apos;t in a league, so scope is limited to &quot;Any team&quot;.
              </p>
            )}
          </div>

          {/* Age range with +/- tolerance */}
          <div>
            <Label className="text-[11px] uppercase tracking-wider mb-1 block">
              Age Range Preference
            </Label>
            {selectedTeam?.division_age_range && (
              <p className="text-[10px] text-muted-foreground mb-2">
                Division age range: {selectedTeam.division_age_range}. Adjust below to widen your search.
              </p>
            )}
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="4"
                max="18"
                value={ageMin}
                onChange={(e) => setAgeMin(e.target.value)}
                placeholder="Min"
                className="h-9 w-20"
              />
              <span className="text-muted-foreground">–</span>
              <Input
                type="number"
                min="4"
                max="18"
                value={ageMax}
                onChange={(e) => setAgeMax(e.target.value)}
                placeholder="Max"
                className="h-9 w-20"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <Label className="text-[11px] uppercase tracking-wider">Notes</Label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional details…"
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
            {saving ? "Posting…" : "Post Listing"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
