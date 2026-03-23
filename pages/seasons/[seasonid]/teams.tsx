// pages/seasons/[seasonid]/teams.tsx
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import SeasonProvider, { useSeason } from "@/components/seasons/SeasonProvider";
import SeasonShell from "@/components/seasons/SeasonShell";
import { Users, Trash2, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

// API returns { id, name, league_id, league_name } (id = teamid)
type TeamRow = { id: number; name: string; league_id: number | null; league_name: string | null };

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

function TeamsBody() {
  const { seasonId, season, canEdit } = useSeason();
  const [rows, setRows] = useState<TeamRow[]>([]);
  const [options, setOptions] = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  // Existing-teams picker
  const [showAdd, setShowAdd] = useState(false);
  const [addIds, setAddIds] = useState<Set<number>>(new Set());
  const [adding, setAdding] = useState(false);
  const [addErr, setAddErr] = useState<string | null>(null);

  // Quick-create new team
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createSaving, setCreateSaving] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!seasonId) return;
    let cancelled = false;
    (async () => {
      setLoading(true); setErr(null);
      try {
        const [teamsRes, optionsRes] = await Promise.all([
          fetch(`/api/seasons/${seasonId}/teams`),
          fetch(`/api/seasons/${seasonId}/teams/options`),
        ]);
        const teamsData = teamsRes.ok ? await teamsRes.json() : { teams: [] };
        const optionsData = optionsRes.ok ? await optionsRes.json() : { teams: [] };
        if (!cancelled) {
          setRows(Array.isArray(teamsData?.teams) ? teamsData.teams : []);
          setOptions(Array.isArray(optionsData?.teams) ? optionsData.teams : []);
        }
      } catch (e: unknown) {
        if (!cancelled) setErr((e as Error).message || "Failed to load teams");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [seasonId, version]);

  const openAdd = () => {
    setShowAdd(true);
    setShowCreate(false);
    setAddIds(new Set());
    setAddErr(null);
  };

  const openCreate = () => {
    setShowCreate(true);
    setShowAdd(false);
    setCreateName("");
    setCreateErr(null);
    setTimeout(() => nameRef.current?.focus(), 50);
  };

  const handleAdd = useCallback(async () => {
    if (!seasonId || addIds.size === 0) return;
    setAdding(true); setAddErr(null);
    try {
      const res = await fetch(`/api/seasons/${seasonId}/teams`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamIds: Array.from(addIds) }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setAddIds(new Set());
      setShowAdd(false);
      setVersion((v) => v + 1);
    } catch (e: unknown) {
      setAddErr((e as Error).message || "Failed to add teams");
    } finally {
      setAdding(false);
    }
  }, [seasonId, addIds]);

  const createAndEnroll = async () => {
    if (!seasonId || !season) return;
    setCreateErr(null);
    const name = createName.trim();
    if (!name) { setCreateErr("Team name is required."); return; }
    setCreateSaving(true);
    try {
      // Capitalize season_type: "spring" → "Spring"
      const seasonLabel = season.season_type.charAt(0).toUpperCase() + season.season_type.slice(1);

      // 1. Create the team with league context inferred from this season
      const createRes = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          season: seasonLabel,
          year: season.year,
          leagueId: season.league_id,
          leagueDivisionId: season.league_division_id,
        }),
      });
      const createData = await createRes.json();
      if (!createRes.ok) throw new Error(createData.error || `HTTP ${createRes.status}`);
      const newTeamId: number = createData.id;

      // 2. Enroll the new team in this season
      const enrollRes = await fetch(`/api/seasons/${seasonId}/teams`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamIds: [newTeamId] }),
      });
      const enrollData = await enrollRes.json();
      if (!enrollRes.ok) throw new Error(enrollData.error || `HTTP ${enrollRes.status}`);

      // Optimistically add the new team to the enrolled list (sorted)
      const newRow: TeamRow = { id: newTeamId, name, league_id: season.league_id, league_name: season.league_name };
      setRows((prev) =>
        [...prev, newRow].sort((a, b) => a.name.localeCompare(b.name))
      );

      // Reset and refocus for rapid next entry
      setCreateName("");
      setTimeout(() => nameRef.current?.focus(), 0);
    } catch (e: unknown) {
      setCreateErr((e as Error).message || "Failed to create team.");
    } finally {
      setCreateSaving(false);
    }
  };

  const handleRemove = useCallback(async (teamId: number, name: string) => {
    if (!seasonId) return;
    if (!confirm(`Remove ${name} from this season?`)) return;
    try {
      const res = await fetch(`/api/seasons/${seasonId}/teams/${teamId}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Failed to remove");
      }
      setVersion((v) => v + 1);
    } catch (e: unknown) {
      alert((e as Error).message || "Failed to remove team");
    }
  }, [seasonId]);

  const toggleId = (id: number) => {
    setAddIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Subtitle for the create panel: "SMYB · Mustang 9-10 · Spring 2026"
  const createContext = season
    ? [
        season.league_abbreviation ?? season.league_name,
        season.division_name,
        `${season.season_type.charAt(0).toUpperCase() + season.season_type.slice(1)} ${season.year}`,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;

  const fieldCls =
    "px-3 py-1.5 text-sm bg-input-bg border border-border focus:outline-none focus:border-primary transition-colors duration-100";
  const actionBtnCls =
    "px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.07em] transition-colors duration-100";

  return (
    <div>
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <div>
          <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "20px", textTransform: "uppercase", letterSpacing: "-0.01em" }}>
            Teams
          </h2>
          {!loading && !err && (
            <p className="text-xs text-muted-foreground mt-0.5" style={{ fontFamily: "var(--font-body)" }}>
              {rows.length} team{rows.length !== 1 ? "s" : ""} enrolled
            </p>
          )}
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={showCreate ? () => setShowCreate(false) : openCreate}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors duration-100 border",
                showCreate
                  ? "border-border text-muted-foreground hover:text-foreground"
                  : "bg-primary text-primary-foreground border-primary hover:opacity-90"
              )}
              style={{ fontFamily: "var(--font-body)" }}
            >
              {showCreate ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
              {showCreate ? "Cancel" : "New Team"}
            </button>
            <button
              type="button"
              onClick={showAdd ? () => { setShowAdd(false); setAddIds(new Set()); } : openAdd}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors duration-100 border",
                showAdd
                  ? "border-border text-muted-foreground hover:text-foreground"
                  : "border-border text-foreground hover:bg-elevated"
              )}
              style={{ fontFamily: "var(--font-body)" }}
            >
              {showAdd ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
              {showAdd ? "Cancel" : "Add Teams"}
            </button>
          </div>
        )}
      </div>

      {/* Quick-create form */}
      {showCreate && (
        <div className="mb-5 border border-primary/30 bg-elevated/30">
          <div className="flex items-center justify-between px-4 pt-3 pb-2">
            <div>
              <p
                className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground"
                style={{ fontFamily: "var(--font-body)" }}
              >
                Create new team
              </p>
              {createContext && (
                <p className="text-[10px] text-muted-foreground/60 mt-0.5" style={{ fontFamily: "var(--font-body)" }}>
                  {createContext}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="text-muted-foreground hover:text-foreground transition-colors duration-75"
              title="Close"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
            <input
              ref={nameRef}
              type="text"
              placeholder="Team name"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") createAndEnroll(); }}
              className={cn(fieldCls, "min-w-[200px] flex-1 max-w-xs")}
              style={{ fontFamily: "var(--font-body)" }}
            />
            <button
              type="button"
              onClick={createAndEnroll}
              disabled={createSaving}
              className={cn(actionBtnCls, "bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40")}
              style={{ fontFamily: "var(--font-body)" }}
            >
              {createSaving ? "Saving…" : "Save"}
            </button>
            {createErr && (
              <span className="text-xs text-destructive" style={{ fontFamily: "var(--font-body)" }}>{createErr}</span>
            )}
          </div>
          <p className="px-4 pb-2 text-[10px] text-muted-foreground/50" style={{ fontFamily: "var(--font-body)" }}>
            Press Enter or click Save. The form resets so you can add the next team right away.
          </p>
        </div>
      )}

      {/* Add-existing picker */}
      {showAdd && (
        <div className="mb-5 p-4 border border-border bg-card">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-3" style={{ fontFamily: "var(--font-body)" }}>
            Add existing teams to season
          </p>
          {addErr && (
            <p className="text-xs text-destructive mb-2" style={{ fontFamily: "var(--font-body)" }}>{addErr}</p>
          )}
          {options.length === 0 ? (
            <p className="text-sm text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
              No eligible teams available. Use <strong>New Team</strong> to create teams for this league.
            </p>
          ) : (
            <>
              <div className="space-y-1.5 max-h-48 overflow-y-auto mb-3">
                {options.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => toggleId(o.id)}
                    className={cn(
                      "w-full text-left px-3 py-2 text-sm border transition-colors duration-100 flex items-center gap-2",
                      addIds.has(o.id)
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border hover:border-primary/40 hover:bg-elevated text-foreground"
                    )}
                    style={{ fontFamily: "var(--font-body)" }}
                  >
                    <input type="checkbox" checked={addIds.has(o.id)} readOnly className="accent-primary shrink-0" />
                    {o.name}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={handleAdd}
                disabled={adding || addIds.size === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors duration-100 border bg-primary text-primary-foreground border-primary hover:opacity-90 disabled:opacity-40"
                style={{ fontFamily: "var(--font-body)" }}
              >
                {adding
                  ? "Adding…"
                  : `Add ${addIds.size > 0 ? addIds.size + " " : ""}Team${addIds.size !== 1 ? "s" : ""}`}
              </button>
            </>
          )}
        </div>
      )}

      {loading ? (
        <div className="space-y-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-10 bg-elevated animate-pulse" />
          ))}
        </div>
      ) : err ? (
        <div className="border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{err}</div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border/60">
          <Users className="h-8 w-8 text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium text-foreground mb-1" style={{ fontFamily: "var(--font-display)", textTransform: "uppercase" }}>
            No Teams Yet
          </p>
          <p className="text-xs text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
            Use <strong>New Team</strong> to create teams for this league, or <strong>Add Teams</strong> to enroll existing ones.
          </p>
        </div>
      ) : (
        <div className="border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface">
                <th className="text-left p-3 pl-4 label-section">Team</th>
                {canEdit && <th className="w-12"></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-border/50 last:border-0 hover:bg-elevated transition-colors duration-100"
                >
                  <td className="p-3 pl-4">
                    <div className="flex items-center gap-3">
                      <TeamBadge name={r.name} />
                      <Link
                        href={`/teams/${r.id}?returnTo=/seasons/${seasonId}/teams`}
                        className="font-medium text-foreground hover:text-primary transition-colors duration-100"
                        style={{ fontFamily: "var(--font-body)" }}
                      >
                        {r.name}
                      </Link>
                    </div>
                  </td>
                  {canEdit && (
                    <td className="p-3 pr-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleRemove(r.id, r.name)}
                        className="h-9 w-9 md:h-7 md:w-7 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
                        title="Remove from season"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function TeamsPage() {
  return (
    <SeasonProvider>
      <SeasonShell tab="teams">
        <TeamsBody />
      </SeasonShell>
    </SeasonProvider>
  );
}
