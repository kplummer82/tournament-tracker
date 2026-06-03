// Types and pure scheduling algorithm for tournament pool-play auto-scheduling.
// No DB access — pure TypeScript, safe to call from API routes.
//
// Differs from the season scheduler (lib/auto-schedule.ts) in three ways:
//   1. Time slots are defined per calendar DATE, not per day-of-week (tournaments
//      are short, so repeating weekday rules add no value).
//   2. Round-robin runs WITHIN each pool group — teams only play opponents that
//      share their pool group (a single group / no groups = one round-robin).
//   3. Each slot carries a tournament venue + field, so generated games link to
//      tournament_venues rather than freeform location text.

export interface TournamentTimeSlot {
  time: string;                       // "HH:MM" 24h
  tournamentVenueId: number | null;   // tournament_venues.id
  field: string;                      // field name within that venue
  poolGroup: string | null;           // which pool group plays this slot (null = any group)
  blockedTeamIds?: number[];          // teams that must NOT be scheduled in this slot
}

export interface DateRule {
  date: string;                       // "YYYY-MM-DD"
  slots: TournamentTimeSlot[];
  maxGamesPerTeamOnDate?: number;     // optional per-date cap; undefined = no limit
}

export interface TournamentScheduleConfig {
  firstGameDate: string;              // "YYYY-MM-DD"
  lastGameDate: string;               // "YYYY-MM-DD"
  blackoutDates: string[];            // "YYYY-MM-DD"[]
  dateRules: DateRule[];              // explicit per-date slot definitions
  preventDuplicateMatchups: boolean;  // if true, a pair plays each other at most once
  minGamesPerTeam?: number;           // warn if any team falls below this
  maxGamesPerTeam?: number;           // hard cap on games per team
  gameDurationMinutes?: number;       // max length of a game; used to detect field double-booking
}

export interface TournamentTeam {
  id: number;
  name: string;
  poolGroup: string | null;
}

export interface TournamentGeneratedGame {
  gamedate: string;                   // "YYYY-MM-DD"
  gametime: string;                   // "HH:MM"
  home: number;
  away: number;
  home_team: string;
  away_team: string;
  tournament_venue_id: number | null;
  field: string;
}

export interface TournamentScheduleResult {
  games: TournamentGeneratedGame[];
  warnings: string[];
  stats: {
    totalGames: number;
    teamGameCounts: Record<number, number>;
    byGroup: Record<string, number>;
  };
}

/**
 * Travel-time context for the cross-location rule. A team can't be at venue B
 * before it could drive there from venue A:
 *   game1.start + gameDurationMinutes + changeoverMinutes + drive(A→B) ≤ game2.start
 * Only predefined locations have coordinates → only venues mapped to a location
 * participate; pairs with a custom/unknown venue (or no cached drive time) are
 * skipped (no constraint, no warning — never a false positive).
 */
export interface TravelContext {
  /** tournamentVenueId → predefined locationId (null for custom/unknown). */
  venueLocation: Record<number, number | null>;
  /** "origLocId-destLocId" → driving minutes. */
  drivingMinutes: Record<string, number>;
  /** Fixed pack-up/park/unpack buffer between fields. */
  changeoverMinutes: number;
}

export interface ScheduledGameLite {
  date: string;
  time: string; // "HH:MM"
  home: number;
  away: number;
  tournamentVenueId: number | null;
}

export interface TravelConflict {
  teamId: number;
  date: string;
  fromVenueId: number | null;
  toVenueId: number | null;
  game1Time: string;
  game2Time: string;
  needMinutes: number; // earliest feasible arrival (minutes since midnight)
  gapMinutes: number; // actual minutes between game1 start and game2 start
}

const DEFAULT_GROUP = "__default__";

