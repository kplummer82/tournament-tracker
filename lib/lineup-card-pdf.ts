import { pdf } from "@react-pdf/renderer";
import { LineupCardPDF } from "@/components/games/LineupCardPDF";
import type { BattingEntry, DefenseEntry } from "@/components/games/LineupCardPDF";
import type { GameDetail } from "@/pages/api/games/[source]/[gameId]";

export type { BattingEntry, DefenseEntry };

interface GenerateOptions {
  game: GameDetail;
  teamId: number;
  battingOrder: BattingEntry[];
  defensiveLineup: DefenseEntry[];
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function slugify(s: string | null): string {
  return (s ?? "team").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export async function generateLineupCardPDF({ game, teamId, battingOrder, defensiveLineup }: GenerateOptions): Promise<void> {
  const isHome = game.home === teamId;
  const teamName = (isHome ? game.home_team : game.away_team) ?? "Team";
  const opponentName = (isHome ? game.away_team : game.home_team) ?? "Opponent";
  const dateSlug = game.gamedate ?? "game";

  const blob = await pdf(
    LineupCardPDF({ game, teamName, opponentName, battingOrder, defensiveLineup })
  ).toBlob();

  const url = URL.createObjectURL(blob);
  const filename = `lineup-${dateSlug}-${slugify(teamName)}.pdf`;

  if (isIOS()) {
    // iOS Safari doesn't support <a download> on blob URLs — open in viewer instead
    window.open(url);
    // Don't revoke immediately; the new tab needs the URL
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  } else {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
