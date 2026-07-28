// pages/api/seasons/[id]/venues/[venueId]/index.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "@/lib/db";
import { requireSeasonAccess } from "@/lib/auth/requireSession";
import { loadVenues } from "@/lib/seasons/venues";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const seasonId = Number(req.query.id);
  const venueId = Number(req.query.venueId);
  if (!Number.isFinite(seasonId) || !Number.isFinite(venueId)) {
    return res.status(400).json({ error: "Invalid id(s)" });
  }
  if (req.method === "PATCH") return patchVenue(req, res, seasonId, venueId);
  if (req.method === "DELETE") return deleteVenue(req, res, seasonId, venueId);
  res.setHeader("Allow", ["PATCH", "DELETE"]);
  return res.status(405).end("Method Not Allowed");
}

async function patchVenue(req: NextApiRequest, res: NextApiResponse, seasonId: number, venueId: number) {
  const session = await requireSeasonAccess(req, res, seasonId);
  if (!session) return;
  const body = req.body ?? {};
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT id, location_id FROM season_venues
        WHERE id = $1 AND season_id = $2`,
      [venueId, seasonId],
    );
    if (rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Venue not found" });
    }
    const isCustom = rows[0].location_id == null;

    const sets: string[] = [];
    const params: any[] = [];
    let i = 1;

    if (isCustom) {
      if (typeof body.name === "string") {
        const t = body.name.trim();
        if (!t) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: "name cannot be empty" });
        }
        sets.push(`custom_name = $${i++}`);
        params.push(t);
      }
      if (typeof body.address === "string") {
        sets.push(`custom_address = $${i++}`);
        params.push(body.address.trim() || null);
      }
      if (typeof body.city === "string") {
        sets.push(`custom_city = $${i++}`);
        params.push(body.city.trim() || null);
      }
      if (typeof body.state === "string") {
        sets.push(`custom_state = $${i++}`);
        params.push(body.state.trim() || null);
      }
    }

    if (body.sortOrder != null && Number.isFinite(Number(body.sortOrder))) {
      sets.push(`sort_order = $${i++}`);
      params.push(Number(body.sortOrder));
    }

    if (sets.length === 0) {
      // Nothing to change; just return current state.
      const venues = await loadVenues(client, seasonId);
      await client.query("COMMIT");
      const updated = venues.find((v) => v.id === venueId);
      return res.status(200).json({ venue: updated });
    }

    params.push(venueId);
    try {
      await client.query(
        `UPDATE season_venues SET ${sets.join(", ")} WHERE id = $${i}`,
        params,
      );
    } catch (e: any) {
      if (String(e.code) === "23505") {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "A custom venue with that name already exists in this season" });
      }
      throw e;
    }

    const venues = await loadVenues(client, seasonId);
    const updated = venues.find((v) => v.id === venueId);
    if (!updated) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Venue not found" });
    }
    await client.query("COMMIT");
    return res.status(200).json({ venue: updated });
  } catch (e: any) {
    await client.query("ROLLBACK");
    console.error(e);
    return res.status(500).json({ error: e.message || "Failed to update venue" });
  } finally {
    client.release();
  }
}

async function deleteVenue(req: NextApiRequest, res: NextApiResponse, seasonId: number, venueId: number) {
  const session = await requireSeasonAccess(req, res, seasonId);
  if (!session) return;
  const client = await pool.connect();
  try {
    const { rowCount } = await client.query(
      `DELETE FROM season_venues
        WHERE id = $1 AND season_id = $2`,
      [venueId, seasonId],
    );
    if (rowCount === 0) return res.status(404).json({ error: "Venue not found" });
    return res.status(204).end();
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: e.message || "Failed to delete venue" });
  } finally {
    client.release();
  }
}
