// Types and pure scheduling algorithm for auto-schedule feature.
// No DB access — pure TypeScript, safe to call from API routes.

export interface GameTimeSlot {
  time: string;         // "HH:MM" 24h
  fieldName: string;
  fieldLocation: string;
}

export interface DayRule {
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday, 6 = Saturday
  maxGamesPerDay: number;              // total games scheduled on this calendar day
  gameSlots: GameTimeSlot[];           // explicit time+field pairs for each slot
  maxGamesPerTeamOnDay: number;        // max games a single team can play on one calendar day (usually 1)
  targetGamesPerTeamForSeason?: number;// optional: desired total per team on this weekday across full season
}

export interface FieldConfig {
  name: string;
  location: string;
}

export interface ScheduleConfig {
  firstGameDate: string;    // "YYYY-MM-DD"
  lastGameDate: string;     // "YYYY-MM-DD"
  blackoutDates: string[];  // "YYYY-MM-DD"[]
  dayRules: DayRule[];
  fields: FieldConfig[];    // kept for backward compat; no longer used by buildSlots
  maxRepeatMatchups: number;// max times the same two teams play each other (1 = single round-robin)
  targetGamesPerTeam?: number; // desired total games per team for the season (drives repeat matchups)
  noBackToBackMatchups?: boolean; // if true, same two teams cannot play on consecutive game dates
  allowDoubleHeaders?: boolean; // if false (default), teams may not play more than once per calendar day
  evenHomeAway?: boolean; // if true (default), spread home/away games evenly per team
  evenFields?: boolean;   // if true (default), spread games across fields evenly per team
  evenTimes?: boolean;    // if true (default), spread games across time slots evenly per team
  evenRestDays?: boolean; // if true (default), penalize short rest between games for same team
  maxWeekdayGamesPerWeek?: number; // max Mon–Fri games per team per calendar week
  minWeekendGamesPerWeek?: number; // min Sat–Sun games per team per calendar week
  enforceRoundCompletion?: boolean; // if true (default), all opponents played X times before any Y times
  roundCompletionX?: number;        // opponents must be met X times first (default 1)
  roundCompletionY?: number;        // before meeting any opponent Y times (default 2)
}

/**
 * Normalize a ScheduleConfig loaded from the DB.
 * Old records use `gameTimes: string[]` on each DayRule.
 * New records use `gameSlots: GameTimeSlot[]`.
 * Idempotent — safe to call on already-normalized configs.
 */
export function normalizeScheduleConfig(raw: unknown): ScheduleConfig {
  const config = (raw ?? {}) as Record<string, unknown>;

  const dayRules: DayRule[] = ((config.dayRules as unknown[]) ?? []).map(
    (r: unknown): DayRule => {
      const rule = r as Record<string, unknown>;
      if (Array.isArray(rule.gameSlots)) {
        const typed = rule as unknown as DayRule;
        // Ensure maxGamesPerDay is never less than the number of defined slots
        if (typed.maxGamesPerDay < typed.gameSlots.length) {
          return { ...typed, maxGamesPerDay: typed.gameSlots.length };
        }
        return typed;
      }
      const oldTimes: string[] = Array.isArray(rule.gameTimes)
        ? (rule.gameTimes as string[])
        : [];
      const gameSlots: GameTimeSlot[] = oldTimes.map(t => ({
        time: t,
        fieldName: '',
        fieldLocation: '',
      }));
      const { gameTimes: _dropped, ...rest } = rule;
      void _dropped;
      return { ...(rest as Omit<DayRule, 'gameSlots'>), gameSlots };
    }
  );

  return {
    firstGameDate: (config.firstGameDate as string) ?? '',
    lastGameDate: (config.lastGameDate as string) ?? '',
    blackoutDates: (config.blackoutDates as string[]) ?? [],
    dayRules,
    fields: (config.fields as FieldConfig[]) ?? [],
    maxRepeatMatchups: (config.maxRepeatMatchups as number) ?? 1,
    targetGamesPerTeam: (config.targetGamesPerTeam as number | undefined),
    noBackToBackMatchups: (config.noBackToBackMatchups as boolean | undefined),
    allowDoubleHeaders: (config.allowDoubleHeaders as boolean | undefined),
    evenHomeAway: (config.evenHomeAway as boolean | undefined),
    evenFields:   (config.evenFields   as boolean | undefined),
    evenTimes:    (config.evenTimes    as boolean | undefined),
    evenRestDays: (config.evenRestDays as boolean | undefined),
    maxWeekdayGamesPerWeek: (config.maxWeekdayGamesPerWeek as number | undefined),
    minWeekendGamesPerWeek: (config.minWeekendGamesPerWeek as number | undefined),
    enforceRoundCompletion: (config.enforceRoundCompletion as boolean | undefined) ?? false,
    roundCompletionX: (config.roundCompletionX as number | undefined) ?? 1,
    roundCompletionY: (config.roundCompletionY as number | undefined) ?? 2,
  };
}