/** Normalize a config loaded from the DB (or a partial UI draft). Idempotent. */
export function normalizeTournamentScheduleConfig(raw: unknown): TournamentScheduleConfig {
  const c = (raw ?? {}) as Record<string, unknown>;

  const dateRules: DateRule[] = (Array.isArray(c.dateRules) ? c.dateRules : []).map(
    (r: unknown): DateRule => {
      const rule = (r ?? {}) as Record<string, unknown>;
      const slots: TournamentTimeSlot[] = (Array.isArray(rule.slots) ? rule.slots : []).map(
        (s: unknown): TournamentTimeSlot => {
          const slot = (s ?? {}) as Record<string, unknown>;
          const blocked = Array.isArray(slot.blockedTeamIds)
            ? [
                ...new Set(
                  (slot.blockedTeamIds as unknown[])
                    .map((x) => Number(x))
                    .filter((n) => Number.isFinite(n)),
                ),
              ]
            : undefined;
          return {
            time: typeof slot.time === "string" ? slot.time : "",
            tournamentVenueId:
              slot.tournamentVenueId != null ? Number(slot.tournamentVenueId) : null,
            field: typeof slot.field === "string" ? slot.field : "",
            poolGroup:
              typeof slot.poolGroup === "string" && slot.poolGroup.trim() !== ""
                ? slot.poolGroup
                : null,
            ...(blocked && blocked.length > 0 ? { blockedTeamIds: blocked } : {}),
          };
        },
      );
      return {
        date: typeof rule.date === "string" ? rule.date : "",
        slots,
        maxGamesPerTeamOnDate:
          typeof rule.maxGamesPerTeamOnDate === "number" && rule.maxGamesPerTeamOnDate >= 1
            ? rule.maxGamesPerTeamOnDate
            : undefined,
      };
    },
  );

  return {
    firstGameDate: typeof c.firstGameDate === "string" ? c.firstGameDate : "",
    lastGameDate: typeof c.lastGameDate === "string" ? c.lastGameDate : "",
    blackoutDates: Array.isArray(c.blackoutDates) ? (c.blackoutDates as string[]) : [],
    dateRules,
    preventDuplicateMatchups:
      typeof c.preventDuplicateMatchups === "boolean" ? c.preventDuplicateMatchups : true,
    minGamesPerTeam: c.minGamesPerTeam != null ? Number(c.minGamesPerTeam) : undefined,
    maxGamesPerTeam: c.maxGamesPerTeam != null ? Number(c.maxGamesPerTeam) : undefined,
    gameDurationMinutes:
      c.gameDurationMinutes != null && Number(c.gameDurationMinutes) > 0
        ? Number(c.gameDurationMinutes)
        : undefined,
  };
}

/** Minutes since midnight for an "HH:MM" string, or null if unparseable. */
function timeToMinutes(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t ?? "");
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export interface SlotOverlap {
  date: string;
  venueId: number | null;
  field: string;
  timeA: string;
  timeB: string;
}

/**
 * Detect field double-bookings: pairs of slots on the same date + venue + field
 * whose start times are closer together than `gameDurationMinutes`. Pure — used
 * by the UI to warn when slots would overlap. Returns an empty list when no
 * duration is set (the rule is inactive without one).
 */
export function findSlotOverlaps(
  config: TournamentScheduleConfig,
): SlotOverlap[] {
  const duration = config.gameDurationMinutes;
  if (!duration || duration <= 0) return [];

  const overlaps: SlotOverlap[] = [];
  for (const rule of config.dateRules) {
    // Group this date's slots by venue+field key (field matched case-insensitively,
    // but we keep the original label + venue id for display).
    const byField = new Map<
      string,
      { venueId: number | null; field: string; items: { time: string; mins: number }[] }
    >();
    for (const s of rule.slots) {
      const mins = timeToMinutes(s.time);
      if (mins == null) continue;
      const venueId = s.tournamentVenueId ?? null;
      const field = s.field ?? "";
      const key = `${venueId ?? "none"}|${field.toLowerCase()}`;
      const group = byField.get(key) ?? { venueId, field, items: [] };
      group.items.push({ time: s.time, mins });
      byField.set(key, group);
    }
    for (const { venueId, field, items } of byField.values()) {
      if (items.length < 2) continue;
      const sorted = [...items].sort((a, b) => a.mins - b.mins);
      for (let i = 0; i < sorted.length - 1; i++) {
        // Compare to the next one; if they overlap, also keep scanning forward
        // for further overlaps with the same start.
        for (let j = i + 1; j < sorted.length; j++) {
          if (sorted[j].mins - sorted[i].mins < duration) {
            overlaps.push({
              date: rule.date,
              venueId,
              field,
              timeA: sorted[i].time,
              timeB: sorted[j].time,
            });
          } else {
            break; // sorted — no later slot can overlap with i either
          }
        }
      }
    }
  }
  return overlaps;
}

