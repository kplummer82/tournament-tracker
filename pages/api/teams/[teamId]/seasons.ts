import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";

function parseTeamId(req: NextApiRequest): number | null {
  const raw = Array.isArray(req.query.teamId) ? req.query.teamId[0] : req.query.teamId;
  if (raw == null) return null;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const teamId = parseTeamId(req);
  if (!teamId) return res.status(400).json({ error: "Invalid teamId" });

  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end("Method Not Allowed");
  }

  try {
    const rows = await sql`
      SELECT s.id, s.name, s.year, s.season_type, s.status,
             s.allstar_nominations_enabled, s.allstar_max_per_team
      FROM season_teams st
      JOIN seasons s ON s.id = st.season_id
      WHERE st.team_id = ${teamId}
      ORDER BY s.year DESC, s.name ASC
    `;
    return res.status(200).json({ seasons: rows });
  } catch (err: any) {
    console.error("[teams/[teamId]/seasons] error", err);
    return res.status(500).json({ error: err.message ?? "Server error" });
  }
}
