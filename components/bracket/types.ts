/** Which result of a source game feeds a slot: the winner (default) or the loser (double-elim). */
export type FeedOutcome = "winner" | "loser";

/** A single feed source for one slot of a game. */
export type FeedSource = { from: string; outcome: FeedOutcome };

/** One game in a round: either seed pair (first round) or feeds from previous game ids.
 *
 * Single elimination uses `feedsFrom` (winners only). Double elimination uses `feeds`,
 * where each entry's index is the slot (0 = home, 1 = visitor) and `outcome` selects the
 * winner or loser of the source game. The layout/semantics hints (`group`, `col`, `row`,
 * `label`, `ifNecessary`) are only populated for double elimination. */
export type BracketGame = {
  id: string;
  seeds?: number[];
  feedsFrom?: string[];
  feeds?: FeedSource[];
  group?: "winners" | "losers" | "final";
  col?: number;
  row?: number;
  label?: string;
  ifNecessary?: boolean;
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

/**
 * Normalize a game's feed sources to the unified {from, outcome} shape so single-elim
 * (`feedsFrom`) and double-elim (`feeds`) share one code path. Returns [] for first-round
 * (seed) games. `feeds` takes precedence; otherwise `feedsFrom` is treated as winner-only.
 */
export function gameFeeds(game: BracketGame): FeedSource[] {
  if (game.feeds && game.feeds.length > 0) return game.feeds;
  if (game.feedsFrom && game.feedsFrom.length > 0)
    return game.feedsFrom.map((from) => ({ from, outcome: "winner" as const }));
  return [];
}

/** True when the structure is a double-elimination bracket. */
export function isDoubleElim(structure: BracketStructure | null | undefined): boolean {
  return structure?.bracketType === "double_elimination";
}

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

export const DOUBLE_ELIM_SIZES = [4, 8, 16] as const;
export type DoubleElimSize = (typeof DOUBLE_ELIM_SIZES)[number];

/**
 * Standard double-elimination bracket for 4, 8, or 16 teams.
 *
 * Winners bracket from standard seedings; losers bracket uses the canonical
 * minor/major round pattern with WB losers reversed at each drop so teams don't meet
 * again immediately. Ends with a grand final (WB finalist is home / slot 0) and an
 * `ifNecessary` reset game that is only played if the losers-bracket finalist wins the
 * grand final (the two-loss rule). The 8-team output mirrors the standard bracket sheet.
 */
export function doubleEliminationPreset(numTeams: number): BracketStructure {
  if (numTeams !== 4 && numTeams !== 8 && numTeams !== 16) {
    throw new Error("Double elimination supports 4, 8, or 16 teams.");
  }
  const k = Math.log2(numTeams); // 2, 3, or 4
  let counter = 0;
  const genId = () => `g${++counter}`;
  const games: BracketGame[] = [];

  // ---- Winners bracket ----
  const seeds = bracketSeedings(numTeams);
  const wbRounds: string[][] = [];
  const r1: BracketGame[] = [];
  for (let i = 0; i < seeds.length; i += 2) {
    r1.push({
      id: genId(),
      seeds: [seeds[i], seeds[i + 1]],
      group: "winners",
      col: 0,
      row: i / 2,
      label: "WB R1",
    });
  }
  games.push(...r1);
  wbRounds.push(r1.map((g) => g.id));

  for (let r = 1; r < k; r++) {
    const prev = wbRounds[r - 1];
    const cur: BracketGame[] = [];
    for (let i = 0; i < prev.length; i += 2) {
      cur.push({
        id: genId(),
        feeds: [
          { from: prev[i], outcome: "winner" },
          { from: prev[i + 1], outcome: "winner" },
        ],
        group: "winners",
        col: r,
        label: r === k - 1 ? "WB Final" : `WB R${r + 1}`,
      });
    }
    games.push(...cur);
    wbRounds.push(cur.map((g) => g.id));
  }
  const wbFinalId = wbRounds[k - 1][0];

  // ---- Losers bracket ----
  let lbCol = 1;
  let lbPrev: string[] = [];

  // LB R1: pair losers of WB R1.
  {
    const wb1 = wbRounds[0];
    const cur: BracketGame[] = [];
    for (let i = 0; i < wb1.length; i += 2) {
      cur.push({
        id: genId(),
        feeds: [
          { from: wb1[i], outcome: "loser" },
          { from: wb1[i + 1], outcome: "loser" },
        ],
        group: "losers",
        col: lbCol,
        label: "LB R1",
      });
    }
    games.push(...cur);
    lbPrev = cur.map((g) => g.id);
    lbCol++;
  }

  // For each later WB round: a "major" drop round (WB losers, reversed, vs current LB winners),
  // then a "minor" consolidation round while more than one game remains.
  for (let r = 1; r < k; r++) {
    const dropped = [...wbRounds[r]].reverse();
    const major: BracketGame[] = [];
    for (let i = 0; i < lbPrev.length; i++) {
      major.push({
        id: genId(),
        feeds: [
          { from: dropped[i], outcome: "loser" },
          { from: lbPrev[i], outcome: "winner" },
        ],
        group: "losers",
        col: lbCol,
        label: r === k - 1 ? "LB Final" : "LB",
      });
    }
    games.push(...major);
    lbPrev = major.map((g) => g.id);
    lbCol++;

    if (lbPrev.length > 1) {
      const minor: BracketGame[] = [];
      for (let i = 0; i < lbPrev.length; i += 2) {
        minor.push({
          id: genId(),
          feeds: [
            { from: lbPrev[i], outcome: "winner" },
            { from: lbPrev[i + 1], outcome: "winner" },
          ],
          group: "losers",
          col: lbCol,
          label: "LB",
        });
      }
      games.push(...minor);
      lbPrev = minor.map((g) => g.id);
      lbCol++;
    }
  }
  const lbFinalId = lbPrev[0];

  // ---- Grand final + (if necessary) reset ----
  const grandFinal: BracketGame = {
    id: genId(),
    feeds: [
      { from: wbFinalId, outcome: "winner" }, // WB finalist is home
      { from: lbFinalId, outcome: "winner" },
    ],
    group: "final",
    col: lbCol,
    label: "Grand Final",
  };
  games.push(grandFinal);
  games.push({
    id: genId(),
    feeds: [
      { from: grandFinal.id, outcome: "winner" },
      { from: grandFinal.id, outcome: "loser" },
    ],
    group: "final",
    col: lbCol + 1,
    ifNecessary: true,
    label: "Grand Final (if necessary)",
  });

  // ---- Row layout: center each game on its same-band feeders ----
  const byId = new Map(games.map((g) => [g.id, g]));
  let lbRow = numTeams / 2 + 1; // gap below the winners band
  for (const g of games) {
    if (g.group === "losers" && g.col === 1) {
      g.row = lbRow;
      lbRow += 1.5;
    }
  }
  const computeRow = (g: BracketGame): number => {
    if (g.row != null) return g.row;
    const feeds = gameFeeds(g);
    const sameBand = feeds.filter((f) => byId.get(f.from)?.group === g.group);
    const use = sameBand.length ? sameBand : feeds;
    const rows = use.map((f) => computeRow(byId.get(f.from)!));
    const avg = rows.reduce((a, b) => a + b, 0) / rows.length;
    g.row = avg;
    return avg;
  };
  for (const g of games) computeRow(g);

  // ---- Group into round buckets by column (round 0 keeps the seed games) ----
  const roundMap = new Map<number, BracketGame[]>();
  for (const g of games) {
    const col = g.col ?? 0;
    if (!roundMap.has(col)) roundMap.set(col, []);
    roundMap.get(col)!.push(g);
  }
  const rounds: BracketRound[] = Array.from(roundMap.keys())
    .sort((a, b) => a - b)
    .map((col) => ({ round: col, games: roundMap.get(col)! }));

  return { numTeams, rounds, bracketType: "double_elimination" };
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

export type BracketValidation = { valid: boolean; errors: string[] };

/** Full structural validation. For single-elim this just wraps {@link validateFirstRoundSeeds};
 * for double-elim it also checks every non-seed game has resolved feed sources, no dangling
 * references, exactly one grand final, and at most one reset game. */
export function validateBracket(structure: BracketStructure | null): BracketValidation {
  const errors: string[] = [];
  if (!structure || !structure.rounds?.length) {
    return { valid: false, errors: ["No bracket structure."] };
  }
  const seedCheck = validateFirstRoundSeeds(structure);
  if (!seedCheck.valid) {
    if (seedCheck.duplicates.length) errors.push(`Duplicate Round 1 seeds: ${seedCheck.duplicates.join(", ")}.`);
    if (seedCheck.missing.length) errors.push(`Missing Round 1 seeds: ${seedCheck.missing.join(", ")}.`);
  }
  if (isDoubleElim(structure)) {
    const ids = new Set<string>();
    for (const r of structure.rounds) for (const g of r.games) ids.add(g.id);
    let finals = 0;
    let resets = 0;
    for (const r of structure.rounds) {
      for (const g of r.games) {
        const isSeedGame = (g.seeds?.length ?? 0) > 0;
        if (!isSeedGame) {
          const feeds = gameFeeds(g);
          if (feeds.length < 2) errors.push(`${g.label ?? g.id} is missing a feed source.`);
          for (const f of feeds) {
            if (!f.from || !ids.has(f.from))
              errors.push(`${g.label ?? g.id} feeds from unknown game "${f.from}".`);
          }
        }
        if (g.group === "final") {
          if (g.ifNecessary) resets++;
          else finals++;
        }
      }
    }
    if (finals !== 1) errors.push(`Expected exactly one grand final, found ${finals}.`);
    if (resets > 1) errors.push(`Expected at most one reset game, found ${resets}.`);
  }
  return { valid: errors.length === 0, errors };
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
        feeds: g.feeds ? g.feeds.map((f) => ({ ...f })) : undefined,
        group: g.group,
        col: g.col,
        row: g.row,
        label: g.label,
        ifNecessary: g.ifNecessary,
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
    const feeds = gameFeeds(game);
    if (game.seeds && game.seeds.length > 0) {
      seeds = new Set(game.seeds.filter((s) => Number.isFinite(s)));
    } else if (feeds.length >= 1) {
      seeds = new Set<number>();
      for (const f of feeds) {
        for (const s of getSeeds(f.from)) seeds.add(s);
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

/** Remove a game and cascade: remove any game (in any round) that feeds from it — directly
 * or transitively. For round 0, decrement numTeams by the number of seeds removed. Works for
 * both single-elim (`feedsFrom`) and double-elim (`feeds`). */
export function deleteGameFromStructure(
  structure: BracketStructure,
  roundIndex: number,
  gameIndex: number
): BracketStructure {
  const round = structure.rounds[roundIndex];
  if (!round?.games[gameIndex]) return structure;
  const next = cloneStructure(structure);
  next.rounds[roundIndex].games.splice(gameIndex, 1);
  if (roundIndex === 0) {
    const seedsRemoved = structure.rounds[0].games[gameIndex].seeds?.length ?? 2;
    next.numTeams = Math.max(0, next.numTeams - seedsRemoved);
  }

  // Cascade to a fixpoint: any game referencing a removed id is itself removed.
  const removedIds = new Set<string>([round.games[gameIndex].id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const r of next.rounds) {
      for (let i = r.games.length - 1; i >= 0; i--) {
        const deps = gameFeeds(r.games[i]).map((f) => f.from);
        if (deps.some((id) => removedIds.has(id))) {
          removedIds.add(r.games[i].id);
          r.games.splice(i, 1);
          changed = true;
        }
      }
    }
  }
  return next;
}

/** Set one slot's feed source (game + winner/loser) for a double-elim game. Slot index is the
 * position in the `feeds` array (0 = home, 1 = visitor). Migrates a `feedsFrom` game to `feeds`. */
export function setGameFeed(
  structure: BracketStructure,
  gameId: string,
  slotIndex: number,
  source: FeedSource
): BracketStructure {
  const next = cloneStructure(structure);
  for (const r of next.rounds) {
    const game = r.games.find((g) => g.id === gameId);
    if (!game) continue;
    const feeds = gameFeeds(game).map((f) => ({ ...f }));
    while (feeds.length <= slotIndex) feeds.push({ from: "", outcome: "winner" });
    feeds[slotIndex] = { from: source.from, outcome: source.outcome };
    game.feeds = feeds;
    game.feedsFrom = undefined;
    return next;
  }
  return structure;
}

/** Add a game that feeds from two existing games with explicit winner/loser outcomes
 * (double-elim editing). Placed in the round bucket matching `col`. */
export function addFeedGame(
  structure: BracketStructure,
  feedA: FeedSource,
  feedB: FeedSource,
  opts?: { group?: BracketGame["group"]; col?: number; row?: number; label?: string }
): BracketStructure {
  const next = cloneStructure(structure);
  const newId = `g${getMaxGameIdNum(next) + 1}`;
  const game: BracketGame = {
    id: newId,
    feeds: [feedA, feedB],
    group: opts?.group,
    col: opts?.col,
    row: opts?.row,
    label: opts?.label,
  };
  const targetRoundNum = opts?.col ?? next.rounds.length;
  let bucket = next.rounds.find((r) => r.round === targetRoundNum);
  if (!bucket) {
    bucket = { round: targetRoundNum, games: [] };
    next.rounds.push(bucket);
    next.rounds.sort((a, b) => a.round - b.round);
  }
  bucket.games.push(game);
  return next;
}