/** drive minutes between two predefined locations, or null if unknown. */
function driveBetween(
  travel: TravelContext,
  fromVenueId: number | null,
  toVenueId: number | null,
): number | null {
  if (fromVenueId == null || toVenueId == null) return null;
  const fromLoc = travel.venueLocation[fromVenueId];
  const toLoc = travel.venueLocation[toVenueId];
  if (fromLoc == null || toLoc == null) return null; // custom venue → no check
  if (fromLoc === toLoc) return 0; // same location, different field handled elsewhere
  const m = travel.drivingMinutes[`${fromLoc}-${toLoc}`];
  return m != null && Number.isFinite(m) ? m : null;
}

/**
 * Detect cross-location travel conflicts in a set of assigned games: a team whose
 * consecutive same-day games at different predefined venues are scheduled closer
 * together than it could physically travel:
 *   game1.start + duration + changeover + drive(loc1→loc2) > game2.start.
 * Skips pairs where either venue is custom/unknown, the same field/location, or the
 * drive time isn't cached — so it never produces a false positive. Requires a
 * game duration; returns [] without one.
 */
export function findTravelConflicts(
  games: ScheduledGameLite[],
  gameDurationMinutes: number | undefined,
  travel: TravelContext,
): TravelConflict[] {
  const duration = gameDurationMinutes;
  if (!duration || duration <= 0) return [];

  // teamId → date → list of { startMin, time, venueId }
  const byTeamDate = new Map<string, { startMin: number; time: string; venueId: number | null }[]>();
  for (const g of games) {
    const startMin = timeToMinutes(g.time);
    if (startMin == null) continue;
    for (const teamId of [g.home, g.away]) {
      const key = `${teamId}|${g.date}`;
      const list = byTeamDate.get(key) ?? [];
      list.push({ startMin, time: g.time, venueId: g.tournamentVenueId });
      byTeamDate.set(key, list);
    }
  }

  const conflicts: TravelConflict[] = [];
  for (const [key, list] of byTeamDate) {
    if (list.length < 2) continue;
    const [teamIdStr, date] = key.split("|");
    const teamId = Number(teamIdStr);
    const sorted = [...list].sort((a, b) => a.startMin - b.startMin);
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i];
      const b = sorted[i + 1];
      const drive = driveBetween(travel, a.venueId, b.venueId);
      if (drive == null || drive === 0) continue; // unknown / same location
      const need = a.startMin + duration + travel.changeoverMinutes + drive;
      if (need > b.startMin) {
        conflicts.push({
          teamId,
          date,
          fromVenueId: a.venueId,
          toVenueId: b.venueId,
          game1Time: a.time,
          game2Time: b.time,
          needMinutes: need,
          gapMinutes: b.startMin - a.startMin,
        });
      }
    }
  }
  return conflicts;
}

// ─── Internal types ───────────────────────────────────────────────────────────

interface Slot {
  date: string;
  time: string;
  tournamentVenueId: number | null;
  field: string;
  maxGamesPerTeamOnDate?: number;
  poolGroup: string | null;
  blockedTeamIds?: number[];
}

/** Effective per-date cap: undefined means no limit. */
function dateCap(v: number | undefined): number {
  return v != null && v >= 1 ? v : Infinity;
}

interface Matchup {
  home: TournamentTeam;
  away: TournamentTeam;
}

function groupKey(team: TournamentTeam): string {
  const g = (team.poolGroup ?? "").trim();
  return g === "" ? DEFAULT_GROUP : g;
}

