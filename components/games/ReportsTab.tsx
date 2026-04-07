import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { generateLineupCardPDF } from "@/lib/lineup-card-pdf";
import type { GameDetail } from "@/pages/api/games/[source]/[gameId]";

interface ReportsTabProps {
  game: GameDetail;
  source: string;
  gameId: number;
  teamId: number;
}

type GenerateState = "idle" | "loading" | "error";

export function ReportsTab({ game, source, gameId, teamId }: ReportsTabProps) {
  const [state, setState] = useState<GenerateState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isHome = game.home === teamId;
  const teamName = (isHome ? game.home_team : game.away_team) ?? "Team";

  const handleGenerate = async () => {
    setState("loading");
    setErrorMsg(null);
    try {
      const [boRes, dlRes] = await Promise.all([
        fetch(`/api/games/${source}/${gameId}/batting-order?team=${teamId}`),
        fetch(`/api/games/${source}/${gameId}/defensive-lineup?team=${teamId}`),
      ]);

      if (!boRes.ok || !dlRes.ok) throw new Error("Failed to load lineup data");

      const [boData, dlData] = await Promise.all([boRes.json(), dlRes.json()]);

      if (!boData.order?.length && !dlData.lineup?.length) {
        throw new Error("No lineup data found for this team. Set the batting order and defensive lineup first.");
      }

      await generateLineupCardPDF({
        game,
        teamId,
        battingOrder: boData.order ?? [],
        defensiveLineup: dlData.lineup ?? [],
      });

      setState("idle");
    } catch (e) {
      setState("error");
      setErrorMsg(e instanceof Error ? e.message : "Failed to generate PDF");
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-6 space-y-4">
          <h2
            className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Lineup Card
          </h2>
          <p className="text-sm text-muted-foreground">
            Download a PDF lineup card for <span className="text-foreground font-medium">{teamName}</span> showing
            the batting order and defensive positions for each inning.
          </p>

          <button
            onClick={handleGenerate}
            disabled={state === "loading"}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border border-border hover:border-primary hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {state === "loading" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileDown className="h-4 w-4" />
            )}
            {state === "loading" ? "Generating…" : "Generate Lineup Card"}
          </button>

          {state === "error" && errorMsg && (
            <p className="text-sm text-destructive">{errorMsg}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
