// Season scheduler conflict detectors — pure, no DB access.
//
// Seasons carry locationId directly on each slot (no tournament-venue indirection),
// so these operate on slot/game shapes that hold locationId. The travel-conflict
// detector reuses the tournament back-to-back travel math via an identity
// location→location map (treating locationId as the "venue id").

import { findTravelConflicts, type TravelConflict } from "@/lib/tournament-schedule";

/** Minutes since midnight for an "HH:MM" string, or null if unparseable. */
function timeToMinutes(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t ?? "");
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export interface SeasonSlotLite {
  date: string;
  time: string;
  fieldName: string;
  fieldLocation: string;
  locationId: number | null;
}

export interface SeasonSlotOverlap {
  date: string;
  locationId: number | null;
  fieldLocation: string;
  field: string;
  timeA: string;
  timeB: string;
}

/**
 * Detect field double-bookings: slots on the same date + location + field whose
 * start times are closer together than `gameDurationMinutes`. Empty without a
 * duration (the rule is inactive). Location is matched by locationId when present,
 * else by the custom location text; field is matched case-insensitively.
 */
export function findSeasonSlotOverlaps(
  slots: SeasonSlotLite[],
  gameDurationMinutes: number | undefined,
): SeasonSlotOverlap[] {
  const duration = gameDurationMinutes;
  if (!duration || duration <= 0) return [];

  // date|locKey|fieldKey → group of slots
  const byField = new Map<
    string,
    {
      date: string;
      locationId: number | null;
      fieldLocation: string;
      field: string;
      items: { time: string; mins: number }[];
    }
  >();
  for (const s of slots) {
    const mins = timeToMinutes(s.time);
    if (mins == null) continue;
    const field = s.fieldName ?? "";
    // A slot with neither a location nor a field can't double-book meaningfully.
    if (!field && s.locationId == null && !s.fieldLocation) continue;
    const locKey = s.locationId != null ? `id:${s.locationId}` : `c:${(s.fieldLocation ?? "").toLowerCase()}`;
    const key = `${s.date}|${locKey}|${field.toLowerCase()}`;
    const group =
      byField.get(key) ??
      { date: s.date, locationId: s.locationId, fieldLocation: s.fieldLocation, field, items: [] };
    group.items.push({ time: s.time, mins });
    byField.set(key, group);
  }

  const overlaps: SeasonSlotOverlap[] = [];
  for (const g of byField.values()) {
    if (g.items.length < 2) continue;
    const sorted = [...g.items].sort((a, b) => a.mins - b.mins);
    for (let i = 0; i < sorted.length - 1; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        if (sorted[j].mins - sorted[i].mins < duration) {
          overlaps.push({
            date: g.date,
            locationId: g.locationId,
            fieldLocation: g.fieldLocation,
            field: g.field,
            timeA: sorted[i].time,
            timeB: sorted[j].time,
          });
        } else {
          break; // sorted — no later slot can overlap with i either
        }
      }
    }
  }
  return overlaps;
}

export interface SeasonGameLite {
  date: string;
  time: string;
  home: number;
  away: number;
  locationId: number | null;
}

/**
 * Detect cross-location travel conflicts among assigned games: a team whose
 * consecutive same-day games at different official locations are too close to
 * drive between. Reuses findTravelConflicts by treating locationId as the venue id
 * and supplying an identity venue→location map. Pairs with a custom/unknown
 * location or no cached drive time are skipped (never a false positive).
 *
 * Returned conflicts carry the locationIds in `fromVenueId` / `toVenueId`.
 */
export function findSeasonTravelConflicts(
  games: SeasonGameLite[],
  gameDurationMinutes: number | undefined,
  travel: { drivingMinutes: Record<string, number>; changeoverMinutes: number },
): TravelConflict[] {
  const venueLocation: Record<number, number | null> = {};
  for (const g of games) {
    if (g.locationId != null) venueLocation[g.locationId] = g.locationId;
  }
  const lite = games.map((g) => ({
    date: g.date,
    time: g.time,
    home: g.home,
    away: g.away,
    tournamentVenueId: g.locationId,
  }));
  return findTravelConflicts(lite, gameDurationMinutes, {
    venueLocation,
    drivingMinutes: travel.drivingMinutes,
    changeoverMinutes: travel.changeoverMinutes,
  });
}
