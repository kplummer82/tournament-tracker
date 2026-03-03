"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useEffect, useMemo, useState } from "react";

type AddGameModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tournamentId: number;
  onAdded?: () => void;
  initial?: {
    id?: number;
    gamedate?: string;   // "YYYY-MM-DD"
    gametime?: string;   // "HH:MM" or "HH:MM:SS"
    hometeam?: string;   // team name
    awayteam?: string;   // team name
    homescore?: number | null;
    awayscore?: number | null;
    gamestatusid?: number | null;
  };
};

type TeamOpt = { id: number; name: string; pool_group: string | null };
type StatusOpt = { id: number; name: string };

export default function AddGameModal({
  open,
  onOpenChange,
  tournamentId,
  onAdded,
  initial,
}: AddGameModalProps) {
  const isEdit = !!initial?.id;

  // lookups
  const [teams, setTeams] = useState<TeamOpt[]>([]);
  const [statuses, setStatuses] = useState<StatusOpt[]>([]);

  // form values (store TEAM IDS, show names)
  const [date, setDate] = useState(initial?.gamedate ?? "");
  const [time, setTime] = useState(initial?.gametime ? initial.gametime.slice(0, 5) : "");
  const [homeId, setHomeId] = useState<string>("");
  const [awayId, setAwayId] = useState<string>("");
  const [homeScore, setHomeScore] = useState(initial?.homescore != null ? String(initial.homescore) : "");
  const [awayScore, setAwayScore] = useState(initial?.awayscore != null ? String(initial.awayscore) : "");
  const [statusId, setStatusId] = useState(initial?.gamestatusid != null ? String(initial.gamestatusid) : "");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // prefill modal when in edit mode
useEffect(() => {
  if (!open) return;

  if (isEdit && initial) {
    setDate(initial.gamedate ? initial.gamedate.slice(0, 10) : ""); // 👈
    setTime(initial.gametime ? initial.gametime.slice(0, 5) : "");
    setHomeScore(initial.homescore != null ? String(initial.homescore) : "");
    setAwayScore(initial.awayscore != null ? String(initial.awayscore) : "");
    if (initial.gamestatusid != null) setStatusId(String(initial.gamestatusid));
  } else {
    setDate("");
    setTime("");
    setHomeScore("");
    setAwayScore("");
    setStatusId("");
  }
}, [open, isEdit, initial]);

  
  // reset transient state when modal closes
  useEffect(() => {
    if (!open) {
      setSaving(false);
      setError("");
    }
  }, [open]);

  // load teams (from tournamentteams_view) + statuses when opened
  useEffect(() => {
    if (!open) return;

    (async () => {
      try {
        setError("");

        // Teams restricted to this tournament
        const tRes = await fetch(`/api/tournaments/${tournamentId}/teams/options`, { cache: "no-store" });
        const tJson = await tRes.json();
        const teamOpts: TeamOpt[] = Array.isArray(tJson?.teams) ? tJson.teams : [];
        setTeams(teamOpts);

        // If editing and we were given names, pre-select ids that match
        if (isEdit && initial?.hometeam && initial?.awayteam) {
          const h = teamOpts.find((x) => x.name === initial.hometeam);
          const a = teamOpts.find((x) => x.name === initial.awayteam);
          if (h) setHomeId(String(h.id));
          if (a) setAwayId(String(a.id));
        }

        // -------------------------------
        // Game statuses from gamestatusoptions
        // Expecting array like:
        //   [{ id: number, gamestatus: string, gamestatusdescription?: string }, ...]
        // -------------------------------
        let mapped: StatusOpt[] = [];
        try {
          const sRes = await fetch(`/api/gamestatusoptions`, { cache: "no-store" });
          if (sRes.ok) {
            const sJson = await sRes.json();
            const arr: any[] =
              Array.isArray(sJson?.statuses)
                ? sJson.statuses
                : Array.isArray(sJson)
                ? (sJson as any[])
                : [];

            mapped = arr
              .map((x) => ({
                id: Number(x.id ?? x.gamestatusid ?? 0),
                name: String(x.name ?? x.gamestatus ?? x.status ?? "").trim(),
              }))
              .filter((x) => x.id && x.name);

            // Sort by id for stable ordering (you can change to name localeCompare if preferred)
            mapped.sort((a, b) => a.id - b.id);
          }
        } catch {
          // ignore and use fallback below
        }

        // Fallbacks (legacy endpoint or hardcoded)
        if (!mapped.length) {
          try {
            const legacy = await fetch(`/api/gamestatuses`, { cache: "no-store" });
            if (legacy.ok) {
              const j = await legacy.json();
              const arr: any[] = Array.isArray(j?.statuses) ? j.statuses : Array.isArray(j) ? j : [];
              mapped = arr
                .map((x) => ({
                  id: Number(x.id ?? x.gamestatusid ?? 0),
                  name: String(x.name ?? x.gamestatus ?? "").trim(),
                }))
                .filter((x) => x.id && x.name);
            }
          } catch {
            // ignore
          }
        }

        if (!mapped.length) {
          mapped = [
            { id: 1, name: "Scheduled" },
            { id: 2, name: "Completed" },
            { id: 3, name: "In Progress" },
          ];
        }

        setStatuses(mapped);

        // Preselect only if empty
        // Edit mode: prefill effect already set it.
        if (!isEdit && !statusId && mapped.length) {
          setStatusId(String(mapped[0].id));
        }
      } catch (e) {
        console.error(e);
        setError("Failed to load teams/statuses.");
      }
    })();
  }, [open, tournamentId, isEdit, initial?.hometeam, initial?.awayteam]);

  // Compute valid away options for a given homeId.
  // Rules: exclude the home team itself; when pool groups exist, restrict to same group.
  const getAwayOptions = (forHomeId: string): TeamOpt[] => {
    if (!forHomeId) return [];
    const homeTeam = teams.find((t) => String(t.id) === forHomeId);
    const hasGroups = teams.some((t) => t.pool_group != null);
    return teams.filter((t) => {
      if (String(t.id) === forHomeId) return false;
      if (!hasGroups || homeTeam?.pool_group == null) return true;
      return t.pool_group === homeTeam.pool_group;
    });
  };

  const awayOptions = useMemo(() => getAwayOptions(homeId), [homeId, teams]);

  const hasGroups = teams.some((t) => t.pool_group != null);

  const handleHomeChange = (newHomeId: string) => {
    setHomeId(newHomeId);
    // Clear away selection if it's no longer valid for the new home team
    if (awayId) {
      const stillValid = getAwayOptions(newHomeId).some((t) => String(t.id) === awayId);
      if (!stillValid) setAwayId("");
    }
  };

  const canSave = useMemo(() => {
    return (
      !!date && !!time && !!homeId && !!awayId && homeId !== awayId && !!statusId &&
      awayOptions.some((t) => String(t.id) === awayId)
    );
  }, [date, time, homeId, awayId, statusId, awayOptions]);

  const handleClose = () => onOpenChange(false);

  const handleSave = async () => {
    if (!canSave) {
      if (homeId && awayId && homeId === awayId) {
        setError("Home and away teams must be different.");
      } else {
        setError("Fill all fields.");
      }
      return;
    }

    try {
      setSaving(true);
      setError("");

      // POST uses team names (poolgames_view); PUT uses team IDs (tournamentgames)
      const homeName = teams.find((t) => String(t.id) === homeId)?.name || "";
      const awayName = teams.find((t) => String(t.id) === awayId)?.name || "";

      const basePayload = {
        gamedate: date,
        gametime: time.length === 5 ? `${time}:00` : time,
        homescore: homeScore === "" ? null : Number(homeScore),
        awayscore: awayScore === "" ? null : Number(awayScore),
        gamestatusid: Number(statusId),
      };

      if (isEdit && initial?.id) {
        const putPayload = {
          id: initial.id,
          home: Number(homeId),
          away: Number(awayId),
          ...basePayload,
        };
        const res = await fetch(`/api/tournaments/${tournamentId}/poolgames`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(putPayload),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j?.error || "Save failed");
        if (res.ok && j?.message) {
          setError(j.message);
          setSaving(false);
          return;
        }
      } else {
        const postPayload = {
          hometeam: homeName,
          awayteam: awayName,
          ...basePayload,
        };
        const res = await fetch(`/api/tournaments/${tournamentId}/poolgames`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(postPayload),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j?.error || "Save failed");
      }

      onAdded?.();
      onOpenChange(false);
    } catch (e: any) {
      console.error(e);
      setError(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl rounded-none">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "20px", textTransform: "uppercase", letterSpacing: "-0.01em" }}>
            {isEdit ? "Edit Game" : "Add Pool Game"}
          </DialogTitle>
          <DialogDescription style={{ fontFamily: "var(--font-body)", fontSize: "13px" }}>
            {isEdit ? "Update the details for this pool game." : "Schedule a new pool play game for this tournament."}
          </DialogDescription>
        </DialogHeader>

        {/* FORM */}
        <div className="space-y-4">
          {/* Schedule */}
          <div>
            <p className="label-section mb-3">Schedule</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="label-section">Date</label>
                <input
                  type="date"
                  className="w-full border border-border bg-input px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="label-section">Time</label>
                <input
                  type="time"
                  className="w-full border border-border bg-input px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Teams */}
          <div>
            <p className="label-section mb-3">Teams</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="label-section">Home</label>
                <select
                  className="w-full rounded-lg border border-border/70 bg-input px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                  value={homeId}
                  onChange={(e) => handleHomeChange(e.target.value)}
                >
                  <option value="" disabled>Select team…</option>
                  {teams.map((t) => (
                    <option key={t.id} value={String(t.id)}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="label-section">Away</label>
                <select
                  className="w-full rounded-lg border border-border/70 bg-input px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  value={awayId}
                  disabled={!homeId}
                  onChange={(e) => setAwayId(e.target.value)}
                >
                  <option value="" disabled>
                    {!homeId ? "Select home team first…" : "Select team…"}
                  </option>
                  {awayOptions.map((t) => (
                    <option key={t.id} value={String(t.id)}>{t.name}</option>
                  ))}
                </select>
                {homeId && hasGroups && (
                  <p className="text-[10px] text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
                    Only teams in the same pool group are shown.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Scores + Status */}
          <div>
            <p className="label-section mb-3">Score &amp; Status</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="label-section">Home score</label>
                <input
                  inputMode="numeric"
                  placeholder="—"
                  className="w-full rounded-lg border border-border/70 bg-input px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                  value={homeScore}
                  onChange={(e) => setHomeScore(e.target.value.replace(/[^\d-]/g, ""))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="label-section">Away score</label>
                <input
                  inputMode="numeric"
                  placeholder="—"
                  className="w-full rounded-lg border border-border/70 bg-input px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                  value={awayScore}
                  onChange={(e) => setAwayScore(e.target.value.replace(/[^\d-]/g, ""))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="label-section">Status</label>
                <select
                  className="w-full rounded-lg border border-border/70 bg-input px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                  value={statusId}
                  onChange={(e) => setStatusId(e.target.value)}
                >
                  <option value="" disabled>Select…</option>
                  {statuses.map((s) => (
                    <option key={s.id} value={String(s.id)}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <button
            type="button"
            onClick={handleClose}
            disabled={saving}
            className="px-4 py-2 text-[11px] uppercase tracking-[0.08em] border border-border text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors duration-100"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !canSave}
            className="px-4 py-2 text-[11px] uppercase tracking-[0.08em] bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 transition-opacity duration-100"
            style={{ fontFamily: "var(--font-body)" }}
          >
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Add Game"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
