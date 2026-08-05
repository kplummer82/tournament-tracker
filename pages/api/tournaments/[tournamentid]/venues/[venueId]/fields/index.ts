// pages/api/tournaments/[tournamentid]/venues/[venueId]/fields/index.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "@/lib/db";
import { requireTournamentAccess } from "@/lib/auth/requireSession";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const tournamentId = Number(req.query.tournamentid);
  const venueId = Number(req.query.venueId);
  if (!Number.isFinite(tournamentId) || !Number.isFinite(venueId)) {
    return res.status(400).json({ error: "Invalid id(s)" });
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end("Method Not Allowed");
  }
  const session = await requireTournamentAccess(req, res, tournamentId);
  if (!session) return;

  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!name) return res.status(400).json({ error: "name required" });

  const client = await pool.connect();
  try {
    const { rows: own } = await client.query(
      `SELECT 1 FROM tournament_venues WHERE id = $1 AND tournament_id = $2`,
      [venueId, tournamentId],
    );
    if (own.length === 0) return res.status(404).json({ error: "Venue not found" });

    // Case-insensitive duplicate check
    const { rows: dup } = await client.query(
      `SELECT id FROM tournament_venue_fields
        WHERE tournament_venue_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`,
      [venueId, name],
    );
    if (dup.length > 0) {
      return res.status(409).json({ error: "Field already exists on this venue" });
    }

    try {
      const { rows: ins } = await client.query(
        `INSERT INTO tournament_venue_fields (tournament_venue_id, name, sort_order)
         VALUES ($1, $2,
           COALESCE((SELECT MAX(sort_order) + 1 FROM tournament_venue_fields
                      WHERE tournament_venue_id = $1), 0))
         RETURNING id, name, sort_order`,
        [venueId, name],
      );
      return res.status(201).json({
        field: { id: Number(ins[0].id), name: ins[0].name, sortOrder: Number(ins[0].sort_order) },
      });
    } catch (e: any) {
      if (String(e.code) === "23505") {
        return res.status(409).json({ error: "Field already exists on this venue" });
      }
      throw e;
    }
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: "Failed to add field" });
  } finally {
    client.release();
  }
}
