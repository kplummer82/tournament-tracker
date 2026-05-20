// pages/api/tournaments/[tournamentid]/venues/index.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "@/lib/db";
import { requireSession, requireTournamentAccess } from "@/lib/auth/requireSession";
import { loadVenues, runAutoPromotionIfNeeded } from "@/lib/tournaments/venues";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const tournamentId = Number(req.query.tournamentid);
  if (!Number.isFinite(tournamentId)) {
    return res.status(400).json({ error: "Invalid tournament id" });
  }
  if (req.method === "GET") return getVenues(req, res, tournamentId);
  if (req.method === "POST") return createVenue(req, res, tournamentId);
  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).end("Method Not Allowed");
}

async function getVenues(req: NextApiRequest, res: NextApiResponse, tournamentId: number) {
  const session = await requireSession(req, res);
  if (!session) return;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await runAutoPromotionIfNeeded(client, tournamentId);
    const venues = await loadVenues(client, tournamentId);
    await client.query("COMMIT");
    return res.status(200).json({ venues });
  } catch (e: any) {
    await client.query("ROLLBACK");
    console.error(e);
    return res.status(500).json({ error: e.message || "Failed to load venues" });
  } finally {
    client.release();
  }
}

async function createVenue(req: NextApiRequest, res: NextApiResponse, tournamentId: number) {
  const session = await requireTournamentAccess(req, res, tournamentId);
  if (!session) return;
  const body = req.body ?? {};
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let venueId: number;

    if (body.kind === "predefined") {
      const locationId = Number(body.locationId);
      if (!Number.isFinite(locationId)) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "locationId required for predefined kind" });
      }
      const { rows: locRows } = await client.query(
        `SELECT id FROM locations WHERE id = $1`,
        [locationId],
      );
      if (locRows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Unknown location" });
      }
      try {
        const { rows: ins } = await client.query(
          `INSERT INTO tournament_venues (tournament_id, location_id, sort_order, created_by)
             VALUES ($1, $2,
               COALESCE((SELECT MAX(sort_order) + 1 FROM tournament_venues WHERE tournament_id = $1), 0),
               $3)
             RETURNING id`,
          [tournamentId, locationId, session.user.id],
        );
        venueId = Number(ins[0].id);
      } catch (e: any) {
        if (String(e.code) === "23505") {
          await client.query("ROLLBACK");
          return res.status(409).json({ error: "Tournament already includes this location" });
        }
        throw e;
      }

      // Pre-populate fields from the location's existing location_fields (if any).
      const { rows: lf } = await client.query(
        `SELECT name FROM location_fields WHERE location_id = $1 ORDER BY id ASC`,
        [locationId],
      );
      let order = 0;
      for (const f of lf) {
        await client.query(
          `INSERT INTO tournament_venue_fields (tournament_venue_id, name, sort_order)
             VALUES ($1, $2, $3)
             ON CONFLICT (tournament_venue_id, name) DO NOTHING`,
          [venueId, String(f.name).trim(), order++],
        );
      }
    } else if (body.kind === "custom") {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "name required for custom kind" });
      }
      const { rows: ins } = await client.query(
        `INSERT INTO tournament_venues
           (tournament_id, custom_name, custom_address, custom_city, custom_state, sort_order, created_by)
         VALUES ($1, $2, $3, $4, $5,
           COALESCE((SELECT MAX(sort_order) + 1 FROM tournament_venues WHERE tournament_id = $1), 0),
           $6)
         RETURNING id`,
        [
          tournamentId,
          name,
          typeof body.address === "string" ? body.address.trim() || null : null,
          typeof body.city === "string" ? body.city.trim() || null : null,
          typeof body.state === "string" ? body.state.trim() || null : null,
          session.user.id,
        ],
      );
      venueId = Number(ins[0].id);

      const fields: unknown = body.fields;
      if (Array.isArray(fields)) {
        let order = 0;
        const seen = new Set<string>();
        for (const f of fields) {
          if (typeof f !== "string") continue;
          const t = f.trim();
          if (!t) continue;
          const key = t.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          await client.query(
            `INSERT INTO tournament_venue_fields (tournament_venue_id, name, sort_order)
               VALUES ($1, $2, $3)
               ON CONFLICT (tournament_venue_id, name) DO NOTHING`,
            [venueId, t, order++],
          );
        }
      }
    } else {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "kind must be 'predefined' or 'custom'" });
    }

    const venues = await loadVenues(client, tournamentId);
    await client.query("COMMIT");
    const created = venues.find((v) => v.id === venueId);
    return res.status(201).json({ venue: created });
  } catch (e: any) {
    await client.query("ROLLBACK");
    console.error(e);
    return res.status(500).json({ error: e.message || "Failed to create venue" });
  } finally {
    client.release();
  }
}
