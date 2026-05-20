// pages/api/tournaments/[tournamentid]/venues/[venueId]/index.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "@/lib/db";
import { requireTournamentAccess } from "@/lib/auth/requireSession";
import { loadVenues } from "@/lib/tournaments/venues";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const tournamentId = Number(req.query.tournamentid);
  const venueId = Number(req.query.venueId);
  if (!Number.isFinite(tournamentId) || !Number.isFinite(venueId)) {
    return res.status(400).json({ error: "Invalid id(s)" });
  }
  if (req.method === "PATCH") return patchVenue(req, res, tournamentId, venueId);
  if (req.method === "DELETE") return deleteVenue(req, res, tournamentId, venueId);
  res.setHeader("Allow", ["PATCH", "DELETE"]);
  return res.status(405).end("Method Not Allowed");
}

async function patchVenue(req: NextApiRequest, res: NextApiResponse, tournamentId: number, venueId: number) {
  const session = await requireTournamentAccess(req, res, tournamentId);
  if (!session) return;
  const body = req.body ?? {};
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT id, location_id FROM tournament_venues
        WHERE id = $1 AND tournament_id = $2`,
      [venueId, tournamentId],
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
      const venues = await loadVenues(client, tournamentId);
      await client.query("COMMIT");
      const updated = venues.find((v) => v.id === venueId);
      return res.status(200).json({ venue: updated });
    }

    params.push(venueId);
    try {
      await client.query(
        `UPDATE tournament_venues SET ${sets.join(", ")} WHERE id = $${i}`,
        params,
      );
    } catch (e: any) {
      if (String(e.code) === "23505") {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "A custom venue with that name already exists in this tournament" });
      }
      throw e;
    }

    const venues = await loadVenues(client, tournamentId);
    await client.query("COMMIT");
    const updated = venues.find((v) => v.id === venueId);
    return res.status(200).json({ venue: updated });
  } catch (e: any) {
    await client.query("ROLLBACK");
    console.error(e);
    return res.status(500).json({ error: e.message || "Failed to update venue" });
  } finally {
    client.release();
  }
}

async function deleteVenue(req: NextApiRequest, res: NextApiResponse, tournamentId: number, venueId: number) {
  const session = await requireTournamentAccess(req, res, tournamentId);
  if (!session) return;
  const client = await pool.connect();
  try {
    const { rowCount } = await client.query(
      `DELETE FROM tournament_venues
        WHERE id = $1 AND tournament_id = $2`,
      [venueId, tournamentId],
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
