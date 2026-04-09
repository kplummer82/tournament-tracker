import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { generateLineupCardPDF, generateBattingOrderCardPDF } from "@/lib/lineup-card-pdf";
import type { GameDetail } from "@/pages/api/games/[source]/[gameId]";

interface ReportsTabProps {
  game: GameDetail;
  source: string;
  gameId: number;
  teamId: number;
}

type GenerateState = "idle" | "loading" | "error";

function useReportButton(fn: () => Promise<void>) {
  const [state, setState] = useState<GenerateState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const trigger = async () => {
    setState("loading");
    setErrorMsg(null);
    try {
      await fn();
      setState("idle");
    } catch (e) {
      setState("error");
      setErrorMsg(e instanceof Error ? e.message : "Failed to generate PDF");
    }
  };

  return { state, errorMsg, trigger };
}

export function ReportsTab({ game, source, gameId, teamId }: ReportsTabProps) {
  const isHome = game.home === teamId;
  const teamName = (isHome ? game.home_team : game.away_team) ?? "Team";
  const disabled = game.home == null;

  const lineupCard = useReportButton(async () => {
    const [boRes, dlRes] = await Promise.all([
      fetch(`/api/games/${source}/${gameId}/batting-order?team=${teamId}`),
      fetch(`/api/games/${source}/${gameId}/defensive-lineup?team=${teamId}`),
    ]);
    if (!boRes.ok || !dlRes.ok) throw new Error("Failed to load lineup data");
    const [boData, dlData] = await Promise.all([boRes.json(), dlRes.json()]);
    if (!boData.order?.length && !dlData.lineup?.length) {
      throw new Error("No lineup data found for this team. Set the batting order and defensive lineup first.");
    }
    await generateLineupCardPDF({ game, teamId, battingOrder: boData.order ?? [], defensiveLineup: dlData.lineup ?? [] });
  });

  const battingCard = useReportButton(async () => {
    const boRes = await fetch(`/api/games/${source}/${gameId}/batting-order?team=${teamId}`);
    if (!boRes.ok) throw new Error("Failed to load batting order");
    const boData = await boRes.json();
    if (!boData.order?.length) throw new Error("No batting order set for this team.");
    await generateBattingOrderCardPDF({ game, teamId, battingOrder: boData.order });
  });

  return (
    <div className="space-y-4">
      {/* Lineup Card */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <h2
            className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Lineup Card
          </h2>
          <p className="text-sm text-muted-foreground">
            Batting order and defensive positions for each inning for <span className="text-foreground font-medium">{teamName}</span>. Post on the fence for the team.
          </p>
          <button
            onClick={lineupCard.trigger}
            disabled={lineupCard.state === "loading" || disabled}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border border-border hover:border-primary hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {lineupCard.state === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
            {lineupCard.state === "loading" ? "Generating…" : "Generate Lineup Card"}
          </button>
          {lineupCard.state === "error" && lineupCard.errorMsg && (
            <p className="text-sm text-destructive">{lineupCard.errorMsg}</p>
          )}
        </CardContent>
      </Card>

      {/* Batting Order Card */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <h2
            className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Batting Order Card
          </h2>
          <p className="text-sm text-muted-foreground">
            Batting order with jersey numbers for <span className="text-foreground font-medium">{teamName}</span>. Hand off to the opposing team&apos;s scorekeeper.
          </p>
          <button
            onClick={battingCard.trigger}
            disabled={battingCard.state === "loading" || disabled}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border border-border hover:border-primary hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {battingCard.state === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
            {battingCard.state === "loading" ? "Generating…" : "Generate Batting Order Card"}
          </button>
          {battingCard.state === "error" && battingCard.errorMsg && (
            <p className="text-sm text-destructive">{battingCard.errorMsg}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
