// lib/tournaments/venues.ts
import type { PoolClient } from "pg";

export type VenueFieldDTO = {
  id: number;
  name: string;
  sortOrder: number;
};

export type VenueDTO = {
  id: number;
  kind: "predefined" | "custom";
  locationId: number | null;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  // Coordinates come from the linked global location (predefined venues only);
  // custom venues have no coordinates and are not plotted on the map.
  latitude: number | null;
  longitude: number | null;
  sortOrder: number;
  gameCount: number;
  /** Fields in play for this tournament — the only ones schedulers may use. */
  fields: VenueFieldDTO[];
  /**
   * Fields that exist on the venue but are switched off for this tournament.
   * Only the venues tab surfaces these; every picker reads `fields`, so a
   * deactivated field is excluded from scheduling by construction.
   */
  inactiveFields: VenueFieldDTO[];
};

/**
 * Load all venues for a tournament with their fields and a per-venue game count,
 * ordered by sort_order then id. Single query per call site, returns ready-to-send DTOs.
 */
export async function loadVenues(
  client: PoolClient,
  tournamentId: number,
): Promise<VenueDTO[]> {
  const { rows: venueRows } = await client.query(
    `
    SELECT
      tv.id,
      tv.location_id,
      tv.custom_name,
      tv.custom_address,
      tv.custom_city,
      tv.custom_state,
      tv.sort_order,
      l.name      AS loc_name,
      l.address   AS loc_address,
      l.city      AS loc_city,
      l.state     AS loc_state,
      l.latitude  AS loc_latitude,
      l.longitude AS loc_longitude,
      (SELECT COUNT(*)::int FROM tournamentgames g
        WHERE g.tournament_venue_id = tv.id) AS game_count
    FROM tournament_venues tv
    LEFT JOIN locations l ON l.id = tv.location_id
    WHERE tv.tournament_id = $1
    ORDER BY tv.sort_order ASC, tv.id ASC
    `,
    [tournamentId],
  );

  if (venueRows.length === 0) return [];

  const venueIds = venueRows.map((r) => Number(r.id));
  const { rows: fieldRows } = await client.query(
    `
    SELECT id, tournament_venue_id, name, sort_order, is_active
    FROM tournament_venue_fields
    WHERE tournament_venue_id = ANY($1::int[])
    ORDER BY sort_order ASC, id ASC
    `,
    [venueIds],
  );

  const fieldsByVenue = new Map<number, VenueFieldDTO[]>();
  const inactiveByVenue = new Map<number, VenueFieldDTO[]>();
  for (const f of fieldRows) {
    const vid = Number(f.tournament_venue_id);
    const bucket = f.is_active === false ? inactiveByVenue : fieldsByVenue;
    const list = bucket.get(vid) ?? [];
    list.push({ id: Number(f.id), name: f.name, sortOrder: Number(f.sort_order) });
    bucket.set(vid, list);
  }

  return venueRows.map((r): VenueDTO => {
    const kind: "predefined" | "custom" = r.location_id != null ? "predefined" : "custom";
    return {
      id: Number(r.id),
      kind,
      locationId: r.location_id != null ? Number(r.location_id) : null,
      name: kind === "predefined" ? (r.loc_name ?? "") : (r.custom_name ?? ""),
      address: kind === "predefined" ? (r.loc_address ?? null) : (r.custom_address ?? null),
      city: kind === "predefined" ? (r.loc_city ?? null) : (r.custom_city ?? null),
      state: kind === "predefined" ? (r.loc_state ?? null) : (r.custom_state ?? null),
      latitude: kind === "predefined" && r.loc_latitude != null ? Number(r.loc_latitude) : null,
      longitude: kind === "predefined" && r.loc_longitude != null ? Number(r.loc_longitude) : null,
      sortOrder: Number(r.sort_order),
      gameCount: Number(r.game_count ?? 0),
      fields: fieldsByVenue.get(Number(r.id)) ?? [],
      inactiveFields: inactiveByVenue.get(Number(r.id)) ?? [],
    };
  });
}

/**
 * Fields added to a location *after* it was pulled into this tournament don't
 * exist on the venue yet. Copy any missing ones in as inactive, so the venues
 * tab can offer them without silently widening what's schedulable.
 *
 * Matching is by case-insensitive name — the same key the venue's unique index
 * uses — so a field the organizer switched off already has a row here and is
 * never resurrected. Custom venues have no location and are left alone.
 *
 * Idempotent; safe to call on every read by a caller allowed to write.
 */
