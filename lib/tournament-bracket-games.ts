import { sql } from "@/lib/db";
import type { BracketStructure, BracketGame } from "@/components/bracket/types";
import { computeWinnerSeeds, getHomeSlotIndex } from "@/components/bracket/types";

type Assignment = { seedIndex: number; teamId: number };

type ExistingGame = {
  id: number;
  bracket_game_id: string;
  home: number | null;
  away: number | null;
  homescore: number | null;
  awayscore: number | null;
};

// Forfeit status IDs (mirrors lib/bracket-games.ts)
const HOME_TEAM_FORFEIT_ID = 6;
const AWAY_TEAM_FORFEIT_ID = 7;

/**
 * Synchronize tournamentgames records for a tournament bracket.
 * - First-round games get home/away from seed assignments.
 * - Later-round games get home/away = null (TBD).
 * - Scored games are never modified.
 * - Bye games (single seed) do not generate a game record.
 */
export async function syncTournamentBracketGames(
  tournamentId: number,
  bracketId: number,
  structure: BracketStructure,
  assignments: Assignment[]
): Promise<{ generated: number; updated: number; skipped: number }> {
  const seedToTeam = new Map<number, number>();
  for (const a of assignments) seedToTeam.set(a.seedIndex, a.teamId);

  const existing = (await sql`
    SELECT id, bracket_game_id, home, away, homescore, awayscore
    FROM public.tournamentgames
    WHERE bracket_id = ${bracketId}
  `) as ExistingGame[];

  const existingMap = new Map<string, ExistingGame>();
  for (const g of existing) existingMap.set(g.bracket_game_id, g);

  const winnerSeeds = computeWinnerSeeds(structure);
  const expectedGameIds = new Set<string>();

  let generated = 0;
  let updated = 0;
  let skipped = 0;

  for (const round of structure.rounds) {
    for (const game of round.games) {
      const isBye = round.round === 0 && (game.seeds?.length ?? 0) === 1;
      if (isBye) continue;

      expectedGameIds.add(game.id);

      let homeTeamId: number | null = null;
      let awayTeamId: number | null = null;

      if (round.round === 0 && game.seeds && game.seeds.length >= 2) {
        const gameSeeds = winnerSeeds.get(game.id);
        if (gameSeeds) {
          const slotASeeds = new Set(game.seeds.slice(0, 1));
          const slotBSeeds = new Set(game.seeds.slice(1, 2));
          const homeSlot = getHomeSlotIndex(slotASeeds, slotBSeeds);

          if (homeSlot === 0) {
            homeTeamId = seedToTeam.get(game.seeds[0]) ?? null;
            awayTeamId = seedToTeam.get(game.seeds[1]) ?? null;
          } else if (homeSlot === 1) {
            homeTeamId = seedToTeam.get(game.seeds[1]) ?? null;
            awayTeamId = seedToTeam.get(game.seeds[0]) ?? null;
          } else {
            homeTeamId = seedToTeam.get(game.seeds[0]) ?? null;
            awayTeamId = seedToTeam.get(game.seeds[1]) ?? null;
          }
        }
      }

      const existingGame = existingMap.get(game.id);

      if (existingGame) {
        const hasScores = existingGame.homescore != null || existingGame.awayscore != null;
        if (hasScores) { skipped++; continue; }

        if (round.round === 0) {
          if (existingGame.home !== homeTeamId || existingGame.away !== awayTeamId) {
            await sql`
              UPDATE public.tournamentgames
              SET home = ${homeTeamId}, away = ${awayTeamId}
              WHERE id = ${existingGame.id}
            `;
            updated++;
          } else {
            skipped++;
          }
        } else {
          skipped++;
        }
      } else {
        await sql`
          INSERT INTO public.tournamentgames (
            tournamentid, poolorbracket, bracket_id, bracket_game_id,
            home, away
          ) VALUES (
            ${tournamentId}, 'Bracket', ${bracketId}, ${game.id},
            ${homeTeamId}, ${awayTeamId}
          )
          ON CONFLICT (bracket_id, bracket_game_id) DO NOTHING
        `;
        generated++;
      }
    }
  }

  // Clean up orphaned games (e.g. after structure change), but never destroy scored rows
  for (const [bracketGameId, existingGame] of existingMap) {
    if (!expectedGameIds.has(bracketGameId)) {
      const hasScores = existingGame.homescore != null || existingGame.awayscore != null;
      if (!hasScores) {
        await sql`DELETE FROM public.tournamentgames WHERE id = ${existingGame.id}`;
      }
    }
  }

  return { generated, updated, skipped };
}

