// lib/tournaments/travelTimes.ts
//
// Lazy, cached driving-time matrix between a tournament's predefined locations.
// Coordinates already live on locations.latitude/longitude (geocoded on create),
// so no geocoding is needed here — we only call Mapbox's Matrix API for pairs that
// aren't yet cached in location_travel_times, then upsert them.

import type { PoolClient } from "pg";
import { fetchDrivingMatrix, type MatrixCoord } from "@/lib/mapbox/travelMatrix";

/** Fixed pack-up / park / unpack changeover between fields, in minutes. */
export const CHANGEOVER_MINUTES = 45;

export type TravelTimesResult = {
  // "origLocId-destLocId" → driving minutes
  drivingMinutes: Record<string, number>;
  // tournamentVenueId → predefined locationId (null for custom venues)
  venueLocation: Record<number, number | null>;
};

const pairKey = (a: number, b: number) => `${a}-${b}`;

/** Map every tournament venue to its predefined location id (custom → null). */
async function loadVenueLocationMap(
  client: PoolClient,
  tournamentId: number,
): Promise<Record<number, number | null>> {
  const { rows } = await client.query(
    `SELECT id, location_id FROM tournament_venues WHERE tournament_id = $1`,
    [tournamentId],
  );
  const map: Record<number, number | null> = {};
  for (const r of rows) {
    map[Number(r.id)] = r.location_id != null ? Number(r.location_id) : null;
  }
  return map;
}

/**
 * Ensure driving times exist for every ordered pair among the given predefined
 * location ids (those with coordinates), computing+caching any that are missing.
 * Returns the "origLocId-destLocId" → minutes lookup. Location-only and reusable —
 * tournaments map their venues to locations first; seasons pass location ids
 * directly. Safe to call on every page load — only hits Mapbox for new pairs.
 */
export async function ensureTravelTimesForLocations(
  client: PoolClient,
  locationIds: number[],
): Promise<Record<string, number>> {
  const locIds = [...new Set(locationIds.filter((v): v is number => v != null))];
  if (locIds.length < 2) return {};

  const { rows: locRows } = await client.query(
    `SELECT id, latitude, longitude
       FROM locations
      WHERE id = ANY($1::int[])
        AND latitude IS NOT NULL AND longitude IS NOT NULL`,
    [locIds],
  );
  const coords: MatrixCoord[] = locRows.map((r) => ({
    locationId: Number(r.id),
    lat: Number(r.latitude),
    lng: Number(r.longitude),
  }));
  const coordIds = coords.map((c) => c.locationId);
  if (coords.length < 2) return {};

  // Load already-cached pairs among these locations.
  const { rows: cachedRows } = await client.query(
    `SELECT origin_location_id, dest_location_id, driving_minutes
       FROM location_travel_times
      WHERE origin_location_id = ANY($1::int[])
        AND dest_location_id   = ANY($1::int[])`,
    [coordIds],
  );
  const cached = new Map<string, number>();
  for (const r of cachedRows) {
    cached.set(pairKey(Number(r.origin_location_id), Number(r.dest_location_id)), Number(r.driving_minutes));
  }

  // Are any ordered pairs (i≠j) missing?
  let anyMissing = false;
  for (let i = 0; i < coordIds.length && !anyMissing; i++) {
    for (let j = 0; j < coordIds.length; j++) {
      if (i === j) continue;
      if (!cached.has(pairKey(coordIds[i], coordIds[j]))) {
        anyMissing = true;
        break;
      }
    }
  }

  // Compute + upsert missing pairs via a single matrix call.
  if (anyMissing) {
    const matrix = await fetchDrivingMatrix(coords);
    if (matrix) {
      const values: string[] = [];
      const params: unknown[] = [];
      let p = 1;
      for (let i = 0; i < coordIds.length; i++) {
        for (let j = 0; j < coordIds.length; j++) {
          if (i === j) continue;
          const minutes = matrix[i]?.[j];
          if (minutes == null || !Number.isFinite(minutes)) continue;
          values.push(`($${p++}, $${p++}, $${p++})`);
          params.push(coordIds[i], coordIds[j], minutes);
          cached.set(pairKey(coordIds[i], coordIds[j]), minutes);
        }
      }
      if (values.length > 0) {
        await client.query(
          `INSERT INTO location_travel_times (origin_location_id, dest_location_id, driving_minutes)
           VALUES ${values.join(", ")}
           ON CONFLICT (origin_location_id, dest_location_id)
           DO UPDATE SET driving_minutes = EXCLUDED.driving_minutes, computed_at = now()`,
          params,
        );
      }
    }
    // If matrix is null (Mapbox failure), fall through with whatever was cached —
    // missing pairs stay unknown and simply won't trigger travel warnings.
  }

  const drivingMinutes: Record<string, number> = {};
  for (const [k, v] of cached) drivingMinutes[k] = v;
  return drivingMinutes;
}

/**
 * Ensure driving times exist for every ordered pair of the tournament's predefined
 * locations (those with coordinates), computing+caching any that are missing.
 * Returns the venue→location map plus the full pair lookup. Safe to call on every
 * page load — it only hits Mapbox when new pairs appear.
 */
export async function ensureTravelTimes(
  client: PoolClient,
  tournamentId: number,
): Promise<TravelTimesResult> {
  const venueLocation = await loadVenueLocationMap(client, tournamentId);

  // Distinct predefined location ids used by this tournament that have coords.
  const locIds = [
    ...new Set(Object.values(venueLocation).filter((v): v is number => v != null)),
  ];
  const drivingMinutes = await ensureTravelTimesForLocations(client, locIds);
  return { drivingMinutes, venueLocation };
}
