import type { NextApiRequest, NextApiResponse } from "next";
import { neon } from "@neondatabase/serverless";
import { sql } from "@/lib/db";
import { requireSession, requireTeamAccess } from "@/lib/auth/requireSession";

const dynamicSql = neon(process.env.DATABASE_URL!);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  /* ── GET — Browse open listings ──────────────────────────────── */
  if (req.method === "GET") {
    const session = await requireSession(req, res);
    if (!session) return;

    const {
      q,
      sport,
      date_from,
      date_to,
      lat,
      lng,
      radius,
      league_id,
      division_id,
      age_min,
      age_max,
      scope,
      page = "1",
      pageSize = "20",
    } = req.query;

    const pg = Math.max(1, parseInt(page as string, 10) || 1);
    const ps = Math.min(50, Math.max(1, parseInt(pageSize as string, 10) || 20));
    const offset = (pg - 1) * ps;

    try {
      const whereParts: string[] = [
        "sl.status = 'open'",
        "sl.available_date >= CURRENT_DATE",
      ];
      const params: unknown[] = [];
      let idx = 0;
      const $ = () => `$${++idx}`;

      if (q && typeof q === "string" && q.trim()) {
        const search = `%${q.trim()}%`;
        whereParts.push(`(t.name ILIKE ${$()} OR sl.location_name ILIKE ${$()})`);
        params.push(search, search);
      }

      if (sport && String(sport).trim()) {
        whereParts.push(`sl.sport_id = ${$()}`);
        params.push(parseInt(String(sport), 10));
      }

      if (date_from && String(date_from).trim()) {
        whereParts.push(`sl.available_date >= ${$()}`);
        params.push(String(date_from));
      }

      if (date_to && String(date_to).trim()) {
        whereParts.push(`sl.available_date <= ${$()}`);
        params.push(String(date_to));
      }

      if (league_id && String(league_id).trim()) {
        whereParts.push(`t.league_id = ${$()}`);
        params.push(parseInt(String(league_id), 10));
      }

      if (division_id && String(division_id).trim()) {
        whereParts.push(`t.league_division_id = ${$()}`);
        params.push(parseInt(String(division_id), 10));
      }

      if (age_min && String(age_min).trim()) {
        whereParts.push(`(sl.age_range_max IS NULL OR sl.age_range_max >= ${$()})`);
        params.push(parseInt(String(age_min), 10));
      }

      if (age_max && String(age_max).trim()) {
        whereParts.push(`(sl.age_range_min IS NULL OR sl.age_range_min <= ${$()})`);
        params.push(parseInt(String(age_max), 10));
      }

      if (scope === "division" || scope === "league") {
        whereParts.push(`sl.opponent_scope IN (${$()}, 'any')`);
        params.push(String(scope));
      }

      // Geo filter (Haversine)
      let geoSelect = "";
      let orderBy = "sl.available_date ASC, sl.created_at DESC";

      const hasGeo =
        lat && lng && radius &&
        String(lat).trim() && String(lng).trim() && String(radius).trim();

      if (hasGeo) {
        const userLat = parseFloat(String(lat));
        const userLng = parseFloat(String(lng));
        const maxMiles = parseFloat(String(radius));

        if (!isNaN(userLat) && !isNaN(userLng) && !isNaN(maxMiles)) {
          // SELECT distance
          const latP1 = $(); params.push(userLat);
          const lngP1 = $(); params.push(userLng);
          const latP2 = $(); params.push(userLat);

          geoSelect = `, (3959 * acos(LEAST(1, GREATEST(-1,
            cos(radians(${latP1})) * cos(radians(sl.location_lat)) *
            cos(radians(sl.location_lng) - radians(${lngP1})) +
            sin(radians(${latP2})) * sin(radians(sl.location_lat))
          )))) AS distance_miles`;

          // WHERE distance filter (duplicate params for WHERE copy)
          const latP3 = $(); params.push(userLat);
          const lngP2 = $(); params.push(userLng);
          const latP4 = $(); params.push(userLat);
          const radiusP = $(); params.push(maxMiles);

          whereParts.push(
            `(sl.location_lat IS NULL OR (3959 * acos(LEAST(1, GREATEST(-1,
              cos(radians(${latP3})) * cos(radians(sl.location_lat)) *
              cos(radians(sl.location_lng) - radians(${lngP2})) +
              sin(radians(${latP4})) * sin(radians(sl.location_lat))
            )))) <= ${radiusP})`
          );

          orderBy = "distance_miles ASC NULLS LAST, sl.available_date ASC";
        }
      }

      const whereClause = whereParts.join(" AND ");

      // Count query (uses same params, no LIMIT/OFFSET)
      const countQuery = `
        SELECT COUNT(*)::text AS total
        FROM scrimmage_listings sl
        JOIN teams t ON t.teamid = sl.team_id
        LEFT JOIN league_divisions ld ON ld.id = t.league_division_id
        WHERE ${whereClause}
      `;

      // List query
      const limitP = $(); params.push(ps);
      const offsetP = $(); params.push(offset);

      const listQuery = `
        SELECT
          sl.id, sl.team_id, sl.status, sl.will_travel, sl.travel_radius_miles,
          sl.location_id, sl.location_name, sl.location_lat, sl.location_lng,
          sl.available_date, sl.time_earliest, sl.time_latest,
          sl.opponent_scope, sl.age_range_min, sl.age_range_max,
          sl.sport_id, sl.notes, sl.created_at,
          t.name AS team_name, t.league_id, t.league_division_id,
          l.name AS league_name, l.abbreviation AS league_abbr,
          ld.name AS division_name, ld.age_range AS division_age_range,
          sp.sportname AS sport_name,
          loc.name AS official_location_name, loc.city AS location_city,
          loc.state AS location_state,
          (SELECT COUNT(*) FROM scrimmage_offers so WHERE so.listing_id = sl.id AND so.status = 'pending')::int AS pending_offers
          ${geoSelect}
        FROM scrimmage_listings sl
        JOIN teams t ON t.teamid = sl.team_id
        LEFT JOIN leagues l ON l.id = t.league_id
        LEFT JOIN league_divisions ld ON ld.id = t.league_division_id
        LEFT JOIN sport sp ON sp.id = sl.sport_id
        LEFT JOIN locations loc ON loc.id = sl.location_id
        WHERE ${whereClause}
        ORDER BY ${orderBy}
        LIMIT ${limitP} OFFSET ${offsetP}
      `;

      // Count uses params minus last two (limit/offset)
      const countParams = params.slice(0, params.length - 2);

      const [countResult, listResult] = await Promise.all([
        dynamicSql.query(countQuery, countParams),
        dynamicSql.query(listQuery, params),
      ]);

      const countRows = Array.isArray(countResult) ? countResult : (countResult as any).rows ?? [];
      const listRows = Array.isArray(listResult) ? listResult : (listResult as any).rows ?? [];

      return res.status(200).json({
        listings: listRows,
        total: parseInt(countRows[0]?.total ?? "0", 10),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Server error";
      console.error("[scrimmage-marketplace] GET error", err);
      return res.status(500).json({ error: msg });
    }
  }

  /* ── POST — Create a listing ─────────────────────────────────── */
  if (req.method === "POST") {
    const session = await requireSession(req, res);
    if (!session) return;

    const {
      team_id,
      will_travel,
      travel_radius_miles,
      location_id,
      location_name,
      location_lat,
      location_lng,
      available_date,
      time_earliest,
      time_latest,
      opponent_scope,
      age_range_min,
      age_range_max,
      notes,
    } = req.body ?? {};

    if (!team_id || !available_date) {
      return res.status(400).json({ error: "team_id and available_date are required" });
    }

    const teamId = parseInt(String(team_id), 10);
    if (isNaN(teamId)) return res.status(400).json({ error: "Invalid team_id" });

    // Auth: must be team manager
    const authSession = await requireTeamAccess(req, res, teamId);
    if (!authSession) return;

    try {
      // Get team's sport_id for auto-population
      const teamRows = await sql`SELECT sportid FROM teams WHERE teamid = ${teamId}`;
      const sportId = teamRows[0]?.sportid ?? null;

      // If location_id provided, denormalize lat/lng from locations table
      let finalLat = location_lat ?? null;
      let finalLng = location_lng ?? null;
      if (location_id && (!finalLat || !finalLng)) {
        const locRows = await sql`
          SELECT latitude, longitude FROM locations WHERE id = ${location_id}
        `;
        if (locRows[0]) {
          finalLat = locRows[0].latitude;
          finalLng = locRows[0].longitude;
        }
      }

      const rows = await sql`
        INSERT INTO scrimmage_listings (
          team_id, created_by, will_travel, travel_radius_miles,
          location_id, location_name, location_lat, location_lng,
          available_date, time_earliest, time_latest,
          opponent_scope, age_range_min, age_range_max, sport_id, notes
        ) VALUES (
          ${teamId}, ${session.user.id},
          ${!!will_travel}, ${will_travel ? (travel_radius_miles ?? null) : null},
          ${location_id ?? null}, ${location_name?.trim() || null},
          ${finalLat}, ${finalLng},
          ${available_date},
          ${time_earliest || null}, ${time_latest || null},
          ${opponent_scope || "any"},
          ${age_range_min ?? null}, ${age_range_max ?? null},
          ${sportId}, ${notes?.trim() || null}
        )
        RETURNING id
      `;

      return res.status(201).json({ id: rows[0].id });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Server error";
      console.error("[scrimmage-marketplace] POST error", err);
      return res.status(500).json({ error: msg });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