/**
 * Enumerate every available game slot, in date then time order. Only dates that
 * fall within [firstGameDate, lastGameDate], are not blacked out, and have a
 * matching DateRule produce slots.
 */
function buildSlots(config: TournamentScheduleConfig): Slot[] {
  const slots: Slot[] = [];
  const blackout = new Set(config.blackoutDates);
  const rules = [...config.dateRules].sort((a, b) => a.date.localeCompare(b.date));

  for (const rule of rules) {
    if (!rule.date) continue;
    if (config.firstGameDate && rule.date < config.firstGameDate) continue;
    if (config.lastGameDate && rule.date > config.lastGameDate) continue;
    if (blackout.has(rule.date)) continue;
    for (const s of rule.slots) {
      if (!s.time) continue;
      slots.push({
        date: rule.date,
        time: s.time,
        tournamentVenueId: s.tournamentVenueId ?? null,
        field: s.field ?? "",
        maxGamesPerTeamOnDate: rule.maxGamesPerTeamOnDate,
        poolGroup: s.poolGroup ?? null,
        blockedTeamIds: s.blockedTeamIds,
      });
    }
  }
  return slots;
}

/**
 * Build the candidate matchup pool for one group. Each unordered pair appears
 * once when preventDuplicateMatchups is set; otherwise it appears enough times
 * to keep slots fed (capped so we never exceed what maxGamesPerTeam can absorb).
 * Home/away alternate across repeats. Result is shuffled.
 */
function buildGroupMatchups(
  teams: TournamentTeam[],
  preventDuplicate: boolean,
  maxGamesPerTeam: number | undefined,
): Matchup[] {
  const pairs: Matchup[] = [];
  let repeats = 1;
  if (!preventDuplicate) {
    // Without a duplicate restriction, allow each pair to recur. Cap by the
    // per-team max when given (a team can play at most maxGamesPerTeam games),
    // otherwise default to a single round-robin's worth of repeats.
    repeats = maxGamesPerTeam && teams.length > 1
      ? Math.max(1, maxGamesPerTeam)
      : 1;
  }

  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      for (let r = 0; r < repeats; r++) {
        pairs.push(
          r % 2 === 0
            ? { home: teams[i], away: teams[j] }
            : { home: teams[j], away: teams[i] },
        );
      }
    }
  }

  // Fisher–Yates shuffle
  for (let i = pairs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
  }
  return pairs;
}

/**
 * Generate a pool-play schedule from config + team list.
 * Pure function — no DB access. Round-robin runs within each pool group.
 */