export interface GeneratedGame {
  gamedate: string;  // "YYYY-MM-DD"
  gametime: string;  // "HH:MM"
  home: number;      // teamId
  away: number;      // teamId
  home_team: string;
  away_team: string;
  location: string;
  field: string;
}

export interface ScheduleResult {
  games: GeneratedGame[];
  warnings: string[];
  stats: {
    totalGames: number;
    teamGameCounts: Record<number, number>;   // teamId → total games
    matchupCounts: Record<string, number>;    // "minId-maxId" → count
  };
}

export interface Team {
  id: number;
  name: string;
}

// ─── Internal types ───────────────────────────────────────────────────────────

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export interface Slot {
  date: string;
  time: string;
  field: FieldConfig;
  rule: DayRule;
}

interface Matchup {
  home: Team;
  away: Team;
}

function parseUTCDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatUTCDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Return the ISO Monday of the calendar week containing dateStr. */
export function weekMonday(dateStr: string): string {
  const d = parseUTCDate(dateStr);
  const daysToMon = (d.getUTCDay() + 6) % 7; // 0 if Mon, 6 if Sun
  d.setUTCDate(d.getUTCDate() - daysToMon);
  return formatUTCDate(d);
}

/** Enumerate every available game slot in the date range. */
export function buildSlots(config: ScheduleConfig): Slot[] {
  const slots: Slot[] = [];
  const end = parseUTCDate(config.lastGameDate);
  const cursor = parseUTCDate(config.firstGameDate);

  while (cursor <= end) {
    const dateStr = formatUTCDate(cursor);
    if (!config.blackoutDates.includes(dateStr)) {
      const dow = cursor.getUTCDay() as DayRule['dayOfWeek'];
      const rule = config.dayRules.find(r => r.dayOfWeek === dow);
      if (rule) {
        const limit = Math.min(rule.gameSlots.length, rule.maxGamesPerDay);
        for (let i = 0; i < limit; i++) {
          const gs = rule.gameSlots[i];
          slots.push({
            date: dateStr,
            time: gs.time,
            field: { name: gs.fieldName, location: gs.fieldLocation },
            rule,
          });
        }
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return slots;
}

export type { Matchup };

/** Generate all matchup pairs up to maxRepeat times, shuffled. */
export function buildMatchups(teams: Team[], maxRepeat: number): Matchup[] {
  const pairs: Matchup[] = [];
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      for (let r = 0; r < maxRepeat; r++) {
        // Alternate home/away on repeat matchups
        pairs.push(r % 2 === 0
          ? { home: teams[i], away: teams[j] }
          : { home: teams[j], away: teams[i] });
      }
    }
  }
  // Fisher-Yates shuffle
  for (let i = pairs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
  }
  return pairs;
}

// ─── Circle-method balanced game generation ───────────────────────────────────

/**
 * Generate N-1 rounds using the circle method (N = even team count).
 * Odd rosters are augmented with a virtual bye (id = -1); games involving
 * the bye are omitted so each real team gets one bye per cycle.
 */
function circleRounds(teams: Team[]): Matchup[][] {
  const n = teams.length;
  if (n < 2) return [];
  const aug = n % 2 === 0 ? [...teams] : [...teams, { id: -1, name: '' }];
  const m = aug.length; // always even
  const rotating = aug.slice(0, m - 1);
  const pinned = aug[m - 1];
  const rounds: Matchup[][] = [];
  for (let r = 0; r < m - 1; r++) {
    const round: Matchup[] = [];
    if (rotating[0].id >= 0 && pinned.id >= 0) {
      round.push(r % 2 === 0
        ? { home: rotating[0], away: pinned }
        : { home: pinned, away: rotating[0] });
    }
    for (let k = 1; k < m / 2; k++) {
      const a = rotating[k], b = rotating[m - 1 - k];
      if (a.id >= 0 && b.id >= 0) {
        round.push((r + k) % 2 === 0 ? { home: a, away: b } : { home: b, away: a });
      }
    }
    rounds.push(round);
    rotating.unshift(rotating.pop()!);
  }
  return rounds;
}

/**
 * Build a game list guaranteeing every team plays exactly `target` games.
 *
 * For even rosters, uses the circle method:
 *   - `base` full round-robins → each team plays (N-1) × base games
 *   - `extra` leading circle rounds top each team up to exactly `target`
 *
 * For odd rosters, falls back to the shuffled-pool approach (exact balance
 * is not achievable when N × target is odd).
 */
export function generateBalancedGames(teams: Team[], target: number): Matchup[] {
  if (teams.length < 2 || target < 1) return [];
  const n = teams.length;

  if (n % 2 !== 0) {
    // Odd N: pool approach — game-count cap in Phase 2 handles the rest
    return buildMatchups(teams, Math.max(1, Math.ceil(target / (n - 1)) + 1));
  }

  const rounds  = circleRounds(teams); // n-1 rounds of n/2 games each
  const perCycle = n - 1;              // games per team in one full cycle
  const base    = Math.floor(target / perCycle);
  const extra   = target - base * perCycle; // 0 … n-2

  // Build rounds as contiguous blocks. Shuffle ROUND ORDER within each cycle
  // and shuffle WITHIN each round, but NOT the global flat list.
  // Keeping each round as a contiguous block preserves the non-overlapping
  // property that the date-by-date scheduler relies on: each consecutive block
  // of n/2 matchups covers all n teams exactly once, so Phase 1 can always
  // consume one complete block per date without stranding the last slot.
  const allRounds: Matchup[][] = [];

  for (let b = 0; b < base; b++) {
    // Shuffle round order within this cycle for schedule variety.
    const roundIdxs = Array.from({ length: rounds.length }, (_, i) => i);
    for (let i = roundIdxs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [roundIdxs[i], roundIdxs[j]] = [roundIdxs[j], roundIdxs[i]];
    }
    for (const ri of roundIdxs) {
      // Flip H/A on alternate cycles for balance.
      const round = rounds[ri].map(m =>
        b % 2 === 0 ? m : { home: m.away, away: m.home }
      );
      // Shuffle within this round so field/time assignment varies.
      for (let i = round.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [round[i], round[j]] = [round[j], round[i]];
      }
      allRounds.push(round);
    }
  }

  for (let r = 0; r < extra; r++) {
    const round = [...rounds[r]];
    for (let i = round.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [round[i], round[j]] = [round[j], round[i]];
    }
    allRounds.push(round);
  }

  // Flatten: each round is a contiguous block, non-overlapping within the block.
  return allRounds.flat();
}

/**
 * Generate a schedule from config + team list.
 * Pure function — no DB access, safe to call from any context.
 */
export function generateSchedule(config: ScheduleConfig, teams: Team[]): ScheduleResult {
  if (teams.length < 2) {
    return {
      games: [],
      warnings: ['Need at least 2 teams enrolled to generate a schedule.'],
      stats: { totalGames: 0, teamGameCounts: {}, matchupCounts: {} },
    };
  }

  // If the user specified a per-team game target, derive maxRepeatMatchups from it.
  const effectiveRepeat = config.targetGamesPerTeam
    ? Math.max(1, Math.ceil(config.targetGamesPerTeam / (teams.length - 1)) + 1)
    : config.maxRepeatMatchups;

  const slots = buildSlots(config);
  const pending = buildMatchups(teams, effectiveRepeat);
  const games: GeneratedGame[] = [];
  // date → teamId → games-played-on-that-date
  const teamsPerDate = new Map<string, Map<number, number>>();
  // teamId → total games scheduled so far (for target enforcement and load balancing)
  const gamesPerTeam = new Map<number, number>();
  const homeCount    = new Map<number, number>();
  const awayCount    = new Map<number, number>();
  const fieldCount   = new Map<number, Map<string, number>>();
  const timeCount    = new Map<number, Map<string, number>>();
  for (const t of teams) {
    gamesPerTeam.set(t.id, 0); homeCount.set(t.id, 0); awayCount.set(t.id, 0);
    fieldCount.set(t.id, new Map()); timeCount.set(t.id, new Map());
  }

  // Build ordered unique game dates for back-to-back detection
  const gameDates = [...new Set(slots.map(s => s.date))].sort();
  const prevGameDate = new Map<string, string>();
  for (let i = 1; i < gameDates.length; i++) {
    prevGameDate.set(gameDates[i], gameDates[i - 1]);
  }
  // matchup key → date of most recent game between that pair
  const matchupLastDate = new Map<string, string>();
  // matchup key → count of games placed so far
  const matchupCount = new Map<string, number>();
  // "${teamId}|${weekMonday}" → weekday games placed that week
  const weekdayGamesPerTeamWeek = new Map<string, number>();
  // "${teamId}|${weekMonday}" → weekend games placed that week
  const weekendGamesPerTeamWeek = new Map<string, number>();

  for (const slot of slots) {
    // Sort pending so the most-underserved team pairs come first in the scan.
    // This is the primary game-count balancing mechanism.
    pending.sort((a, b) =>
      ((gamesPerTeam.get(a.home.id) ?? 0) + (gamesPerTeam.get(a.away.id) ?? 0)) -
      ((gamesPerTeam.get(b.home.id) ?? 0) + (gamesPerTeam.get(b.away.id) ?? 0))
    );

    const dateMap = teamsPerDate.get(slot.date) ?? new Map<number, number>();
    const prevDate = prevGameDate.get(slot.date);
    const fk = `${slot.field.name}|${slot.field.location}`;
    const slotDow = new Date(slot.date + 'T00:00:00Z').getUTCDay();
    const slotIsWeekday = slotDow >= 1 && slotDow <= 5;
    const slotWeek = weekMonday(slot.date);

    function scoreOrientation(home: Team, away: Team): number {
      let s = (gamesPerTeam.get(home.id) ?? 0) + (gamesPerTeam.get(away.id) ?? 0);
      if (config.evenHomeAway ?? true) s += (homeCount.get(home.id) ?? 0) + (awayCount.get(away.id) ?? 0);
      if (config.evenFields  ?? true) s += (fieldCount.get(home.id)?.get(fk) ?? 0) + (fieldCount.get(away.id)?.get(fk) ?? 0);
      if (config.evenTimes   ?? true) s += (timeCount.get(home.id)?.get(slot.time) ?? 0) + (timeCount.get(away.id)?.get(slot.time) ?? 0);
      if (!slotIsWeekday && config.minWeekendGamesPerWeek) {
        if ((weekendGamesPerTeamWeek.get(`${home.id}|${slotWeek}`) ?? 0) >= config.minWeekendGamesPerWeek) s += 3;
        if ((weekendGamesPerTeamWeek.get(`${away.id}|${slotWeek}`) ?? 0) >= config.minWeekendGamesPerWeek) s += 3;
      }
      return s;
    }

    let bestIdx = -1, bestScore = Infinity, bestFlipped = false;
    for (let i = 0; i < pending.length; i++) {
      const m = pending[i];
      const h = dateMap.get(m.home.id) ?? 0;
      const a = dateMap.get(m.away.id) ?? 0;
      if (h >= slot.rule.maxGamesPerTeamOnDay || a >= slot.rule.maxGamesPerTeamOnDay) continue;
      if (config.targetGamesPerTeam) {
        if ((gamesPerTeam.get(m.home.id) ?? 0) >= config.targetGamesPerTeam) continue;
        if ((gamesPerTeam.get(m.away.id) ?? 0) >= config.targetGamesPerTeam) continue;
      }
      if (config.noBackToBackMatchups && prevDate) {
        const key = `${Math.min(m.home.id, m.away.id)}-${Math.max(m.home.id, m.away.id)}`;
        if (matchupLastDate.get(key) === prevDate) continue;
      }
      if (config.maxWeekdayGamesPerWeek && slotIsWeekday) {
        if ((weekdayGamesPerTeamWeek.get(`${m.home.id}|${slotWeek}`) ?? 0) >= config.maxWeekdayGamesPerWeek) continue;
        if ((weekdayGamesPerTeamWeek.get(`${m.away.id}|${slotWeek}`) ?? 0) >= config.maxWeekdayGamesPerWeek) continue;
      }
      let sA = scoreOrientation(m.home, m.away);
      let sB = (config.evenHomeAway ?? true) ? scoreOrientation(m.away, m.home) : sA;
      if (config.enforceRoundCompletion !== false && teams.length > 2) {
        const rcY = config.roundCompletionY ?? 2;
        const rcKey = `${Math.min(m.home.id, m.away.id)}-${Math.max(m.home.id, m.away.id)}`;
        const currentCount = matchupCount.get(rcKey) ?? 0;
        if (currentCount + 1 >= rcY) {
          let penalty = 0;
          for (const t of teams) {
            if (t.id === m.home.id || t.id === m.away.id) continue;
            const hk = `${Math.min(m.home.id, t.id)}-${Math.max(m.home.id, t.id)}`;
            const ak = `${Math.min(m.away.id, t.id)}-${Math.max(m.away.id, t.id)}`;
            if ((matchupCount.get(hk) ?? 0) < currentCount) penalty += 1000;
            if ((matchupCount.get(ak) ?? 0) < currentCount) penalty += 1000;
          }
          sA += penalty;
          sB += penalty;
        }
      }
      const best = Math.min(sA, sB);
      if (best < bestScore) { bestScore = best; bestIdx = i; bestFlipped = sB < sA; }
    }

    // Fallback 1: relax back-to-back constraint
    if (bestIdx === -1 && config.noBackToBackMatchups && prevDate) {
      for (let i = 0; i < pending.length; i++) {
        const m = pending[i];
        const h = dateMap.get(m.home.id) ?? 0;
        const a = dateMap.get(m.away.id) ?? 0;
        if (h >= slot.rule.maxGamesPerTeamOnDay || a >= slot.rule.maxGamesPerTeamOnDay) continue;
        if (config.targetGamesPerTeam) {
          if ((gamesPerTeam.get(m.home.id) ?? 0) >= config.targetGamesPerTeam) continue;
          if ((gamesPerTeam.get(m.away.id) ?? 0) >= config.targetGamesPerTeam) continue;
        }
        if (config.maxWeekdayGamesPerWeek && slotIsWeekday) {
          if ((weekdayGamesPerTeamWeek.get(`${m.home.id}|${slotWeek}`) ?? 0) >= config.maxWeekdayGamesPerWeek) continue;
          if ((weekdayGamesPerTeamWeek.get(`${m.away.id}|${slotWeek}`) ?? 0) >= config.maxWeekdayGamesPerWeek) continue;
        }
        let sA = scoreOrientation(m.home, m.away);
        let sB = (config.evenHomeAway ?? true) ? scoreOrientation(m.away, m.home) : sA;
        if (config.enforceRoundCompletion !== false && teams.length > 2) {
          const rcY = config.roundCompletionY ?? 2;
          const rcKey = `${Math.min(m.home.id, m.away.id)}-${Math.max(m.home.id, m.away.id)}`;
          const currentCount = matchupCount.get(rcKey) ?? 0;
          if (currentCount + 1 >= rcY) {
            let penalty = 0;
            for (const t of teams) {
              if (t.id === m.home.id || t.id === m.away.id) continue;
              const hk = `${Math.min(m.home.id, t.id)}-${Math.max(m.home.id, t.id)}`;
              const ak = `${Math.min(m.away.id, t.id)}-${Math.max(m.away.id, t.id)}`;
              if ((matchupCount.get(hk) ?? 0) < currentCount) penalty += 1000;
              if ((matchupCount.get(ak) ?? 0) < currentCount) penalty += 1000;
            }
            sA += penalty;
            sB += penalty;
          }
        }
        const best = Math.min(sA, sB);
        if (best < bestScore) { bestScore = best; bestIdx = i; bestFlipped = sB < sA; }
      }
    }

    // Fallback 2: also relax round-completion constraint
    if (bestIdx === -1 && config.enforceRoundCompletion !== false) {
      for (let i = 0; i < pending.length; i++) {
        const m = pending[i];
        const h = dateMap.get(m.home.id) ?? 0;
        const a = dateMap.get(m.away.id) ?? 0;
        if (h >= slot.rule.maxGamesPerTeamOnDay || a >= slot.rule.maxGamesPerTeamOnDay) continue;
        if (config.targetGamesPerTeam) {
          if ((gamesPerTeam.get(m.home.id) ?? 0) >= config.targetGamesPerTeam) continue;
          if ((gamesPerTeam.get(m.away.id) ?? 0) >= config.targetGamesPerTeam) continue;
        }
        if (config.maxWeekdayGamesPerWeek && slotIsWeekday) {
          if ((weekdayGamesPerTeamWeek.get(`${m.home.id}|${slotWeek}`) ?? 0) >= config.maxWeekdayGamesPerWeek) continue;
          if ((weekdayGamesPerTeamWeek.get(`${m.away.id}|${slotWeek}`) ?? 0) >= config.maxWeekdayGamesPerWeek) continue;
        }
        const sA = scoreOrientation(m.home, m.away);
        const sB = (config.evenHomeAway ?? true) ? scoreOrientation(m.away, m.home) : sA;
        const best = Math.min(sA, sB);
        if (best < bestScore) { bestScore = best; bestIdx = i; bestFlipped = sB < sA; }
      }
    }

    if (bestIdx === -1) continue;
    const raw = pending.splice(bestIdx, 1)[0];
    const matchup = bestFlipped ? { home: raw.away, away: raw.home } : raw;

    const pairKey = `${Math.min(matchup.home.id, matchup.away.id)}-${Math.max(matchup.home.id, matchup.away.id)}`;
    matchupLastDate.set(pairKey, slot.date);
    matchupCount.set(pairKey, (matchupCount.get(pairKey) ?? 0) + 1);
    if (slotIsWeekday) {
      const hWK = `${matchup.home.id}|${slotWeek}`;
      const aWK = `${matchup.away.id}|${slotWeek}`;
      weekdayGamesPerTeamWeek.set(hWK, (weekdayGamesPerTeamWeek.get(hWK) ?? 0) + 1);
      weekdayGamesPerTeamWeek.set(aWK, (weekdayGamesPerTeamWeek.get(aWK) ?? 0) + 1);
    } else {
      const hWK = `${matchup.home.id}|${slotWeek}`;
      const aWK = `${matchup.away.id}|${slotWeek}`;
      weekendGamesPerTeamWeek.set(hWK, (weekendGamesPerTeamWeek.get(hWK) ?? 0) + 1);
      weekendGamesPerTeamWeek.set(aWK, (weekendGamesPerTeamWeek.get(aWK) ?? 0) + 1);
    }
    gamesPerTeam.set(matchup.home.id, (gamesPerTeam.get(matchup.home.id) ?? 0) + 1);
    gamesPerTeam.set(matchup.away.id, (gamesPerTeam.get(matchup.away.id) ?? 0) + 1);
    homeCount.set(matchup.home.id, (homeCount.get(matchup.home.id) ?? 0) + 1);
    awayCount.set(matchup.away.id, (awayCount.get(matchup.away.id) ?? 0) + 1);
    const hfm = fieldCount.get(matchup.home.id)!; hfm.set(fk, (hfm.get(fk) ?? 0) + 1);
    const afm = fieldCount.get(matchup.away.id)!; afm.set(fk, (afm.get(fk) ?? 0) + 1);
    const htm = timeCount.get(matchup.home.id)!;  htm.set(slot.time, (htm.get(slot.time) ?? 0) + 1);
    const atm = timeCount.get(matchup.away.id)!;  atm.set(slot.time, (atm.get(slot.time) ?? 0) + 1);

    games.push({
      gamedate: slot.date,
      gametime: slot.time,
      home: matchup.home.id,
      away: matchup.away.id,
      home_team: matchup.home.name,
      away_team: matchup.away.name,
      location: slot.field.location,
      field: slot.field.name,
    });

    if (!teamsPerDate.has(slot.date)) teamsPerDate.set(slot.date, new Map());
    const dm = teamsPerDate.get(slot.date)!;
    dm.set(matchup.home.id, (dm.get(matchup.home.id) ?? 0) + 1);
    dm.set(matchup.away.id, (dm.get(matchup.away.id) ?? 0) + 1);
  }

  const warnings: string[] = [];
  if (pending.length > 0) {
    warnings.push(`${pending.length} matchup(s) could not be placed — not enough available slots.`);
  }

  for (const rule of config.dayRules) {
    if (!rule.targetGamesPerTeamForSeason) continue;
    const dayName = DAY_NAMES[rule.dayOfWeek];
    for (const team of teams) {
      const actual = games.filter(
        g => (g.home === team.id || g.away === team.id) &&
             parseUTCDate(g.gamedate).getUTCDay() === rule.dayOfWeek
      ).length;
      if (actual < rule.targetGamesPerTeamForSeason) {
        warnings.push(
          `${team.name}: ${actual}/${rule.targetGamesPerTeamForSeason} ${dayName} games scheduled`
        );
      }
    }
  }

  const teamGameCounts: Record<number, number> = {};
  for (const team of teams) {
    teamGameCounts[team.id] = games.filter(g => g.home === team.id || g.away === team.id).length;
  }
  const matchupCounts: Record<string, number> = {};
  for (const g of games) {
    const key = `${Math.min(g.home, g.away)}-${Math.max(g.home, g.away)}`;
    matchupCounts[key] = (matchupCounts[key] ?? 0) + 1;
  }

  return { games, warnings, stats: { totalGames: games.length, teamGameCounts, matchupCounts } };
}
