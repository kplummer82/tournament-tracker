import { sql } from "@/lib/db";
import type { BracketStructure, BracketGame } from "@/components/bracket/types";
import { computeWinnerSeeds, getHomeSlotIndex, gameFeeds } from "@/components/bracket/types";

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
        // Insert new game record; ON CONFLICT is a safety net against races
        await sql`
          INSERT INTO season_games (
            season_id, game_type, bracket_id, bracket_game_id,
            home, away
          ) VALUES (
            ${seasonId}, 'playoff', ${bracketId}, ${game.id},
            ${homeTeamId}, ${awayTeamId}
          )
          ON CONFLICT (bracket_id, bracket_game_id) WHERE bracket_id IS NOT NULL DO NOTHING
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

/**
 * Re-propagate winners for all already-scored bracket games.
 * Call this after seed assignments change so later-round home/away slots
 * reflect the correct winning teams even if scores were entered before
 * the current assignment state.
 */
export async function repropagateWinners(
  seasonId: number,
  bracketId: number
): Promise<void> {
  const scoredGames = await sql`
    SELECT id, bracket_game_id
    FROM season_games
    WHERE bracket_id = ${bracketId}
      AND homescore IS NOT NULL
      AND awayscore IS NOT NULL
    ORDER BY id
  `;
  for (const g of scoredGames) {
    await advanceWinner(seasonId, g.id, bracketId, g.bracket_game_id);
  }
}

// Forfeit game status IDs
const HOME_TEAM_FORFEIT_ID = 6; // Home team forfeited → away team wins
const AWAY_TEAM_FORFEIT_ID = 7; // Away team forfeited → home team wins

/**
 * After a bracket game score is entered (or a forfeit status is set), advance the
 * result to the games it feeds. Single elimination propagates only the winner
 * (legacy `feedsFrom`); double elimination routes both winner and loser via each
 * downstream game's `feeds[]` (source game + winner/loser, slot = feed position).
 * Only fills slots whose target game has no scores yet.
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

  // Determine winner & loser — forfeit status takes priority over scores
  let winnerId: number;
  let loserId: number;
  if (game.gamestatusid === HOME_TEAM_FORFEIT_ID) {
    winnerId = game.away; loserId = game.home; // home forfeited → away wins
  } else if (game.gamestatusid === AWAY_TEAM_FORFEIT_ID) {
    winnerId = game.home; loserId = game.away; // away forfeited → home wins
  } else {
    if (game.homescore == null || game.awayscore == null) return;
    if (game.homescore >= game.awayscore) { winnerId = game.home; loserId = game.away; }
    else { winnerId = game.away; loserId = game.home; }
  }

  // Load bracket structure
  const [bracket] = await sql`
    SELECT structure FROM season_brackets WHERE id = ${bracketId}
  `;
  if (!bracket?.structure) return;

  const structure = bracket.structure as BracketStructure;
  const winnerSeedsMap = computeWinnerSeeds(structure);

  for (const outcome of ["winner", "loser"] as const) {
    const teamId = outcome === "winner" ? winnerId : loserId;

    // Find the game (and slot) that takes this game's `outcome`.
    let target: BracketGame | null = null;
    let slotIndex = -1;
    for (const round of structure.rounds) {
      for (const g of round.games) {
        const idx = gameFeeds(g).findIndex((f) => f.from === bracketGameId && f.outcome === outcome);
        if (idx !== -1) { target = g; slotIndex = idx; break; }
      }
      if (target) break;
    }
    if (!target) continue;

    // Explicit `feeds` (double-elim) is positional: slot 0 = home. Legacy `feedsFrom`
    // (single-elim) keeps the seed-based ordering (lower seed = home).
    let setHome: boolean;
    if (target.feeds && target.feeds.length > 0) {
      setHome = slotIndex === 0;
    } else {
      const ff = target.feedsFrom ?? [];
      const homeSlot = getHomeSlotIndex(
        winnerSeedsMap.get(ff[0]) ?? new Set<number>(),
        winnerSeedsMap.get(ff[1]) ?? new Set<number>()
      );
      if (homeSlot === 0) setHome = slotIndex === 0;
      else if (homeSlot === 1) setHome = slotIndex === 1;
      else setHome = slotIndex === 0;
    }

    if (setHome) {
      await sql`
        UPDATE season_games
        SET home = ${teamId}
        WHERE bracket_id = ${bracketId}
          AND bracket_game_id = ${target.id}
          AND homescore IS NULL
          AND awayscore IS NULL
      `;
    } else {
      await sql`
        UPDATE season_games
        SET away = ${teamId}
        WHERE bracket_id = ${bracketId}
          AND bracket_game_id = ${target.id}
          AND homescore IS NULL
          AND awayscore IS NULL
      `;
    }
  }
}