export function generateTournamentSchedule(
  config: TournamentScheduleConfig,
  teams: TournamentTeam[],
): TournamentScheduleResult {
  const warnings: string[] = [];

  if (teams.length < 2) {
    return {
      games: [],
      warnings: ["Need at least 2 teams in the tournament to generate a schedule."],
      stats: { totalGames: 0, teamGameCounts: {}, byGroup: {} },
    };
  }

  const slots = buildSlots(config);
  if (slots.length === 0) {
    warnings.push("No time slots defined — add slots to one or more dates.");
  }

  // Group teams; warn about groups too small to schedule.
  const groups = new Map<string, TournamentTeam[]>();
  for (const t of teams) {
    const key = groupKey(t);
    const list = groups.get(key) ?? [];
    list.push(t);
    groups.set(key, list);
  }
  for (const [key, members] of groups) {
    if (members.length < 2 && key !== DEFAULT_GROUP) {
      warnings.push(`Pool group "${key}" has only ${members.length} team — no matchups possible.`);
    }
  }

  // Build the combined pending pool from each group's round-robin. Each matchup
  // is tagged with its group key so a group-specific slot only draws from it.
  const pending: Array<Matchup & { group: string }> = [];
  for (const [key, members] of groups) {
    if (members.length < 2) continue;
    for (const m of buildGroupMatchups(
      members,
      config.preventDuplicateMatchups,
      config.maxGamesPerTeam,
    )) {
      pending.push({ ...m, group: key });
    }
  }

  const games: TournamentGeneratedGame[] = [];
  const gamesPerTeam = new Map<number, number>();
  const homeCount = new Map<number, number>();
  const awayCount = new Map<number, number>();
  // date → teamId → games played on that date
  const teamsPerDate = new Map<string, Map<number, number>>();
  for (const t of teams) {
    gamesPerTeam.set(t.id, 0);
    homeCount.set(t.id, 0);
    awayCount.set(t.id, 0);
  }

  const maxPerTeam = config.maxGamesPerTeam;

  // Greedily fill each slot with the best remaining matchup, mutating the shared
  // counters. Returns the chosen matchup (already oriented) or null.
  function fillOne(slot: {
    date: string;
    maxGamesPerTeamOnDate?: number;
    poolGroup: string | null;
    blockedTeamIds?: number[];
  }): { home: TournamentTeam; away: TournamentTeam } | null {
    const dateMap = teamsPerDate.get(slot.date) ?? new Map<number, number>();
    const score = (home: TournamentTeam, away: TournamentTeam): number => {
      let s = (gamesPerTeam.get(home.id) ?? 0) + (gamesPerTeam.get(away.id) ?? 0);
      s += (homeCount.get(home.id) ?? 0) + (awayCount.get(away.id) ?? 0);
      return s;
    };
    // A slot tagged for a group only accepts that group's matchups. An untagged
    // slot (poolGroup null) accepts any group.
    const slotGroup =
      slot.poolGroup != null && slot.poolGroup.trim() !== "" ? slot.poolGroup : null;

    const blocked = slot.blockedTeamIds;
    let bestIdx = -1;
    let bestScore = Infinity;
    let bestFlipped = false;
    for (let i = 0; i < pending.length; i++) {
      const m = pending[i];
      if (slotGroup != null && m.group !== slotGroup) continue;
      if (blocked && (blocked.includes(m.home.id) || blocked.includes(m.away.id))) continue;
      const hOnDate = dateMap.get(m.home.id) ?? 0;
      const aOnDate = dateMap.get(m.away.id) ?? 0;
      const cap = dateCap(slot.maxGamesPerTeamOnDate);
      if (hOnDate >= cap || aOnDate >= cap) continue;
      if (maxPerTeam != null) {
        if ((gamesPerTeam.get(m.home.id) ?? 0) >= maxPerTeam) continue;
        if ((gamesPerTeam.get(m.away.id) ?? 0) >= maxPerTeam) continue;
      }
      const sA = score(m.home, m.away);
      const sB = score(m.away, m.home);
      const best = Math.min(sA, sB);
      if (best < bestScore) {
        bestScore = best;
        bestIdx = i;
        bestFlipped = sB < sA;
      }
    }
    if (bestIdx === -1) return null;

    const raw = pending.splice(bestIdx, 1)[0];
    const matchup = bestFlipped ? { home: raw.away, away: raw.home } : raw;

    gamesPerTeam.set(matchup.home.id, (gamesPerTeam.get(matchup.home.id) ?? 0) + 1);
    gamesPerTeam.set(matchup.away.id, (gamesPerTeam.get(matchup.away.id) ?? 0) + 1);
    homeCount.set(matchup.home.id, (homeCount.get(matchup.home.id) ?? 0) + 1);
    awayCount.set(matchup.away.id, (awayCount.get(matchup.away.id) ?? 0) + 1);
    if (!teamsPerDate.has(slot.date)) teamsPerDate.set(slot.date, new Map());
    const dm = teamsPerDate.get(slot.date)!;
    dm.set(matchup.home.id, (dm.get(matchup.home.id) ?? 0) + 1);
    dm.set(matchup.away.id, (dm.get(matchup.away.id) ?? 0) + 1);
    return matchup;
  }

  for (const slot of slots) {
    const matchup = fillOne(slot);
    if (!matchup) continue;
    games.push({
      gamedate: slot.date,
      gametime: slot.time,
      home: matchup.home.id,
      away: matchup.away.id,
      home_team: matchup.home.name,
      away_team: matchup.away.name,
      tournament_venue_id: slot.tournamentVenueId,
      field: slot.field,
    });
  }

  // ── Warnings ────────────────────────────────────────────────────────────────
  if (pending.length > 0) {
    warnings.push(
      `${pending.length} matchup(s) could not be placed — not enough available slots.`,
    );
  }
  if (config.minGamesPerTeam != null) {
    const min = config.minGamesPerTeam;
    for (const t of teams) {
      const actual = gamesPerTeam.get(t.id) ?? 0;
      if (actual < min) {
        warnings.push(`${t.name}: ${actual}/${min} minimum games scheduled.`);
      }
    }
  }

  // ── Stats ─────────────────────────────────────────────────────────────────
  const teamGameCounts: Record<number, number> = {};
  for (const t of teams) teamGameCounts[t.id] = gamesPerTeam.get(t.id) ?? 0;

  const byGroup: Record<string, number> = {};
  for (const g of games) {
    const home = teams.find((t) => t.id === g.home);
    const key = home ? groupKey(home) : DEFAULT_GROUP;
    const label = key === DEFAULT_GROUP ? "All teams" : key;
    byGroup[label] = (byGroup[label] ?? 0) + 1;
  }

  return {
    games,
    warnings,
    stats: { totalGames: games.length, teamGameCounts, byGroup },
  };
}