/**
 * Re-propagate winners for every already-scored bracket game.
 * Call after seed assignments change so later-round slots reflect the right teams.
 */
export async function repropagateTournamentWinners(
  tournamentId: number,
  bracketId: number
): Promise<void> {
  const scoredGames = (await sql`
    SELECT id, bracket_game_id
    FROM public.tournamentgames
    WHERE bracket_id = ${bracketId}
      AND ((homescore IS NOT NULL AND awayscore IS NOT NULL)
           OR gamestatusid IN (${HOME_TEAM_FORFEIT_ID}, ${AWAY_TEAM_FORFEIT_ID}))
    ORDER BY id
  `) as { id: number; bracket_game_id: string }[];

  for (const g of scoredGames) {
    await advanceTournamentWinner(tournamentId, g.id, bracketId, g.bracket_game_id);
  }
}

/**
 * After a bracket game score (or forfeit) is entered, advance the winner to
 * the next round. Finds the game that feedsFrom this game and writes the
 * winning team into the correct home/away slot (only if that next game has
 * no scores yet).
 */
export async function advanceTournamentWinner(
  tournamentId: number,
  gameId: number,
  bracketId: number,
  bracketGameId: string
): Promise<void> {
  const rows = (await sql`
    SELECT home, away, homescore, awayscore, gamestatusid
    FROM public.tournamentgames
    WHERE id = ${gameId} AND tournamentid = ${tournamentId}
  `) as { home: number | null; away: number | null; homescore: number | null; awayscore: number | null; gamestatusid: number | null }[];
  const game = rows[0];
  if (!game) return;
  if (game.home == null || game.away == null) return;

  let winnerId: number;
  if (game.gamestatusid === HOME_TEAM_FORFEIT_ID) {
    winnerId = game.away;
  } else if (game.gamestatusid === AWAY_TEAM_FORFEIT_ID) {
    winnerId = game.home;
  } else {
    if (game.homescore == null || game.awayscore == null) return;
    winnerId = game.homescore >= game.awayscore ? game.home : game.away;
  }

  const bracketRows = (await sql`
    SELECT structure FROM public.tournament_brackets WHERE id = ${bracketId}
  `) as { structure: BracketStructure | null }[];
  const structure = bracketRows[0]?.structure;
  if (!structure) return;

  let nextGame: BracketGame | null = null;
  let feedSlotIndex = -1;
  for (const round of structure.rounds) {
    for (const g of round.games) {
      if (g.feedsFrom) {
        const idx = g.feedsFrom.indexOf(bracketGameId);
        if (idx !== -1) {
          nextGame = g;
          feedSlotIndex = idx;
          break;
        }
      }
    }
    if (nextGame) break;
  }
  if (!nextGame) return;

  const winnerSeedsMap = computeWinnerSeeds(structure);
  const slotASeeds = nextGame.feedsFrom
    ? winnerSeedsMap.get(nextGame.feedsFrom[0]) ?? new Set<number>()
    : new Set<number>();
  const slotBSeeds = nextGame.feedsFrom
    ? winnerSeedsMap.get(nextGame.feedsFrom[1]) ?? new Set<number>()
    : new Set<number>();
  const homeSlot = getHomeSlotIndex(slotASeeds, slotBSeeds);

  let setHome = false;
  if (homeSlot === 0) setHome = feedSlotIndex === 0;
  else if (homeSlot === 1) setHome = feedSlotIndex === 1;
  else setHome = feedSlotIndex === 0;

  if (setHome) {
    await sql`
      UPDATE public.tournamentgames
      SET home = ${winnerId}
      WHERE bracket_id = ${bracketId}
        AND bracket_game_id = ${nextGame.id}
        AND homescore IS NULL
        AND awayscore IS NULL
    `;
  } else {
    await sql`
      UPDATE public.tournamentgames
      SET away = ${winnerId}
      WHERE bracket_id = ${bracketId}
        AND bracket_game_id = ${nextGame.id}
        AND homescore IS NULL
        AND awayscore IS NULL
    `;
  }
}
