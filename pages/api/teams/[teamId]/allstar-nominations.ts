import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";
import { requireTeamAccess } from "@/lib/auth/requireSession";

function parseTeamId(req: NextApiRequest): number | null {
  const raw = Array.isArray(req.query.teamId) ? req.query.teamId[0] : req.query.teamId;
  if (raw == null) return null;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const teamId = parseTeamId(req);
  if (!teamId) return res.status(400).json({ error: "Invalid teamId" });

  try {
    if (req.method === "GET") {
      const seasonId = Number(req.query.seasonId);
      if (!Number.isFinite(seasonId)) return res.status(400).json({ error: "seasonId required" });

      const rows = await sql`
        SELECT an.id, an.roster_id, an.nominated_by, an.nominated_at
        FROM allstar_nominations an
        JOIN team_roster tr ON tr.id = an.roster_id
        WHERE an.season_id = ${seasonId} AND tr.teamid = ${teamId}
      `;
      return res.status(200).json({ nominations: rows });
    }

    if (req.method === "POST") {
      const session = await requireTeamAccess(req, res, teamId);
      if (!session) return;

      const { seasonId, rosterId } = req.body ?? {};
      if (!seasonId || !rosterId) return res.status(400).json({ error: "seasonId and rosterId required" });

      // Validate season has allstar nominations enabled
      const [season] = await sql`
        SELECT allstar_nominations_enabled, allstar_max_per_team
        FROM seasons WHERE id = ${seasonId}
      `;
      if (!season) return res.status(404).json({ error: "Season not found" });
      if (!season.allstar_nominations_enabled) {
        return res.status(400).json({ error: "All-star nominations are not enabled for this season" });
      }

      // Validate roster entry belongs to this team and is a player
      const [rosterEntry] = await sql`
        SELECT id, role FROM team_roster WHERE id = ${rosterId} AND teamid = ${teamId}
      `;
      if (!rosterEntry) return res.status(404).json({ error: "Roster entry not found for this team" });
      if (rosterEntry.role !== "player") {
        return res.status(400).json({ error: "Only players can be nominated" });
      }

      // Enforce max per team (atomic count + insert)
      if (season.allstar_max_per_team != null) {
        const [{ count }] = await sql`
          SELECT COUNT(*)::int AS count
          FROM allstar_nominations an
          JOIN team_roster tr ON tr.id = an.roster_id
          WHERE an.season_id = ${seasonId} AND tr.teamid = ${teamId}
        `;
        if (count >= season.allstar_max_per_team) {
          return res.status(400).json({ error: `Maximum of ${season.allstar_max_per_team} nominations per team reached` });
        }
      }

      const [row] = await sql`
        INSERT INTO allstar_nominations (season_id, roster_id, nominated_by)
        VALUES (${seasonId}, ${rosterId}, ${session.user.id})
        ON CONFLICT (season_id, roster_id) DO NOTHING
        RETURNING id, season_id, roster_id, nominated_by, nominated_at
      `;
      return res.status(201).json({ nomination: row ?? null });
    }

    if (req.method === "DELETE") {
      const session = await requireTeamAccess(req, res, teamId);
      if (!session) return;

      const { seasonId, rosterId } = req.body ?? {};
      if (!seasonId || !rosterId) return res.status(400).json({ error: "seasonId and rosterId required" });

      await sql`
        DELETE FROM allstar_nominations WHERE season_id = ${seasonId} AND roster_id = ${rosterId}
      `;
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", ["GET", "POST", "DELETE"]);
    return res.status(405).end("Method Not Allowed");
  } catch (err: any) {
    console.error("[teams/[teamId]/allstar-nominations] error", err);
    return res.status(500).json({ error: err.message ?? "Server error" });
  }
}
