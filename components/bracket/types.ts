/** One game in a round: either seed pair (first round) or feeds from previous game ids */
export type BracketGame = {
  id: string;
  seeds?: number[];
  feedsFrom?: string[];
};

export type BracketRound = {
  round: number;
  games: BracketGame[];
};

export type BracketStructure = {
  numTeams: number;
  rounds: BracketRound[];
  /** Bracket type (e.g. single_elimination). Derived from structure when saving. */
  bracketType?: string;
};

/** Single elimination: standard 1v8, 4v5, 2v7, 3v6 for 8 teams; scale for 4, 16, etc. */
export function singleEliminationPreset(numTeams: number): BracketStructure {
  if (numTeams < 2 || (numTeams & (numTeams - 1)) !== 0) {
    throw new Error("numTeams must be a power of 2 (2, 4, 8, 16, ...)");
  }
  const rounds: BracketRound[] = [];
  let gameId = 0;
  const genId = () => `g${++gameId}`;

  // First round: pair seeds (1 vs n, 2 vs n-1, ...)
  const firstRoundGames: BracketGame[] = [];
  for (let i = 0; i < numTeams / 2; i++) {
    const a = i + 1;
    const b = numTeams - i;
    firstRoundGames.push({ id: genId(), seeds: [a, b] });
  }
  rounds.push({ round: 0, games: firstRoundGames });

  // Subsequent rounds: each game feeds from two previous games
  let prevGameIds = firstRoundGames.map((g) => g.id);
  let roundIndex = 1;
  while (prevGameIds.length > 1) {
    const games: BracketGame[] = [];
    for (let i = 0; i < prevGameIds.length; i += 2) {
      games.push({
        id: genId(),
        feedsFrom: [prevGameIds[i], prevGameIds[i + 1]],
      });
    }
    rounds.push({ round: roundIndex, games });
    prevGameIds = games.map((g) => g.id);
    roundIndex++;
  }

  return { numTeams, rounds, bracketType: "single_elimination" };
}

export const BRACKET_PRESETS: { label: string; numTeams: number }[] = [
  { label: "4 teams", numTeams: 4 },
  { label: "5 teams", numTeams: 5 },
  { label: "6 teams", numTeams: 6 },
  { label: "7 teams", numTeams: 7 },
  { label: "8 teams", numTeams: 8 },
  { label: "9 teams", numTeams: 9 },
  { label: "10 teams", numTeams: 10 },
  { label: "11 teams", numTeams: 11 },
  { label: "12 teams", numTeams: 12 },
  { label: "16 teams", numTeams: 16 },
];

/** Returns seeds in bracket order for a power-of-2 sized bracket,
 *  keeping top seeds separated into opposite halves/quarters. */
function bracketSeedings(n: number): number[] {
  if (n === 1) return [1];
  const prev = bracketSeedings(n / 2);
  const result: number[] = [];
  for (const s of prev) { result.push(s); result.push(n + 1 - s); }
  return result;
}

/**
 * Single elimination bracket for any numTeams >= 2, including non-power-of-2.
 * Power-of-2 teams → delegates to singleEliminationPreset (same behavior as before).
 * Other counts → top seeds receive byes (single-seed R0 games), bottom seeds
 * play play-in games. R0 ordering keeps top seeds in separate bracket halves.
 */
export function singleEliminationWithByes(numTeams: number): BracketStructure {
  if (numTeams < 2) throw new Error("numTeams must be at least 2");
  if ((numTeams & (numTeams - 1)) === 0) return singleEliminationPreset(numTeams);

  let nextPow2 = 1;
  while (nextPow2 < numTeams) nextPow2 <<= 1;

  const seeds = bracketSeedings(nextPow2);
  let gameId = 0;
  const genId = () => `g${++gameId}`;

  const round0Games: BracketGame[] = [];
  for (let i = 0; i < seeds.length; i += 2) {
    const a = seeds[i], b = seeds[i + 1];
    const aOk = a <= numTeams, bOk = b <= numTeams;
    if (aOk && bOk)  round0Games.push({ id: genId(), seeds: [a, b] });
    else if (aOk)    round0Games.push({ id: genId(), seeds: [a] }); // bye
    else if (bOk)    round0Games.push({ id: genId(), seeds: [b] }); // bye
  }

  const rounds: BracketRound[] = [{ round: 0, games: round0Games }];
  let prevGameIds = round0Games.map((g) => g.id);
  let roundIndex = 1;
  while (prevGameIds.length > 1) {
    const games: BracketGame[] = [];
    for (let i = 0; i < prevGameIds.length; i += 2)
      games.push({ id: genId(), feedsFrom: [prevGameIds[i], prevGameIds[i + 1]] });
    rounds.push({ round: roundIndex, games });
    prevGameIds = games.map((g) => g.id);
    roundIndex++;
  }
  return { numTeams, rounds, bracketType: "single_elimination" };
}

