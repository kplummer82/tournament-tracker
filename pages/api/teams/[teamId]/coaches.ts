import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";
import { requireTeamAccess } from "@/lib/auth/requireSession";

function parseTeamId(req: NextApiRequest): number | null {
  const raw = Array.isArray(req.query.teamId) ? req.query.teamId[0] : req.query.teamId;
  const n = parseInt(String(raw ?? ""), 10);
  return Number.isFinite(n) ? n : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const teamId = parseTeamId(req);
  if (!teamId) return res.status(400).json({ error: "Invalid team id" });

  try {
    if (req.method === "GET") {
      const rows = await sql`
        SELECT lc.id, lc.first_name, lc.last_name, lc.phone
        FROM team_coaches tc
        JOIN league_coaches lc ON lc.id = tc.coach_id
        WHERE tc.team_id = ${teamId}
        ORDER BY lc.last_name ASC, lc.first_name ASC
      `;
      return res.status(200).json({ coaches: rows });
    }

    if (req.method === "POST") {
      const session = await requireTeamAccess(req, res, teamId);
      if (!session) return;

      const { coachIds } = req.body ?? {};
      if (!Array.isArray(coachIds) || coachIds.length === 0) {
        return res.status(400).json({ error: "coachIds array is required" });
      }

      const ids = coachIds.map((x: any) => Number(x)).filter((n) => Number.isFinite(n));

      // Validate all coaches belong to the same league as this team
      const teamRows = await sql`SELECT league_id FROM teams WHERE teamid = ${teamId}`;
      if (!teamRows.length) return res.status(404).json({ error: "Team not found" });
      const teamLeagueId = teamRows[0].league_id;
      if (!teamLeagueId) {
        return res.status(400).json({ error: "Team is not affiliated with a league" });
      }

      const validCoaches = await sql`
        SELECT id FROM league_coaches
        WHERE id = ANY(${ids}) AND league_id = ${teamLeagueId}
      `;
      const validIds = new Set(validCoaches.map((r: any) => r.id));
      const invalid = ids.filter((id) => !validIds.has(id));
      if (invalid.length > 0) {
        return res.status(400).json({ error: `Coach IDs not found in this league: ${invalid.join(", ")}` });
      }

      let added = 0;
      for (const coachId of ids) {
        await sql`
          INSERT INTO team_coaches (team_id, coach_id)
          VALUES (${teamId}, ${coachId})
          ON CONFLICT (team_id, coach_id) DO NOTHING
        `;
        added++;
      }

      return res.status(200).json({ ok: true, added });
    }

    if (req.method === "DELETE") {
      const session = await requireTeamAccess(req, res, teamId);
      if (!session) return;

      const { coachId } = req.body ?? {};
      const id = Number(coachId);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ error: "coachId is required" });
      }

      await sql`
        DELETE FROM team_coaches
        WHERE team_id = ${teamId} AND coach_id = ${id}
      `;
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", ["GET", "POST", "DELETE"]);
    return res.status(405).end("Method Not Allowed");
  } catch (err: any) {
    console.error("[teams/[teamId]/coaches] error", err);
    return res.status(500).json({ error: err.message ?? "Server error" });
  }
}
