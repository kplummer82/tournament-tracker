// pages/api/tournaments/[tournamentid]/venues/[venueId]/fields/[fieldId].ts
import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "@/lib/db";
import { requireTournamentAccess } from "@/lib/auth/requireSession";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const tournamentId = Number(req.query.tournamentid);
  const venueId = Number(req.query.venueId);
  const fieldId = Number(req.query.fieldId);
  if (![tournamentId, venueId, fieldId].every(Number.isFinite)) {
    return res.status(400).json({ error: "Invalid id(s)" });
  }
  const session = await requireTournamentAccess(req, res, tournamentId);
  if (!session) return;

  const client = await pool.connect();
  try {
    // Ownership check
    const { rows: own } = await client.query(
      `SELECT 1
       FROM tournament_venue_fields f
       JOIN tournament_venues v ON v.id = f.tournament_venue_id
       WHERE f.id = $1 AND v.id = $2 AND v.tournament_id = $3`,
      [fieldId, venueId, tournamentId],
    );
    if (own.length === 0) return res.status(404).json({ error: "Field not found" });

    if (req.method === "PATCH") {
      const body = req.body ?? {};
      const sets: string[] = [];
      const params: any[] = [];
      let i = 1;
      if (typeof body.name === "string") {
        const t = body.name.trim();
        if (!t) return res.status(400).json({ error: "name cannot be empty" });
        const { rows: dup } = await client.query(
          `SELECT id FROM tournament_venue_fields
            WHERE tournament_venue_id = $1 AND LOWER(name) = LOWER($2) AND id <> $3 LIMIT 1`,
          [venueId, t, fieldId],
        );
        if (dup.length > 0) return res.status(409).json({ error: "Field already exists on this venue" });
        sets.push(`name = $${i++}`);
        params.push(t);
      }
      if (body.sortOrder != null && Number.isFinite(Number(body.sortOrder))) {
        sets.push(`sort_order = $${i++}`);
        params.push(Number(body.sortOrder));
      }
      if (sets.length === 0) return res.status(200).json({ ok: true });

      params.push(fieldId);
      try {
        const { rows: upd } = await client.query(
          `UPDATE tournament_venue_fields SET ${sets.join(", ")}
            WHERE id = $${i}
            RETURNING id, name, sort_order`,
          params,
        );
        return res.status(200).json({
          field: { id: Number(upd[0].id), name: upd[0].name, sortOrder: Number(upd[0].sort_order) },
        });
      } catch (e: any) {
        if (String(e.code) === "23505") {
          return res.status(409).json({ error: "Field already exists on this venue" });
        }
        throw e;
      }
    }

    if (req.method === "DELETE") {
      await client.query(`DELETE FROM tournament_venue_fields WHERE id = $1`, [fieldId]);
      return res.status(204).end();
    }

    res.setHeader("Allow", ["PATCH", "DELETE"]);
    return res.status(405).end("Method Not Allowed");
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: "Failed to update field" });
  } finally {
    client.release();
  }
}