export type FirstRoundValidation = {
  valid: boolean;
  duplicates: number[];
  missing: number[];
};

/** Validates that round 0 uses each seed 1..numTeams exactly once. */
export function validateFirstRoundSeeds(
  structure: BracketStructure | null
): FirstRoundValidation {
  if (!structure?.rounds?.length || structure.numTeams < 1) {
    const expected = structure?.numTeams
      ? Array.from({ length: structure.numTeams }, (_, i) => i + 1)
      : [];
    return { valid: false, duplicates: [], missing: expected };
  }
  const round0 = structure.rounds[0];
  if (!round0?.games?.length) {
    const missing = Array.from({ length: structure.numTeams }, (_, i) => i + 1);
    return { valid: false, duplicates: [], missing };
  }
  const used = round0.games.flatMap((g) => g.seeds ?? []).filter((s) => Number.isFinite(s));
  const expected = new Set(
    Array.from({ length: structure.numTeams }, (_, i) => i + 1)
  );
  const countBySeed = new Map<number, number>();
  for (const s of used) {
    countBySeed.set(s, (countBySeed.get(s) ?? 0) + 1);
  }
  const duplicates: number[] = [];
  countBySeed.forEach((count, seed) => {
    if (count > 1) duplicates.push(seed);
  });
  const missing: number[] = [];
  expected.forEach((seed) => {
    if ((countBySeed.get(seed) ?? 0) === 0) missing.push(seed);
  });
  return {
    valid: duplicates.length === 0 && missing.length === 0,
    duplicates,
    missing,
  };
}

export function cloneStructure(s: BracketStructure): BracketStructure {
  return {
    numTeams: s.numTeams,
    bracketType: s.bracketType,
    rounds: s.rounds.map((r) => ({
      round: r.round,
      games: r.games.map((g) => ({
        id: g.id,
        seeds: g.seeds ? [...g.seeds] : undefined,
        feedsFrom: g.feedsFrom ? [...g.feedsFrom] : undefined,
      })),
    })),
  };
}

/** Get max numeric id from structure (e.g. g7 -> 7). */
function getMaxGameIdNum(structure: BracketStructure): number {
  let max = 0;
  for (const r of structure.rounds) {
    for (const g of r.games) {
      const match = g.id.match(/^g(\d+)$/);
      if (match) max = Math.max(max, parseInt(match[1], 10));
    }
  }
  return max;
}

/** Add a first-round game and a matching round-1 game that feeds from the new game and one existing R0 game. numTeams increases by 2. */
export function addFirstRoundGame(
  structure: BracketStructure,
  pairWithGameIndex: number
): BracketStructure {
  const next = cloneStructure(structure);
  const round0 = next.rounds[0];
  if (!round0 || round0.games.length <= pairWithGameIndex) return structure;
  const maxId = getMaxGameIdNum(next);
  const newGameId = `g${maxId + 1}`;
  const newGameId2 = `g${maxId + 2}`;
  const pairGame = round0.games[pairWithGameIndex];
  const newR0Game: BracketGame = { id: newGameId, seeds: [structure.numTeams + 1, structure.numTeams + 2] };
  round0.games.push(newR0Game);
  next.numTeams += 2;
  if (next.rounds.length >= 2) {
    const round1 = next.rounds[1];
    const newR1Game: BracketGame = { id: newGameId2, feedsFrom: [pairGame.id, newGameId] };
    round1.games.push(newR1Game);
  }
  return next;
}

/** Add a game to round N (N >= 1) that feeds from two games in round N-1. */
export function addGameToRound(
  structure: BracketStructure,
  roundIndex: number,
  feedsFromIdA: string,
  feedsFromIdB: string
): BracketStructure {
  if (roundIndex < 1 || roundIndex >= structure.rounds.length) return structure;
  const prevRound = structure.rounds[roundIndex - 1];
  if (!prevRound?.games.some((g) => g.id === feedsFromIdA) || !prevRound?.games.some((g) => g.id === feedsFromIdB))
    return structure;
  const next = cloneStructure(structure);
  const maxId = getMaxGameIdNum(next);
  const newGame: BracketGame = { id: `g${maxId + 1}`, feedsFrom: [feedsFromIdA, feedsFromIdB] };
  next.rounds[roundIndex].games.push(newGame);
  return next;
}

/**
 * For each game in the bracket, computes the set of seeds that could
 * potentially win that game. Used to determine home/visitor when one
 * or both teams are not yet known.
 *
 * - First-round game {seeds:[1,8]} → {1,8}
 * - Later-round game {feedsFrom:["g1","g2"]} → union of winner seeds from g1 and g2
 */