export async function syncLocationFields(
  client: PoolClient,
  tournamentId: number,
): Promise<void> {
  await client.query(
    `
    WITH missing AS (
      SELECT
        tv.id AS venue_id,
        TRIM(lf.name) AS name,
        COALESCE((SELECT MAX(f.sort_order) FROM tournament_venue_fields f
                   WHERE f.tournament_venue_id = tv.id), -1) AS base,
        ROW_NUMBER() OVER (PARTITION BY tv.id ORDER BY lf.id) AS rn
      FROM tournament_venues tv
      JOIN location_fields lf ON lf.location_id = tv.location_id
      WHERE tv.tournament_id = $1
        AND TRIM(lf.name) <> ''
        AND NOT EXISTS (
          SELECT 1 FROM tournament_venue_fields f
           WHERE f.tournament_venue_id = tv.id
             AND LOWER(f.name) = LOWER(TRIM(lf.name))
        )
    )
    INSERT INTO tournament_venue_fields (tournament_venue_id, name, sort_order, is_active)
    SELECT venue_id, name, base + rn, false FROM missing
    ON CONFLICT DO NOTHING
    `,
    [tournamentId],
  );
}

/**
 * One-time migration: when this tournament's venues_initialized flag is false,
 * roll existing tournamentgames locations into tournament_venues + fields,
 * then set the flag. Idempotent and locked via SELECT ... FOR UPDATE.
 */
export async function runAutoPromotionIfNeeded(
  client: PoolClient,
  tournamentId: number,
): Promise<void> {
  const { rows: tRows } = await client.query(
    `SELECT venues_initialized FROM tournaments
      WHERE tournamentid = $1 FOR UPDATE`,
    [tournamentId],
  );
  if (tRows.length === 0) return; // tournament gone; caller handles 404
  if (tRows[0].venues_initialized === true) return;

  // Predefined: distinct location_id values among this tournament's games.
  const { rows: predefRows } = await client.query(
    `
    SELECT DISTINCT location_id
    FROM tournamentgames
    WHERE tournamentid = $1 AND location_id IS NOT NULL
    `,
    [tournamentId],
  );

  // Custom: distinct non-empty lower(trim(location)) among games with no location_id.
  const { rows: customRows } = await client.query(
    `
    SELECT
      LOWER(TRIM(location)) AS key,
      MIN(location) AS sample_name
    FROM tournamentgames
    WHERE tournamentid = $1
      AND location_id IS NULL
      AND location IS NOT NULL
      AND TRIM(location) <> ''
    GROUP BY LOWER(TRIM(location))
    `,
    [tournamentId],
  );

  // Insert predefined venues + backfill games + insert fields
  for (const r of predefRows) {
    const { rows: ins } = await client.query(
      `INSERT INTO tournament_venues (tournament_id, location_id, sort_order)
         VALUES ($1, $2, 0)
         ON CONFLICT (tournament_id, location_id) DO UPDATE SET sort_order = tournament_venues.sort_order
         RETURNING id`,
      [tournamentId, Number(r.location_id)],
    );
    const venueId = Number(ins[0].id);

    await client.query(
      `UPDATE tournamentgames
          SET tournament_venue_id = $1
        WHERE tournamentid = $2 AND location_id = $3`,
      [venueId, tournamentId, Number(r.location_id)],
    );

    // Distinct non-empty field strings for this group → field rows
    const { rows: fieldRows } = await client.query(
      `SELECT DISTINCT field FROM tournamentgames
        WHERE tournamentid = $1 AND location_id = $2
          AND field IS NOT NULL AND TRIM(field) <> ''`,
      [tournamentId, Number(r.location_id)],
    );
    let order = 0;
    for (const f of fieldRows) {
      await client.query(
        `INSERT INTO tournament_venue_fields (tournament_venue_id, name, sort_order)
           VALUES ($1, $2, $3)
           ON CONFLICT (tournament_venue_id, LOWER(name)) DO NOTHING`,
        [venueId, String(f.field).trim(), order++],
      );
    }
  }

  // Insert custom venues + backfill games + insert fields
  for (const r of customRows) {
    const key = String(r.key);
    const sampleName = String(r.sample_name).trim();

    const { rows: ins } = await client.query(
      `INSERT INTO tournament_venues (tournament_id, custom_name, sort_order)
         VALUES ($1, $2, 0)
         ON CONFLICT (tournament_id, custom_name) DO UPDATE SET sort_order = tournament_venues.sort_order
         RETURNING id`,
      [tournamentId, sampleName],
    );
    const venueId = Number(ins[0].id);

    await client.query(
      `UPDATE tournamentgames
          SET tournament_venue_id = $1
        WHERE tournamentid = $2
          AND location_id IS NULL
          AND LOWER(TRIM(location)) = $3`,
      [venueId, tournamentId, key],
    );

    const { rows: fieldRows } = await client.query(
      `SELECT DISTINCT field FROM tournamentgames
        WHERE tournamentid = $1
          AND location_id IS NULL
          AND LOWER(TRIM(location)) = $2
          AND field IS NOT NULL AND TRIM(field) <> ''`,
      [tournamentId, key],
    );
    let order = 0;
    for (const f of fieldRows) {
      await client.query(
        `INSERT INTO tournament_venue_fields (tournament_venue_id, name, sort_order)
           VALUES ($1, $2, $3)
           ON CONFLICT (tournament_venue_id, LOWER(name)) DO NOTHING`,
        [venueId, String(f.field).trim(), order++],
      );
    }
  }

  await client.query(
    `UPDATE tournaments SET venues_initialized = true WHERE tournamentid = $1`,
    [tournamentId],
  );
}