/** A draft slot the workspace can fill (carries a stable id). */
export interface DraftSlotInput {
  id: string;
  date: string;
  poolGroup: string | null;
  maxGamesPerTeamOnDate?: number;
  /** Slot start "HH:MM" and venue — needed for the travel-time constraint. */
  time?: string;
  tournamentVenueId?: number | null;
  /** Teams that must NOT be assigned to this slot (hard constraint for auto-fill). */
  blockedTeamIds?: number[];
}

export interface SlotAssignment {
  slotId: string;
  home: number;
  away: number;
}

/**
 * Assign matchups directly to an ordered list of draft slots (identified by id),
 * respecting pool groups, per-date caps, and the per-team max. Returns one entry
 * per slot that got a full matchup — keyed by slot id, so the caller never has to
 * match games back to slots by tuple equality.
 *
 * Slots are processed in the order given (the caller controls priority — typically
 * date then time). preventDuplicateMatchups / minGamesPerTeam / maxGamesPerTeam
 * come from `config`.
 */
export function assignDraftSlots(
  config: TournamentScheduleConfig,
  teams: TournamentTeam[],
  slots: DraftSlotInput[],
  travel?: TravelContext,
): SlotAssignment[] {
  if (teams.length < 2) return [];

  const groups = new Map<string, TournamentTeam[]>();
  for (const t of teams) {
    const key = groupKey(t);
    const list = groups.get(key) ?? [];
    list.push(t);
    groups.set(key, list);
  }

  const pending: Array<Matchup & { group: string }> = [];
  for (const [key, members] of groups) {
    if (members.length < 2) continue;
    for (const m of buildGroupMatchups(
      members,
      config.preventDuplicateMatchups,
      config.maxGamesPerTeam,
    )) {
      pending.push({ ...m, group: key });
    }
  }

  const gamesPerTeam = new Map<number, number>();
  const homeCount = new Map<number, number>();
  const awayCount = new Map<number, number>();
  const teamsPerDate = new Map<string, Map<number, number>>();
  // teamId → date → most recent placed game's { startMin, venueId } that day.
  // Slots are processed in date/time order, so this is the "coming from" game.
  const lastByDate = new Map<number, Map<string, { startMin: number; venueId: number | null }>>();
  for (const t of teams) {
    gamesPerTeam.set(t.id, 0);
    homeCount.set(t.id, 0);
    awayCount.set(t.id, 0);
  }
  const maxPerTeam = config.maxGamesPerTeam;
  const duration = config.gameDurationMinutes;

  // Can `teamId` reach this slot in time given its previous game that day?
  const canTravel = (teamId: number): boolean => {
    if (!travel || !duration || duration <= 0) return true;
    if (slot.tournamentVenueId == null || !slot.time) return true;
    const slotStart = timeToMinutes(slot.time);
    if (slotStart == null) return true;
    const prev = lastByDate.get(teamId)?.get(slot.date);
    if (!prev) return true;
    const drive = driveBetween(travel, prev.venueId, slot.tournamentVenueId);
    if (drive == null || drive === 0) return true; // unknown/same → no constraint
    return prev.startMin + duration + travel.changeoverMinutes + drive <= slotStart;
  };

  const assignments: SlotAssignment[] = [];
  let slot: DraftSlotInput; // hoisted so canTravel can read the current slot
  for (slot of slots) {
    const dateMap = teamsPerDate.get(slot.date) ?? new Map<number, number>();
    const score = (home: TournamentTeam, away: TournamentTeam): number =>
      (gamesPerTeam.get(home.id) ?? 0) +
      (gamesPerTeam.get(away.id) ?? 0) +
      (homeCount.get(home.id) ?? 0) +
      (awayCount.get(away.id) ?? 0);
    const slotGroup =
      slot.poolGroup != null && slot.poolGroup.trim() !== "" ? slot.poolGroup : null;

    let bestIdx = -1;
    let bestScore = Infinity;
    let bestFlipped = false;
    const blocked = slot.blockedTeamIds;
    for (let i = 0; i < pending.length; i++) {
      const m = pending[i];
      if (slotGroup != null && m.group !== slotGroup) continue;
      // Blocked teams must never be placed in this slot (hard constraint).
      if (blocked && (blocked.includes(m.home.id) || blocked.includes(m.away.id))) continue;
      const cap = dateCap(slot.maxGamesPerTeamOnDate);
      if ((dateMap.get(m.home.id) ?? 0) >= cap) continue;
      if ((dateMap.get(m.away.id) ?? 0) >= cap) continue;
      if (maxPerTeam != null) {
        if ((gamesPerTeam.get(m.home.id) ?? 0) >= maxPerTeam) continue;
        if ((gamesPerTeam.get(m.away.id) ?? 0) >= maxPerTeam) continue;
      }
      // Travel feasibility: both teams must be able to reach this slot in time.
      if (!canTravel(m.home.id) || !canTravel(m.away.id)) continue;
      const sA = score(m.home, m.away);
      const sB = score(m.away, m.home);
      const best = Math.min(sA, sB);
      if (best < bestScore) {
        bestScore = best;
        bestIdx = i;
        bestFlipped = sB < sA;
      }
    }
    if (bestIdx === -1) continue;

    const raw = pending.splice(bestIdx, 1)[0];
    const matchup = bestFlipped ? { home: raw.away, away: raw.home } : raw;
    gamesPerTeam.set(matchup.home.id, (gamesPerTeam.get(matchup.home.id) ?? 0) + 1);
    gamesPerTeam.set(matchup.away.id, (gamesPerTeam.get(matchup.away.id) ?? 0) + 1);
    homeCount.set(matchup.home.id, (homeCount.get(matchup.home.id) ?? 0) + 1);
    awayCount.set(matchup.away.id, (awayCount.get(matchup.away.id) ?? 0) + 1);
    if (!teamsPerDate.has(slot.date)) teamsPerDate.set(slot.date, new Map());
    const dm = teamsPerDate.get(slot.date)!;
    dm.set(matchup.home.id, (dm.get(matchup.home.id) ?? 0) + 1);
    dm.set(matchup.away.id, (dm.get(matchup.away.id) ?? 0) + 1);

    // Record this game as each team's latest that day for the travel constraint.
    const slotStart = slot.time ? timeToMinutes(slot.time) : null;
    if (slotStart != null) {
      for (const tid of [matchup.home.id, matchup.away.id]) {
        const perDate = lastByDate.get(tid) ?? new Map();
        perDate.set(slot.date, { startMin: slotStart, venueId: slot.tournamentVenueId ?? null });
        lastByDate.set(tid, perDate);
      }
    }

    assignments.push({ slotId: slot.id, home: matchup.home.id, away: matchup.away.id });
  }

  return assignments;
}