export function computeWinnerSeeds(structure: BracketStructure): Map<string, Set<number>> {
  const gameMap = new Map<string, BracketGame>();
  for (const round of structure.rounds) {
    for (const game of round.games) gameMap.set(game.id, game);
  }

  const memo = new Map<string, Set<number>>();

  function getSeeds(gameId: string): Set<number> {
    if (memo.has(gameId)) return memo.get(gameId)!;
    const game = gameMap.get(gameId);
    if (!game) { memo.set(gameId, new Set()); return new Set(); }
    let seeds: Set<number>;
    if (game.seeds && game.seeds.length > 0) {
      seeds = new Set(game.seeds.filter((s) => Number.isFinite(s)));
    } else if (game.feedsFrom && game.feedsFrom.length >= 2) {
      seeds = new Set<number>();
      for (const id of game.feedsFrom) {
        for (const s of getSeeds(id)) seeds.add(s);
      }
    } else {
      seeds = new Set();
    }
    memo.set(gameId, seeds);
    return seeds;
  }

  for (const round of structure.rounds) {
    for (const game of round.games) getSeeds(game.id);
  }
  return memo;
}

/**
 * Given the possible seeds for each slot in a game, determines which slot
 * is home (0 or 1) or null if it can't be determined yet.
 * Lower seed number = higher seed = home team.
 *
 * Returns 0 if every possible seed in A is lower than every possible seed in B.
 * Returns 1 if every possible seed in B is lower than every possible seed in A.
 * Returns null if the home team depends on game results.
 */
export function getHomeSlotIndex(
  slotASeeds: Set<number>,
  slotBSeeds: Set<number>
): 0 | 1 | null {
  if (slotASeeds.size === 0 || slotBSeeds.size === 0) return null;
  const maxA = Math.max(...slotASeeds);
  const minB = Math.min(...slotBSeeds);
  const maxB = Math.max(...slotBSeeds);
  const minA = Math.min(...slotASeeds);
  if (maxA < minB) return 0;
  if (maxB < minA) return 1;
  return null;
}

/**
 * Toggle a first-round game between bye mode (single seed) and play-in mode (two seeds).
 * - bye → play-in: adds seed (numTeams+1) as the second seed, increments numTeams.
 * - play-in → bye: removes seeds[1], decrements numTeams by 1.
 */
export function toggleByeGame(
  structure: BracketStructure,
  gameIndex: number
): BracketStructure {
  const round0 = structure.rounds[0];
  if (!round0?.games[gameIndex]) return structure;
  const game = round0.games[gameIndex];
  if (!game.seeds || game.seeds.length === 0) return structure;

  const next = cloneStructure(structure);
  const nextGame = next.rounds[0].games[gameIndex];

  if (game.seeds.length === 1) {
    // bye → play-in: add second seed
    next.numTeams += 1;
    nextGame.seeds = [game.seeds[0], next.numTeams];
  } else {
    // play-in → bye: remove second seed
    next.numTeams = Math.max(0, next.numTeams - 1);
    nextGame.seeds = [game.seeds[0]];
  }
  return next;
}

/** Remove a game and cascade: remove any game in the next round that references it; for round 0, decrement numTeams by the number of seeds removed. */
export function deleteGameFromStructure(
  structure: BracketStructure,
  roundIndex: number,
  gameIndex: number
): BracketStructure {
  const round = structure.rounds[roundIndex];
  if (!round?.games[gameIndex]) return structure;
  let removedIds = new Set<string>([round.games[gameIndex].id]);
  const next = cloneStructure(structure);
  const nextRound = next.rounds[roundIndex];
  nextRound.games.splice(gameIndex, 1);
  if (roundIndex === 0) {
    const seedsRemoved = structure.rounds[0].games[gameIndex].seeds?.length ?? 2;
    next.numTeams = Math.max(0, next.numTeams - seedsRemoved);
  }
  let currentRoundIndex = roundIndex + 1;
  while (currentRoundIndex < next.rounds.length) {
    const r = next.rounds[currentRoundIndex];
    const toRemove = r.games
      .map((g, i) => (g.feedsFrom?.some((id) => removedIds.has(id)) ? i : -1))
      .filter((i) => i >= 0)
      .reverse();
    const newlyRemoved = new Set<string>();
    for (const i of toRemove) {
      newlyRemoved.add(r.games[i].id);
      r.games.splice(i, 1);
    }
    removedIds = newlyRemoved;
    if (toRemove.length === 0) break;
    currentRoundIndex++;
  }
  return next;
}
