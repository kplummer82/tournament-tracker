import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";
import { requireTeamAccess } from "@/lib/auth/requireSession";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const teamId = parseInt(req.query.teamId as string, 10);
  const scrimmageId = parseInt(req.query.scrimmageId as string, 10);
  if (isNaN(teamId) || isNaN(scrimmageId)) {
    return res.status(400).json({ error: "Invalid ID" });
  }

  if (req.method !== "PATCH") {
    res.setHeader("Allow", "PATCH");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Only the hosting team (sc.team_id) can set the field.
  const session = await requireTeamAccess(req, res, teamId);
  if (!session) return;

  const existing = await sql`
    SELECT id FROM scrimmages WHERE id = ${scrimmageId} AND team_id = ${teamId}
  `;
  if (existing.length === 0) {
    return res.status(404).json({ error: "Scrimmage not found" });
  }

  const raw = req.body?.field;
  const field = typeof raw === "string" ? raw.trim() || null : null;

  try {
    await sql`UPDATE scrimmages SET field = ${field} WHERE id = ${scrimmageId}`;
    return res.status(200).json({ ok: true, field });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Server error";
    console.error("[scrimmages/field] PATCH error", err);
    return res.status(500).json({ error: msg });
  }
}
