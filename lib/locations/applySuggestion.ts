// Applies an approved location suggestion inside the caller's transaction.
// The coord rules re-implement the precedence in pages/api/locations/
// [locationId].ts PATCH and index.ts POST (explicit coords win; geocode only
// when the address changed or coords are missing; propagate to
// scrimmage_listings). TODO: unify with those handlers once the pin-move
// work lands.
import { geocodeAddress } from "@/lib/mapbox/geocodeAddress";
import type {
  EditPayload,
  NewPayload,
  LocationSnapshot,
} from "@/lib/suggestions/types";

/** node-postgres-compatible client (a checked-out pool.connect() client). */
export type Queryable = {
  query(text: string, params?: unknown[]): Promise<{ rows: any[] }>;
};

export type LocationRow = {
  id: number;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  latitude: number | null;
  longitude: number | null;
};

/**
 * Resolve the coords an approved edit should write. Runs the (network)
 * geocode, so call it BEFORE opening the transaction. Returns nulls when
 * nothing should change (COALESCE keeps the live values).
 */
export async function resolveEditCoords(
  payload: EditPayload,
  live: LocationSnapshot
): Promise<{ lat: number | null; lng: number | null }> {
  const attrs = payload.attributes ?? {};

  // Explicit proposed coords (a map pick) win and skip geocoding.
  if (attrs.latitude != null && attrs.longitude != null) {
    return { lat: attrs.latitude, lng: attrs.longitude };
  }

  const addressChanged =
    (attrs.address != null && attrs.address !== live.address) ||
    (attrs.city != null && attrs.city !== live.city) ||
    (attrs.state != null && attrs.state !== live.state) ||
    (attrs.zip != null && attrs.zip !== live.zip);
  const missingCoords = live.latitude == null || live.longitude == null;

  if (addressChanged || missingCoords) {
    const geocoded = await geocodeAddress({
      name: attrs.name ?? live.name,
      address: attrs.address ?? live.address,
      city: attrs.city ?? live.city,
      state: attrs.state ?? live.state,
      zip: attrs.zip ?? live.zip,
    });
    if (geocoded) return { lat: geocoded.lat, lng: geocoded.lng };
  }
  return { lat: null, lng: null };
}

/**
 * Apply an approved edit: COALESCE-update the location's attributes, run the
 * field add/rename/remove ops, and propagate refreshed coords to
 * scrimmage_listings. Rename/remove ops whose field row vanished are skipped
 * (the staleness gate means the admin has already seen and forced past the
 * discrepancy). Returns the updated row.
 */
export async function applyEditSuggestion(
  client: Queryable,
  locationId: number,
  payload: EditPayload,
  coords: { lat: number | null; lng: number | null }
): Promise<LocationRow> {
  const attrs = payload.attributes ?? {};
  const updated = await client.query(
    `UPDATE locations SET
       name      = COALESCE($2, name),
       address   = COALESCE($3, address),
       city      = COALESCE($4, city),
       state     = COALESCE($5, state),
       zip       = COALESCE($6, zip),
       latitude  = COALESCE($7, latitude),
       longitude = COALESCE($8, longitude)
     WHERE id = $1
     RETURNING id, name, address, city, state, zip, latitude, longitude`,
    [
      locationId,
      attrs.name ?? null,
      attrs.address ?? null,
      attrs.city ?? null,
      attrs.state ?? null,
      attrs.zip ?? null,
      coords.lat,
      coords.lng,
    ]
  );
  if (!updated.rows.length) throw new Error("Location vanished during apply");

  if (coords.lat != null && coords.lng != null) {
    await client.query(
      `UPDATE scrimmage_listings SET location_lat = $2, location_lng = $3 WHERE location_id = $1`,
      [locationId, coords.lat, coords.lng]
    );
  }

  const fields = payload.fields;
  if (fields) {
    for (const name of fields.add ?? []) {
      await client.query(
        `INSERT INTO location_fields (location_id, name) VALUES ($1, $2)
         ON CONFLICT (location_id, name) DO NOTHING`,
        [locationId, name]
      );
    }
    for (const op of fields.rename ?? []) {
      await client.query(
        `UPDATE location_fields SET name = $3 WHERE id = $2 AND location_id = $1`,
        [locationId, op.id, op.to]
      );
    }
    for (const op of fields.remove ?? []) {
      await client.query(
        `DELETE FROM location_fields WHERE id = $2 AND location_id = $1`,
        [locationId, op.id]
      );
    }
  }

  return updated.rows[0] as LocationRow;
}

/**
 * Resolve coords for an approved new-location proposal: proposed coords (a
 * Mapbox POI pick) beat an address geocode — mirrors POST /api/locations.
 * Network call; run BEFORE the transaction.
 */
export async function resolveNewCoords(
  payload: NewPayload
): Promise<{ lat: number | null; lng: number | null }> {
  if (payload.latitude != null && payload.longitude != null) {
    return { lat: payload.latitude, lng: payload.longitude };
  }
  const geocoded = await geocodeAddress({
    name: payload.name,
    address: payload.address ?? null,
    city: payload.city ?? null,
    state: payload.state ?? null,
    zip: payload.zip ?? null,
  });
  return geocoded ? { lat: geocoded.lat, lng: geocoded.lng } : { lat: null, lng: null };
}

/** Apply an approved new-location proposal. Returns the inserted row. */
export async function applyNewSuggestion(
  client: Queryable,
  payload: NewPayload,
  coords: { lat: number | null; lng: number | null }
): Promise<LocationRow> {
  const inserted = await client.query(
    `INSERT INTO locations (name, address, city, state, zip, latitude, longitude)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, name, address, city, state, zip, latitude, longitude`,
    [
      payload.name,
      payload.address ?? null,
      payload.city ?? null,
      payload.state ?? null,
      payload.zip ?? null,
      coords.lat,
      coords.lng,
    ]
  );
  const location = inserted.rows[0] as LocationRow;

  for (const name of payload.fields ?? []) {
    await client.query(
      `INSERT INTO location_fields (location_id, name) VALUES ($1, $2)
       ON CONFLICT (location_id, name) DO NOTHING`,
      [location.id, name]
    );
  }
  return location;
}

/**
 * Apply an approved removal: supersede other pending suggestions on the
 * target FIRST (the FK is ON DELETE SET NULL, so after the delete they could
 * no longer be found by location_id), then delete the location (cascades
 * location_fields).
 */
export async function applyRemovalSuggestion(
  client: Queryable,
  locationId: number,
  suggestionId: number
): Promise<void> {
  await client.query(
    `UPDATE location_suggestions SET status = 'superseded'
     WHERE location_id = $1 AND status = 'pending' AND id <> $2`,
    [locationId, suggestionId]
  );
  await client.query(`DELETE FROM locations WHERE id = $1`, [locationId]);
}
