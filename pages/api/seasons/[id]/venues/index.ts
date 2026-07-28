// pages/api/seasons/[id]/venues/index.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "@/lib/db";
import { requireSession, requireSeasonAccess } from "@/lib/auth/requireSession";
import { getUserRoles, hasSeasonAccess, getSeasonAncestry } from "@/lib/auth/permissions";
import { loadVenues, runAutoPromotionIfNeeded } from "@/lib/seasons/venues";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const seasonId = Number(req.query.id);
  if (!Number.isFinite(seasonId)) {
    return res.status(400).json({ error: "Invalid season id" });
  }
  if (req.method === "GET") return getVenues(req, res, seasonId);
  if (req.method === "POST") return createVenue(req, res, seasonId);
  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).end("Method Not Allowed");
}

async function getVenues(req: NextApiRequest, res: NextApiResponse, seasonId: number) {
  const session = await requireSession(req, res);
  if (!session) return;

  // Auto-promotion writes data; only run it for callers with season/division
  // access. Non-admin readers just see whatever venues already exist.
  let canAdmin = session.user.role === "admin";
  if (!canAdmin) {
    const ancestry = await getSeasonAncestry(seasonId);
    if (ancestry) {
      canAdmin = hasSeasonAccess(await getUserRoles(session.user.id), ancestry.division_id, ancestry.league_id);
    }
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (canAdmin) {
      await runAutoPromotionIfNeeded(client, seasonId);
    }
    const venues = await loadVenues(client, seasonId);
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

async function createVenue(req: NextApiRequest, res: NextApiResponse, seasonId: number) {
  const session = await requireSeasonAccess(req, res, seasonId);
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
          `INSERT INTO season_venues (season_id, location_id, sort_order, created_by)
             VALUES ($1, $2,
               COALESCE((SELECT MAX(sort_order) + 1 FROM season_venues WHERE season_id = $1), 0),
               $3)
             RETURNING id`,
          [seasonId, locationId, session.user.id],
        );
        venueId = Number(ins[0].id);
      } catch (e: any) {
        if (String(e.code) === "23505") {
          await client.query("ROLLBACK");
          return res.status(409).json({ error: "Season already includes this location" });
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
          `INSERT INTO season_venue_fields (season_venue_id, name, sort_order)
             VALUES ($1, $2, $3)
             ON CONFLICT (season_venue_id, LOWER(name)) DO NOTHING`,
          [venueId, String(f.name).trim(), order++],
        );
      }
    } else if (body.kind === "custom") {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "name required for custom kind" });
      }
      try {
        const { rows: ins } = await client.query(
          `INSERT INTO season_venues
             (season_id, custom_name, custom_address, custom_city, custom_state, sort_order, created_by)
           VALUES ($1, $2, $3, $4, $5,
             COALESCE((SELECT MAX(sort_order) + 1 FROM season_venues WHERE season_id = $1), 0),
             $6)
           RETURNING id`,
          [
            seasonId,
            name,
            typeof body.address === "string" ? body.address.trim() || null : null,
            typeof body.city === "string" ? body.city.trim() || null : null,
            typeof body.state === "string" ? body.state.trim() || null : null,
            session.user.id,
          ],
        );
        venueId = Number(ins[0].id);
      } catch (e: any) {
        if (String(e.code) === "23505") {
          await client.query("ROLLBACK");
          return res.status(409).json({ error: "Season already includes a custom venue with this name" });
        }
        throw e;
      }

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
            `INSERT INTO season_venue_fields (season_venue_id, name, sort_order)
               VALUES ($1, $2, $3)
               ON CONFLICT (season_venue_id, LOWER(name)) DO NOTHING`,
            [venueId, t, order++],
          );
        }
      }
    } else {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "kind must be 'predefined' or 'custom'" });
    }

    const venues = await loadVenues(client, seasonId);
    const created = venues.find((v) => v.id === venueId);
    if (!created) {
      await client.query("ROLLBACK");
      return res.status(500).json({ error: "Venue created but could not be loaded" });
    }
    await client.query("COMMIT");
    return res.status(201).json({ venue: created });
  } catch (e: any) {
    await client.query("ROLLBACK");
    console.error(e);
    return res.status(500).json({ error: e.message || "Failed to create venue" });
  } finally {
    client.release();
  }
}
