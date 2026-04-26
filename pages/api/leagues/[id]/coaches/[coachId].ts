import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";
import { requireLeagueAccess } from "@/lib/auth/requireSession";

function parseIds(req: NextApiRequest): { leagueId: number | null; coachId: number | null } {
  const rawLeague = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  const rawCoach = Array.isArray(req.query.coachId) ? req.query.coachId[0] : req.query.coachId;
  const leagueId = parseInt(String(rawLeague ?? ""), 10);
  const coachId = parseInt(String(rawCoach ?? ""), 10);
  return {
    leagueId: Number.isFinite(leagueId) ? leagueId : null,
    coachId: Number.isFinite(coachId) ? coachId : null,
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { leagueId, coachId } = parseIds(req);
  if (!leagueId || !coachId) return res.status(400).json({ error: "Invalid league or coach id" });

  try {
    if (req.method === "GET") {
      const rows = await sql`
        SELECT
          lc.id, lc.first_name, lc.last_name, lc.phone,
          to_char(lc.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
        FROM league_coaches lc
        WHERE lc.id = ${coachId} AND lc.league_id = ${leagueId}
      `;
      if (!rows.length) return res.status(404).json({ error: "Not found" });

      const teams = await sql`
        SELECT
          tc.team_id,
          t.name AS team_name,
          ld.name AS division_name
        FROM team_coaches tc
        JOIN teams t ON t.teamid = tc.team_id
        LEFT JOIN league_divisions ld ON ld.id = t.league_division_id
        WHERE tc.coach_id = ${coachId}
        ORDER BY ld.name ASC, t.name ASC
      `;

      return res.status(200).json({ ...rows[0], teams });
    }

    if (req.method === "PATCH") {
      const session = await requireLeagueAccess(req, res, leagueId);
      if (!session) return;

      const { first_name, last_name, phone } = req.body ?? {};
      const rows = await sql`
        UPDATE league_coaches
        SET
          first_name = COALESCE(${first_name?.trim() ?? null}, first_name),
          last_name  = COALESCE(${last_name?.trim() ?? null}, last_name),
          phone      = COALESCE(${phone?.trim() ?? null}, phone)
        WHERE id = ${coachId} AND league_id = ${leagueId}
        RETURNING id, league_id, first_name, last_name, phone,
          to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
      `;
      if (!rows.length) return res.status(404).json({ error: "Not found" });
      return res.status(200).json(rows[0]);
    }

    if (req.method === "DELETE") {
      const session = await requireLeagueAccess(req, res, leagueId);
      if (!session) return;

      const rows = await sql`
        DELETE FROM league_coaches
        WHERE id = ${coachId} AND league_id = ${leagueId}
        RETURNING id
      `;
      if (!rows.length) return res.status(404).json({ error: "Not found" });
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", ["GET", "PATCH", "DELETE"]);
    return res.status(405).end("Method Not Allowed");
  } catch (err: any) {
    console.error("[leagues/[id]/coaches/[coachId]] error", err);
    return res.status(500).json({ error: err.message ?? "Server error" });
  }
}
