// pages/tournaments/[tournamentid]/pool.tsx
import { useEffect, useState } from "react";
import Link from "next/link";
import TournamentProvider, { useTournament } from "@/components/tournaments/TournamentProvider";
import TournamentShell from "@/components/tournaments/TournamentShell";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Swords, ExternalLink } from "lucide-react";
import AddGameModal from "@/components/AddGameModal";
import PoolGameDeleteButton from "@/components/PoolGameDeleteButton";
import { formatMMDDYY, formatHHMMAMPM } from "@/lib/datetime";
import { cn } from "@/lib/utils";

type PoolGameRow = {
  id: number;
  tournamentid: number;
  hometeam: string;
  awayteam: string;
  gamedate: string;
  gametime: string;
  homescore: number | null;
  awayscore: number | null;
  gamestatus: string | null;
  gamestatusid?: number | null;
};

type TournamentTeamRow = { id: number; name: string; pool_group: string | null };

function ScoreCell({ score, isWinner }: { score: number | null; isWinner?: boolean }) {
  if (score == null) return <span className="text-muted-foreground/40">—</span>;
  return (
    <span
      className={cn("tabular-nums", isWinner ? "text-primary" : "text-foreground/60")}
      style={{
        fontFamily: "var(--font-display)",
        fontWeight: isWinner ? 800 : 600,
        fontSize: "20px",
        letterSpacing: "-0.02em",
        lineHeight: 1,
      }}
    >
      {score}
    </span>
  );
}

