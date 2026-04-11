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
    ? Math.max(1, Math.ceil(config.targetGamesPerTeam / (teams.length - 1)))
    : config.maxRepeatMatchups;

  const slots = buildSlots(config);
  const pending = buildMatchups(teams, effectiveRepeat);
  const games: GeneratedGame[] = [];
  // date → teamId → games-played-on-that-date
  const teamsPerDate = new Map<string, Map<number, number>>();
  // teamId → total games scheduled so far (for target enforcement and load balancing)
  const gamesPerTeam = new Map<number, number>();
  for (const t of teams) gamesPerTeam.set(t.id, 0);

  // Build ordered unique game dates for back-to-back detection
  const gameDates = [...new Set(slots.map(s => s.date))].sort();
  const prevGameDate = new Map<string, string>();
  for (let i = 1; i < gameDates.length; i++) {
    prevGameDate.set(gameDates[i], gameDates[i - 1]);
  }
  // matchup key → date of most recent game between that pair
  const matchupLastDate = new Map<string, string>();

  for (const slot of slots) {
    const dateMap = teamsPerDate.get(slot.date) ?? new Map<number, number>();
    const prevDate = prevGameDate.get(slot.date);

    // Select the valid matchup where both teams have the fewest total games so far.
    // This balances game counts across teams instead of taking the first shuffled match.
    let bestIdx = -1;
    let bestScore = Infinity;
    for (let i = 0; i < pending.length; i++) {
      const m = pending[i];
      const h = dateMap.get(m.home.id) ?? 0;
      const a = dateMap.get(m.away.id) ?? 0;
      if (h >= slot.rule.maxGamesPerTeamOnDay || a >= slot.rule.maxGamesPerTeamOnDay) continue;
      const hTotal = gamesPerTeam.get(m.home.id) ?? 0;
      const aTotal = gamesPerTeam.get(m.away.id) ?? 0;
      if (config.targetGamesPerTeam) {
        if (hTotal >= config.targetGamesPerTeam || aTotal >= config.targetGamesPerTeam) continue;
      }
      if (config.noBackToBackMatchups && prevDate) {
        const key = `${Math.min(m.home.id, m.away.id)}-${Math.max(m.home.id, m.away.id)}`;
        if (matchupLastDate.get(key) === prevDate) continue;
      }
      const score = hTotal + aTotal;
      if (score < bestScore) { bestScore = score; bestIdx = i; }
    }

    if (bestIdx === -1) continue;
    const [matchup] = pending.splice(bestIdx, 1);

    const pairKey = `${Math.min(matchup.home.id, matchup.away.id)}-${Math.max(matchup.home.id, matchup.away.id)}`;
    matchupLastDate.set(pairKey, slot.date);
    gamesPerTeam.set(matchup.home.id, (gamesPerTeam.get(matchup.home.id) ?? 0) + 1);
    gamesPerTeam.set(matchup.away.id, (gamesPerTeam.get(matchup.away.id) ?? 0) + 1);

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
    const m = teamsPerDate.get(slot.date)!;
    m.set(matchup.home.id, (m.get(matchup.home.id) ?? 0) + 1);
    m.set(matchup.away.id, (m.get(matchup.away.id) ?? 0) + 1);
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
