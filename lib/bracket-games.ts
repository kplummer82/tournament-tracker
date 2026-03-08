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

/**
 * Synchronize season_games records for a bracket.
 * - First-round games get home/away from seed assignments.
 * - Later-round games get home/away = null (TBD).
 * - Scored games are never modified.
 * - Bye games (single seed) do not generate a game record.
 */
export async function syncBracketGames(
  seasonId: number,
  bracketId: number,
  structure: BracketStructure,
  assignments: Assignment[]
): Promise<{ generated: number; updated: number; skipped: number }> {
  // Build seed -> teamId map
  const seedToTeam = new Map<number, number>();
  for (const a of assignments) {
    seedToTeam.set(a.seedIndex, a.teamId);
  }

  // Get existing bracket games
  const existing = (await sql`
    SELECT id, bracket_game_id, home, away, homescore, awayscore
    FROM season_games
    WHERE bracket_id = ${bracketId}
  `) as ExistingGame[];

  const existingMap = new Map<string, ExistingGame>();
  for (const g of existing) {
    existingMap.set(g.bracket_game_id, g);
  }

  // Compute winner seeds for home/away determination on first-round games
  const winnerSeeds = computeWinnerSeeds(structure);

  // Build a set of all bracket game IDs that should exist
  const expectedGameIds = new Set<string>();

  let generated = 0;
  let updated = 0;
  let skipped = 0;

  for (const round of structure.rounds) {
    for (const game of round.games) {
      // Skip bye games (single seed, no actual game needed)
      const isBye = round.round === 0 && (game.seeds?.length ?? 0) === 1;
      if (isBye) continue;

      expectedGameIds.add(game.id);

      // Determine home/away for this bracket game
      let homeTeamId: number | null = null;
      let awayTeamId: number | null = null;

      if (round.round === 0 && game.seeds && game.seeds.length >= 2) {
        // First round: resolve from seed assignments
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
            // Can't determine, default: first seed = home
            homeTeamId = seedToTeam.get(game.seeds[0]) ?? null;
            awayTeamId = seedToTeam.get(game.seeds[1]) ?? null;
          }
        }
      }
      // Later rounds: home/away stay null (TBD)

      const existingGame = existingMap.get(game.id);

      if (existingGame) {
        // Game exists — check if it has scores
        const hasScores = existingGame.homescore != null || existingGame.awayscore != null;
        if (hasScores) {
          skipped++;
          continue;
        }

        // Update teams if changed (only for first-round games)
        if (round.round === 0) {
          if (existingGame.home !== homeTeamId || existingGame.away !== awayTeamId) {
            await sql`
              UPDATE season_games
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
        // Insert new game record
        await sql`
          INSERT INTO season_games (
            season_id, game_type, bracket_id, bracket_game_id,
            home, away
          ) VALUES (
            ${seasonId}, 'playoff', ${bracketId}, ${game.id},
            ${homeTeamId}, ${awayTeamId}
          )
        `;
        generated++;
      }
    }
  }

  // Clean up orphaned bracket games (games in DB that are no longer in the structure)
  for (const [bracketGameId, existingGame] of existingMap) {
    if (!expectedGameIds.has(bracketGameId)) {
      const hasScores = existingGame.homescore != null || existingGame.awayscore != null;
      if (!hasScores) {
        await sql`DELETE FROM season_games WHERE id = ${existingGame.id}`;
      }
    }
  }

  return { generated, updated, skipped };
}

// Forfeit game status IDs
const HOME_TEAM_FORFEIT_ID = 6; // Home team forfeited → away team wins
const AWAY_TEAM_FORFEIT_ID = 7; // Away team forfeited → home team wins

/**
 * After a bracket game score is entered (or a forfeit status is set), advance
 * the winner to the next round. Finds the game in the bracket structure that
 * feedsFrom this game and updates the appropriate slot (home or away) with the
 * winning team.
 */
export async function advanceWinner(
  seasonId: number,
  gameId: number,
  bracketId: number,
  bracketGameId: string
): Promise<void> {
  // Load the game's scores and status
  const [game] = await sql`
    SELECT home, away, homescore, awayscore, gamestatusid
    FROM season_games
    WHERE id = ${gameId} AND season_id = ${seasonId}
  `;
  if (!game) return;
  if (game.home == null || game.away == null) return;

  // Determine winner — forfeit status takes priority over scores
  let winnerId: number;
  if (game.gamestatusid === HOME_TEAM_FORFEIT_ID) {
    winnerId = game.away; // home forfeited → away wins
  } else if (game.gamestatusid === AWAY_TEAM_FORFEIT_ID) {
    winnerId = game.home; // away forfeited → home wins
  } else {
    if (game.homescore == null || game.awayscore == null) return;
    winnerId = game.homescore >= game.awayscore ? game.home : game.away;
  }

  // Load bracket structure
  const [bracket] = await sql`
    SELECT structure FROM season_brackets WHERE id = ${bracketId}
  `;
  if (!bracket?.structure) return;

  const structure = bracket.structure as BracketStructure;

  // Find the next-round game that feedsFrom this game
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

  if (!nextGame) return; // This was the final game

  // Determine which slot (home or away) the winner goes into
  // feedSlotIndex 0 = comes from first feeder, 1 = second feeder
  // Use computeWinnerSeeds to determine if this slot should be home or away
  const winnerSeedsMap = computeWinnerSeeds(structure);
  const slotASeeds = nextGame.feedsFrom
    ? winnerSeedsMap.get(nextGame.feedsFrom[0]) ?? new Set()
    : new Set<number>();
  const slotBSeeds = nextGame.feedsFrom
    ? winnerSeedsMap.get(nextGame.feedsFrom[1]) ?? new Set()
    : new Set<number>();
  const homeSlot = getHomeSlotIndex(slotASeeds, slotBSeeds);

  // Determine if the winner goes to home or away
  let setHome = false;
  if (homeSlot === 0) {
    // Slot A is home. If feeder is slot A (index 0), winner is home
    setHome = feedSlotIndex === 0;
  } else if (homeSlot === 1) {
    // Slot B is home. If feeder is slot B (index 1), winner is home
    setHome = feedSlotIndex === 1;
  } else {
    // Can't determine, default: first feeder = home
    setHome = feedSlotIndex === 0;
  }

  // Update the next game (only if it has no scores yet)
  if (setHome) {
    await sql`
      UPDATE season_games
      SET home = ${winnerId}
      WHERE bracket_id = ${bracketId}
        AND bracket_game_id = ${nextGame.id}
        AND homescore IS NULL
        AND awayscore IS NULL
    `;
  } else {
    await sql`
      UPDATE season_games
      SET away = ${winnerId}
      WHERE bracket_id = ${bracketId}
        AND bracket_game_id = ${nextGame.id}
        AND homescore IS NULL
        AND awayscore IS NULL
    `;
  }
}
