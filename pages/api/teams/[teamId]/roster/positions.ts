import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";
import type { Priority } from "@/lib/positions";

export type TeamPositionEntry = {
  roster_id: number;
  position: string;
  priority: Priority;
};

function parseId(val: string | string[] | undefined): number | null {
  const raw = Array.isArray(val) ? val[0] : val;
  if (raw == null) return null;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const teamId = parseId(req.query.teamId);
  if (!teamId) return res.status(400).json({ error: "Invalid teamId" });

  try {
    const rows = await sql`
      SELECT rp.roster_id, rp.position, rp.priority
      FROM public.roster_positions rp
      JOIN public.team_roster tr ON tr.id = rp.roster_id
      WHERE tr.teamid = ${teamId}
    `;
    return res.status(200).json({ positions: rows as TeamPositionEntry[] });
  } catch (err) {
    console.error("[roster positions GET]", err);
    return res.status(500).json({ error: err instanceof Error ? err.message : "Server error" });
  }
}
