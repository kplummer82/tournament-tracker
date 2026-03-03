import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";

function parseIds(req: NextApiRequest) {
  const seasonId = parseInt(String(Array.isArray(req.query.id) ? req.query.id[0] : req.query.id), 10);
  const bracketId = parseInt(String(Array.isArray(req.query.bracketId) ? req.query.bracketId[0] : req.query.bracketId), 10);
  return { seasonId, bracketId };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { seasonId, bracketId } = parseIds(req);
  if (!Number.isFinite(seasonId) || !Number.isFinite(bracketId)) {
    return res.status(400).json({ error: "Invalid season or bracket id" });
  }

  try {
    if (req.method === "GET") {
      const rows = await sql`
        SELECT sba.seed_index, sba.team_id, t.name AS team_name
        FROM season_bracket_assignments sba
        LEFT JOIN teams t ON t.teamid = sba.team_id
        WHERE sba.season_bracket_id = ${bracketId}
        ORDER BY sba.seed_index ASC
      `;
      return res.status(200).json({
        assignments: rows.map((a: any) => ({
          seedIndex: Number(a.seed_index),
          teamId: Number(a.team_id),
          teamName: a.team_name ?? null,
        })),
      });
    }

    if (req.method === "PUT") {
      // Verify this bracket belongs to the given season
      const bracketRows = await sql`
        SELECT id FROM season_brackets WHERE id = ${bracketId} AND season_id = ${seasonId}
      `;
      if (!bracketRows.length) return res.status(404).json({ error: "Bracket not found" });

      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body ?? {};
      const rawAssignments = Array.isArray(body.assignments) ? body.assignments : [];

      const assignments = rawAssignments
        .filter((a: any) => Number.isFinite(Number(a.seedIndex)) && Number.isFinite(Number(a.teamId)) && Number(a.seedIndex) >= 1)
        .map((a: any) => ({ seedIndex: Number(a.seedIndex), teamId: Number(a.teamId) }));

      // Replace all assignments for this bracket
      await sql`DELETE FROM season_bracket_assignments WHERE season_bracket_id = ${bracketId}`;
      for (const a of assignments) {
        await sql`
          INSERT INTO season_bracket_assignments (season_bracket_id, seed_index, team_id)
          VALUES (${bracketId}, ${a.seedIndex}, ${a.teamId})
        `;
      }

      // Update bracket updated_at
      await sql`UPDATE season_brackets SET updated_at = now() WHERE id = ${bracketId}`;

      const rows = await sql`
        SELECT sba.seed_index, sba.team_id, t.name AS team_name
        FROM season_bracket_assignments sba
        LEFT JOIN teams t ON t.teamid = sba.team_id
        WHERE sba.season_bracket_id = ${bracketId}
        ORDER BY sba.seed_index ASC
      `;

      return res.status(200).json({
        ok: true,
        assignments: rows.map((a: any) => ({
          seedIndex: Number(a.seed_index),
          teamId: Number(a.team_id),
          teamName: a.team_name ?? null,
        })),
      });
    }

    res.setHeader("Allow", ["GET", "PUT"]);
    return res.status(405).end("Method Not Allowed");
  } catch (err: any) {
    console.error("[seasons/[id]/brackets/[bracketId]/assignments] error", err);
    return res.status(500).json({ error: err.message ?? "Server error" });
  }
}
