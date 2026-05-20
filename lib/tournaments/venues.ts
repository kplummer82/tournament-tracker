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
  sortOrder: number;
  gameCount: number;
  fields: VenueFieldDTO[];
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
      l.name    AS loc_name,
      l.address AS loc_address,
      l.city    AS loc_city,
      l.state   AS loc_state,
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
    SELECT id, tournament_venue_id, name, sort_order
    FROM tournament_venue_fields
    WHERE tournament_venue_id = ANY($1::int[])
    ORDER BY sort_order ASC, id ASC
    `,
    [venueIds],
  );

  const fieldsByVenue = new Map<number, VenueFieldDTO[]>();
  for (const f of fieldRows) {
    const vid = Number(f.tournament_venue_id);
    const list = fieldsByVenue.get(vid) ?? [];
    list.push({ id: Number(f.id), name: f.name, sortOrder: Number(f.sort_order) });
    fieldsByVenue.set(vid, list);
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
      sortOrder: Number(r.sort_order),
      gameCount: Number(r.game_count ?? 0),
      fields: fieldsByVenue.get(Number(r.id)) ?? [],
    };
  });
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
    SELECT location_id, MIN(tournamentgameid) AS first_game
    FROM tournamentgames
    WHERE tournamentid = $1 AND location_id IS NOT NULL
    GROUP BY location_id
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
           ON CONFLICT (tournament_venue_id, name) DO NOTHING`,
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
           ON CONFLICT (tournament_venue_id, name) DO NOTHING`,
        [venueId, String(f.field).trim(), order++],
      );
    }
  }

  await client.query(
    `UPDATE tournaments SET venues_initialized = true WHERE tournamentid = $1`,
    [tournamentId],
  );
}
