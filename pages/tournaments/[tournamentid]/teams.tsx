// pages/tournaments/[tournamentid]/teams.tsx
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import TournamentProvider, { useTournament } from "@/components/tournaments/TournamentProvider";
import TournamentShell from "@/components/tournaments/TournamentShell";
import AddTeamsModal from "@/components/AddTeamsModal";
import SwapTeamModal from "@/components/SwapTeamModal";
import { Users, MoreVertical, Trash2, RefreshCw, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import type { TournamentTeamStats } from "@/pages/api/tournaments/[tournamentid]/team-stats";
import { ALL_GAME_SOURCES, formatRecord, sumRecord, type TeamWLT } from "@/lib/teams/gameSources";

type TeamRow = { id?: number; name: string; season: string; pool_group: string | null };

/** Which games the Record column counts. */
type RecordMode = "overall" | "tournament";

const RECORD_MODE_LABELS: Record<RecordMode, string> = {
  overall: "Overall",
  tournament: "This Tournament",
};

const RECORD_MODE_HINTS: Record<RecordMode, string> = {
  overall: "W-L-T across every tournament, league game and scrimmage",
  tournament: "W-L-T in this tournament only",
};

/**
 * Overall vs. tournament-only record. Two mutually exclusive chips rather than
 * the per-source toggles used for prediction — here the question is simply
 * "this tournament, or everything".
 */
function RecordModeToggle({
  value,
  onChange,
}: {
  value: RecordMode;
  onChange: (mode: RecordMode) => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="label-section shrink-0" style={{ fontFamily: "var(--font-body)" }}>
        Record
      </span>
      <div className="flex items-center gap-1 flex-wrap">
        {(Object.keys(RECORD_MODE_LABELS) as RecordMode[]).map((mode) => {
          const active = mode === value;
          return (
            <button
              key={mode}
              type="button"
              aria-pressed={active}
              title={RECORD_MODE_HINTS[mode]}
              onClick={() => onChange(mode)}
              className={cn(
                "px-2.5 py-1 text-[11px] border transition-colors duration-100 leading-none",
                active
                  ? "border-primary bg-primary text-primary-foreground font-semibold"
                  : "border-border bg-input-bg text-muted-foreground hover:border-primary/60 hover:text-foreground"
              )}
              style={{ fontFamily: "var(--font-display)", letterSpacing: "0.06em" }}
            >
              {RECORD_MODE_LABELS[mode]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TeamBadge({ name }: { name: string }) {
  const initials = name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  return (
    <div
      className="h-8 w-8 flex items-center justify-center shrink-0 bg-primary text-primary-foreground text-xs font-bold"
      style={{ fontFamily: "var(--font-display)", letterSpacing: "0.02em" }}
    >
      {initials}
    </div>
  );
}

/** Constrained group picker — inline chip buttons, one per group.
 *  Clicking the active chip deselects (sets null). No dropdown = no z-index/event issues.
 */
function GroupPicker({
  value,
  numGroups,
  onSave,
}: {
  value: string | null;
  numGroups: number;
  onSave: (group: string | null) => void;
}) {
  const options = Array.from({ length: numGroups }, (_, i) => String(i + 1));
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {options.map((opt) => {
        const active = opt === value;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onSave(active ? null : opt)}
            className={cn(
              "px-2.5 py-1 text-[11px] border transition-colors duration-100 leading-none",
              active
                ? "border-primary bg-primary text-primary-foreground font-semibold"
                : "border-border bg-input-bg text-muted-foreground hover:border-primary/60 hover:text-foreground",
            )}
            style={{ fontFamily: "var(--font-display)", letterSpacing: "0.06em" }}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function GroupSectionHeader({ label, count, colSpan = 4 }: { label: string; count: number; colSpan?: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 pt-4 pb-1.5 bg-surface border-b border-border">
        <div className="flex items-center gap-3">
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: "11px",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--primary)",
            }}
          >
            {label}
          </span>
          <span className="text-[10px] text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
            {count} team{count !== 1 ? "s" : ""}
          </span>
        </div>
      </td>
    </tr>
  );
}

function TeamsBody() {
  const { tid, t, canEdit, refreshSetup } = useTournament();
  const numGroups = (t?.num_pool_groups ?? 0) >= 2 ? (t!.num_pool_groups as number) : null;
  const [rows, setRows] = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [localGroups, setLocalGroups] = useState<Record<number, string | null>>({});
  const [teamStats, setTeamStats] = useState<TournamentTeamStats[]>([]);
  const [recordMode, setRecordMode] = useState<RecordMode>("overall");
  
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [teamToRemove, setTeamToRemove] = useState<TeamRow | null>(null);
  const [removeImpact, setRemoveImpact] = useState<{ poolGames: number; bracketAssignments: number } | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  
  const [swapModalOpen, setSwapModalOpen] = useState(false);
  const [teamToSwap, setTeamToSwap] = useState<TeamRow | null>(null);

  useEffect(() => {
    if (!tid) return;
    let cancelled = false;
    (async () => {
      setLoading(true); setErr(null);
      try {
        const res = await fetch(`/api/tournaments/${tid}/teams`);
        const text = await res.text();
        if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
        const payload = text ? JSON.parse(text) : [];
        const data: TeamRow[] = Array.isArray(payload) ? payload : (payload?.rows ?? []);
        if (!cancelled) {
          setRows(data);
          // reset local group cache when data reloads
          setLocalGroups({});
        }
      } catch (e: unknown) {
        if (!cancelled) setErr((e as Error).message || "Failed to load teams");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tid, version]);

  // Cross-source game history for every enrolled team, plus this tournament’s own
  // W-L-T. Both arrive in one payload, so flipping the toggle is local.
  useEffect(() => {
    if (!tid) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/tournaments/${tid}/team-stats`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setTeamStats(Array.isArray(data?.teams) ? data.teams : []);
      } catch {
        if (!cancelled) setTeamStats([]);
      }
    })();
    return () => { cancelled = true; };
  }, [tid, version]);

  const saveGroup = useCallback(
    async (teamId: number, group: string | null) => {
      if (!tid) return;
      setLocalGroups((prev) => ({ ...prev, [teamId]: group }));
      try {
        await fetch(`/api/tournaments/${tid}/teams/${teamId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pool_group: group }),
        });
      } catch {
        setLocalGroups((prev) => {
          const next = { ...prev };
          delete next[teamId];
          return next;
        });
      }
    },
    [tid]
  );

  const handleRemoveClick = useCallback(
    async (team: TeamRow) => {
      if (!tid || !team.id) return;
      setTeamToRemove(team);
      setRemoveError(null);
      try {
        const res = await fetch(`/api/tournaments/${tid}/teams/${team.id}/impact`);
        if (res.ok) {
          const data = await res.json();
          setRemoveImpact(data);
        } else {
          setRemoveImpact({ poolGames: 0, bracketAssignments: 0 });
        }
      } catch {
        setRemoveImpact({ poolGames: 0, bracketAssignments: 0 });
      }
      setRemoveDialogOpen(true);
    },
    [tid]
  );

  const handleRemoveConfirm = useCallback(async () => {
    if (!tid || !teamToRemove?.id) return;
    setRemoving(true);
    setRemoveError(null);
    try {
      const res = await fetch(`/api/tournaments/${tid}/teams/${teamToRemove.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setRemoveDialogOpen(false);
      setVersion((v) => v + 1);
      refreshSetup();
    } catch (e) {
      setRemoveError(e instanceof Error ? e.message : "Failed to remove team");
    } finally {
      setRemoving(false);
    }
  }, [tid, teamToRemove, refreshSetup]);

  const handleSwapClick = useCallback(
    (team: TeamRow) => {
      if (!team.id) return;
      setTeamToSwap(team);
      setSwapModalOpen(true);
    },
    []
  );

  const handleSwapped = useCallback(() => {
    setVersion((v) => v + 1);
  }, []);

  const mergedRows: TeamRow[] = rows.map((r) =>
    r.id != null && r.id in localGroups
      ? { ...r, pool_group: localGroups[r.id!] }
      : r
  );

  const records = new Map<number, TeamWLT>(
    teamStats.map((ts) => [
      ts.teamid,
      recordMode === "tournament"
        ? ts.tournamentRecord
        : sumRecord(Object.values(ts.bySource), ALL_GAME_SOURCES),
    ])
  );

  const existingGroups = Array.from(
    new Set(mergedRows.map((r) => r.pool_group).filter(Boolean) as string[])
  ).sort();

  const hasGroups = existingGroups.length > 0;

  type Section = { key: string; label: string; rows: TeamRow[] };
  const sections: Section[] = hasGroups
    ? [
        ...existingGroups.map((g) => ({
          key: g,
          label: `Group ${g}`,
          rows: mergedRows.filter((r) => r.pool_group === g),
        })),
        {
          key: "__unassigned__",
          label: "Unassigned",
          rows: mergedRows.filter((r) => !r.pool_group),
        },
      ].filter((s) => s.rows.length > 0)
    : [{ key: "__all__", label: "", rows: mergedRows }];

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "20px", textTransform: "uppercase", letterSpacing: "-0.01em" }}>
            Teams
          </h2>
          {!loading && !err && (
            <p className="text-xs text-muted-foreground mt-0.5" style={{ fontFamily: "var(--font-body)" }}>
              {mergedRows.length} team{mergedRows.length !== 1 ? "s" : ""} enrolled
              {numGroups != null && hasGroups && ` · ${existingGroups.length} of ${numGroups} group${numGroups !== 1 ? "s" : ""} assigned`}
            </p>
          )}
        </div>
        {canEdit && tid && <AddTeamsModal tournamentid={tid} onAdded={() => { setVersion((v) => v + 1); refreshSetup(); }} />}
      </div>

      {numGroups != null && (
        <p className="text-xs text-muted-foreground mb-3" style={{ fontFamily: "var(--font-body)" }}>
          Assign each team to one of the <strong>{numGroups}</strong> pool groups. To change the number of groups, update the tournament settings.
        </p>
      )}

      <div className="mb-4">
        <RecordModeToggle value={recordMode} onChange={setRecordMode} />
      </div>

      {loading ? (
        <div className="space-y-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-10 bg-elevated animate-pulse" />
          ))}
        </div>
      ) : err ? (
        <div className="border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{err}</div>
      ) : mergedRows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border/60">
          <Users className="h-8 w-8 text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium text-foreground mb-1" style={{ fontFamily: "var(--font-display)", textTransform: "uppercase" }}>
            No Teams Yet
          </p>
          <p className="text-xs text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
            Add teams to get started with pool play.
          </p>
        </div>
      ) : (
        <div className="border border-border overflow-x-auto">
          <table className="w-full min-w-[660px] text-sm">
            <thead>
              <tr className="border-b border-border bg-surface">
                <th className="text-left p-3 pl-4 label-section">Team</th>
                <th className="text-left p-3 label-section w-24" title={RECORD_MODE_HINTS[recordMode]}>Record</th>
                <th className="text-left p-3 label-section">Season</th>
                {numGroups != null && (
                  <th className="text-left p-3 label-section w-28">Group</th>
                )}
                <th className="w-12"></th>
              </tr>
            </thead>
            <tbody>
              {sections.map((section) => (
                <>
                  {section.key !== "__all__" && (
                    <GroupSectionHeader
                      key={`hdr-${section.key}`}
                      label={section.label}
                      count={section.rows.length}
                      colSpan={numGroups != null ? 5 : 4}
                    />
                  )}
                  {section.rows.map((r, i) => (
                    <tr
                      key={r.id ?? i}
                      className={cn(
                        "border-b border-border/50 last:border-0 hover:bg-elevated transition-colors duration-100",
                        section.key === "__unassigned__" && hasGroups && "opacity-70"
                      )}
                    >
                      <td className="p-3 pl-4">
                        <div className="flex items-center gap-3">
                          <TeamBadge name={r.name} />
                          {r.id != null ? (
                            <Link
                              href={`/teams/${r.id}?returnTo=${encodeURIComponent(`/tournaments/${tid}/teams`)}`}
                              className="font-medium text-foreground hover:text-primary transition-colors duration-100"
                              style={{ fontFamily: "var(--font-body)" }}
                            >
                              {r.name}
                            </Link>
                          ) : (
                            <span className="font-medium" style={{ fontFamily: "var(--font-body)" }}>{r.name}</span>
                          )}
                        </div>
                      </td>
                      <td
                        className="p-3 tabular-nums text-muted-foreground text-xs"
                        style={{ fontFamily: "var(--font-body)" }}
                        title={RECORD_MODE_HINTS[recordMode]}
                      >
                        {r.id != null ? formatRecord(records.get(r.id)) : "—"}
                      </td>
                      <td className="p-3 text-muted-foreground text-xs" style={{ fontFamily: "var(--font-body)" }}>{r.season}</td>
                      {numGroups != null && (
                        <td className="p-3">
                          {r.id != null ? (
                            <GroupPicker
                              value={r.pool_group}
                              numGroups={numGroups}
                              onSave={(g) => saveGroup(r.id!, g)}
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground/50">—</span>
                          )}
                        </td>
                      )}
                      <td className="p-3 pr-4">
                        {canEdit && r.id != null && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                className="h-8 w-8 flex items-center justify-center rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                                aria-label="Team actions"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleSwapClick(r)}>
                                <RefreshCw className="h-3.5 w-3.5 mr-2" />
                                Swap team
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleRemoveClick(r)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-2" />
                                Remove from tournament
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </td>
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {teamToRemove && (
        <AlertDialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle style={{ fontFamily: "var(--font-display)", textTransform: "uppercase" }}>
                Remove {teamToRemove.name}?
              </AlertDialogTitle>
              <AlertDialogDescription style={{ fontFamily: "var(--font-body)" }}>
                This will remove the team from this tournament.
                {removeImpact && (removeImpact.poolGames > 0 || removeImpact.bracketAssignments > 0) && (
                  <>
                    {" This will delete:"}
                    <ul className="mt-2 space-y-1 text-sm">
                      {removeImpact.poolGames > 0 && (
                        <li>• {removeImpact.poolGames} pool game{removeImpact.poolGames !== 1 ? "s" : ""}</li>
                      )}
                      {removeImpact.bracketAssignments > 0 && (
                        <li>• {removeImpact.bracketAssignments} bracket assignment{removeImpact.bracketAssignments !== 1 ? "s" : ""}</li>
                      )}
                    </ul>
                  </>
                )}
                <p className="mt-3 text-sm font-medium">This action cannot be undone.</p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            {removeError && (
              <div className="flex items-start gap-2 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{removeError}</span>
              </div>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={removing}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleRemoveConfirm}
                disabled={removing}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {removing ? "Removing…" : "Remove Team"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {teamToSwap && tid && (
        <SwapTeamModal
          open={swapModalOpen}
          onOpenChange={setSwapModalOpen}
          tournamentId={tid}
          currentTeam={{
            id: teamToSwap.id!,
            name: teamToSwap.name,
            season: teamToSwap.season,
          }}
          onSwapped={handleSwapped}
        />
      )}
    </div>
  );
}

export default function TeamsPage() {
  return (
    <TournamentProvider>
      <TournamentShell tab="teams">
        <TeamsBody />
      </TournamentShell>
    </TournamentProvider>
  );
}
