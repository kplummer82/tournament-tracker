import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";
import { requireTournamentAccess } from "@/lib/auth/requireSession";

function parseId(val: string | string[] | undefined): number | null {
  const raw = Array.isArray(val) ? val[0] : val;
  if (raw == null) return null;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const tournamentId = parseId(req.query.tournamentid);
  const teamId = parseId(req.query.teamId);

  if (!tournamentId) return res.status(400).json({ error: "Invalid tournamentid" });
  if (!teamId) return res.status(400).json({ error: "Invalid teamId" });

  if (req.method === "PATCH") {
    const session = await requireTournamentAccess(req, res, tournamentId!);
    if (!session) return;

    try {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};

      if (!("pool_group" in body)) {
        return res.status(400).json({ error: "pool_group field is required." });
      }

      const poolGroup =
        body.pool_group === null || body.pool_group === ""
          ? null
          : typeof body.pool_group === "string"
            ? body.pool_group.trim() || null
            : null;

      const updated = await sql`
        UPDATE public.tournamentteams
        SET pool_group = ${poolGroup}
        WHERE tournamentid = ${tournamentId} AND teamid = ${teamId}
        RETURNING teamid AS id, tournamentid, pool_group
      `;

      if (!updated || updated.length === 0) {
        return res.status(404).json({ error: "Team not found in this tournament." });
      }

      return res.status(200).json(updated[0]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Server error";
      console.error("[tournament team PATCH]", err);
      return res.status(500).json({ error: message });
    }
  }

  if (req.method === "DELETE") {
    const session = await requireTournamentAccess(req, res, tournamentId!);
    if (!session) return;

    try {
      await sql`
        DELETE FROM bracket_assignments
        WHERE tournament_id = ${tournamentId} AND team_id = ${teamId}
      `;

      const gamesResult = await sql`
        DELETE FROM tournamentgames
        WHERE tournamentid = ${tournamentId}
          AND (home = ${teamId} OR away = ${teamId})
          AND poolorbracket = 'Pool'
      `;

      const teamResult = await sql`
        DELETE FROM tournamentteams
        WHERE tournamentid = ${tournamentId} AND teamid = ${teamId}
        RETURNING teamid
      `;

      if (!teamResult || teamResult.length === 0) {
        return res.status(404).json({ error: "Team not found in this tournament." });
      }

      return res.status(200).json({
        removed: true,
        poolGamesDeleted: gamesResult?.length || 0,
        bracketAssignmentsDeleted: 0,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Server error";
      console.error("[tournament team DELETE]", err);
      return res.status(500).json({ error: message });
    }
  }

  res.setHeader("Allow", "PATCH, DELETE");
  return res.status(405).json({ error: "Method Not Allowed" });
}