function PoolBody() {
  const { tid } = useTournament();
  const [rows, setRows] = useState<PoolGameRow[]>([]);
  const [teamRows, setTeamRows] = useState<TournamentTeamRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editInit, setEditInit] = useState<PoolGameRow | undefined>(undefined);

  const openEdit = (g: PoolGameRow) => {
    setEditInit({ ...g, gamedate: g.gamedate ? g.gamedate.slice(0, 10) : "" });
    setEditOpen(true);
  };

  useEffect(() => {
    if (!tid) return;
    let cancelled = false;
    (async () => {
      setLoading(true); setErr(null);
      try {
        const [gamesRes, teamsRes] = await Promise.all([
          fetch(`/api/tournaments/${tid}/poolgames`, {
            method: "GET",
            headers: { Accept: "application/json" },
            cache: "no-store",
          }),
          fetch(`/api/tournaments/${tid}/teams`, { cache: "no-store" }),
        ]);
        const ct = gamesRes.headers.get("content-type") || "";
        if (!gamesRes.ok) {
          if (ct.includes("application/json")) throw new Error((await gamesRes.json())?.error || `HTTP ${gamesRes.status}`);
          await gamesRes.text();
          throw new Error(`HTTP ${gamesRes.status}`);
        }
        const gamesData = await gamesRes.json();
        const teamsData = teamsRes.ok ? await teamsRes.json() : [];
        if (!cancelled) {
          setRows(Array.isArray(gamesData?.games) ? gamesData.games : []);
          setTeamRows(Array.isArray(teamsData) ? teamsData : (teamsData?.rows ?? []));
        }
      } catch (e: unknown) {
        if (!cancelled) { setErr((e as Error).message || "Failed to load pool games"); setRows([]); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tid, version]);

  // Build name → pool_group and name → id maps from team data
  const teamGroupMap = new Map<string, string | null>(
    teamRows.map((t) => [t.name, t.pool_group ?? null])
  );
  const teamIdMap = new Map<string, number>(
    teamRows.map((t) => [t.name, t.id])
  );

  // Determine pool group for a game (inferred from home team's group)
  const gameGroup = (g: PoolGameRow): string | null =>
    teamGroupMap.get(g.hometeam) ?? teamGroupMap.get(g.awayteam) ?? null;

  const hasGroups = teamRows.some((t) => t.pool_group != null);

  // Build sections
  type GameSection = { key: string; label: string; games: PoolGameRow[] };
  const sections: GameSection[] = (() => {
    if (!hasGroups) return [{ key: "__all__", label: "", games: rows }];
    const groups = Array.from(
      new Set(teamRows.map((t) => t.pool_group).filter(Boolean) as string[])
    ).sort();
    const result: GameSection[] = groups.map((g) => ({
      key: g,
      label: `Group ${g} Games`,
      games: rows.filter((row) => gameGroup(row) === g),
    }));
    const ungrouped = rows.filter((row) => !gameGroup(row));
    if (ungrouped.length > 0) {
      result.push({ key: "__other__", label: "Other Games", games: ungrouped });
    }
    return result.filter((s) => s.games.length > 0);
  })();

  const renderGameRows = (gameList: PoolGameRow[]) =>
    gameList.map((g) => {
      const hasScore = g.homescore != null && g.awayscore != null;
      const homeWon = hasScore && g.homescore! > g.awayscore!;
      const awayWon = hasScore && g.awayscore! > g.homescore!;
      return (
        <tr key={g.id} className="border-b border-border/50 last:border-0 hover:bg-elevated transition-colors duration-100">
          <td className="p-3 text-xs text-muted-foreground whitespace-nowrap" style={{ fontFamily: "var(--font-body)", fontVariantNumeric: "tabular-nums" }}>
            {formatMMDDYY(g.gamedate)}
          </td>
          <td className="p-3 text-xs text-muted-foreground whitespace-nowrap" style={{ fontFamily: "var(--font-body)", fontVariantNumeric: "tabular-nums" }}>
            {formatHHMMAMPM(g.gamedate, g.gametime)}
          </td>
          <td className="p-3 font-medium" style={{ fontFamily: "var(--font-body)" }}>
            {teamIdMap.has(g.hometeam) ? (
              <Link href={`/teams/${teamIdMap.get(g.hometeam)}?returnTo=/tournaments/${tid}/pool`} className="hover:text-primary transition-colors duration-100">
                {g.hometeam}
              </Link>
            ) : g.hometeam}
          </td>
          <td className="p-3 font-medium" style={{ fontFamily: "var(--font-body)" }}>
            {teamIdMap.has(g.awayteam) ? (
              <Link href={`/teams/${teamIdMap.get(g.awayteam)}?returnTo=/tournaments/${tid}/pool`} className="hover:text-primary transition-colors duration-100">
                {g.awayteam}
              </Link>
            ) : g.awayteam}
          </td>
          <td className="p-3">
            <span className="inline-flex items-baseline gap-2">
              <ScoreCell score={g.homescore} isWinner={homeWon} />
              {hasScore && <span className="text-muted-foreground/30 text-xs">–</span>}
              <ScoreCell score={g.awayscore} isWinner={awayWon} />
            </span>
          </td>
          <td className="p-3">
            {g.gamestatus && (
              <span className="badge" style={{ background: "#5a5a5a18", color: "#8a8a8a", borderColor: "#5a5a5a30" }}>
                {g.gamestatus}
              </span>
            )}
          </td>
          <td className="p-3">
            <div className="flex items-center justify-end gap-1">
              <Link
                href={`/games/tournament/${g.id}`}
                className="h-7 w-7 flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
                title="Manage game"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground rounded-none"
                title="Edit game"
                onClick={() => openEdit(g)}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              {tid && (
                <PoolGameDeleteButton
                  tournamentId={tid}
                  gameId={g.id}
                  onDeleted={(id) => setRows((prev) => prev.filter((x) => x.id !== id))}
                />
              )}
            </div>
          </td>
        </tr>
      );
    });

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "20px", textTransform: "uppercase", letterSpacing: "-0.01em" }}>
            Pool Play
          </h2>
          {!loading && !err && (
            <p className="text-xs text-muted-foreground mt-0.5" style={{ fontFamily: "var(--font-body)" }}>
              {rows.length} game{rows.length !== 1 ? "s" : ""}
              {hasGroups && ` across ${sections.filter((s) => s.key !== "__other__").length} groups`}
            </p>
          )}
        </div>
        <Button
          onClick={() => setAddOpen(true)}
          className="gap-2 bg-primary text-primary-foreground hover:opacity-90 border-0 rounded-none text-[11px] uppercase tracking-[0.08em] h-8 px-4"
          style={{ fontFamily: "var(--font-body)" }}
        >
          <Plus className="h-3.5 w-3.5" />
          Add Game
        </Button>
      </div>

      {loading ? (
        <div className="space-y-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-12 bg-elevated animate-pulse" />
          ))}
        </div>
      ) : err ? (
        <div className="border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{err}</div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border/60">
          <Swords className="h-8 w-8 text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium text-foreground mb-1" style={{ fontFamily: "var(--font-display)", textTransform: "uppercase" }}>
            No Pool Games Yet
          </p>
          <p className="text-xs text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
            Add games to track scores and build standings.
          </p>
        </div>
      ) : !hasGroups ? (
        // No groups — flat table (existing behavior)
        <div className="border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface">
                {["Date", "Time", "Home", "Away", "Score", "Status", ""].map((h) => (
                  <th key={h} className={cn("p-3 label-section", h === "" ? "text-right" : "text-left")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>{renderGameRows(rows)}</tbody>
          </table>
        </div>
      ) : (
        // Groups mode — one section per group
        <div className="space-y-6">
          {sections.map((section) => (
            <div key={section.key}>
              <div className="flex items-center gap-3 mb-2">
                <h3
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 800,
                    fontSize: "13px",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: section.key === "__other__" ? "var(--muted-foreground)" : "var(--primary)",
                  }}
                >
                  {section.label}
                </h3>
                <div className="flex-1 h-px bg-border" />
                <span className="text-[10px] text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
                  {section.games.length} game{section.games.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface">
                      {["Date", "Time", "Home", "Away", "Score", "Status", ""].map((h) => (
                        <th key={h} className={cn("p-3 label-section", h === "" ? "text-right" : "text-left")}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>{renderGameRows(section.games)}</tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {tid && (
        <>
          <AddGameModal open={addOpen} onOpenChange={setAddOpen} tournamentId={tid} onAdded={() => setVersion((v) => v + 1)} />
          <AddGameModal
            open={editOpen}
            onOpenChange={(o) => { setEditOpen(o); if (!o) setEditInit(undefined); }}
            tournamentId={tid}
            initial={editInit}
            onAdded={() => setVersion((v) => v + 1)}
          />
        </>
      )}
    </div>
  );
}

export default function PoolPage() {
  return (
    <TournamentProvider>
      <TournamentShell tab="pool">
        <PoolBody />
      </TournamentShell>
    </TournamentProvider>
  );
}
