import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";
import { requireSeasonAccess } from "@/lib/auth/requireSession";
import { generateSchedule, type ScheduleConfig } from "@/lib/auto-schedule";

function parseSeasonId(req: NextApiRequest): number | null {
  const raw = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  const n = parseInt(String(raw ?? ""), 10);
  return Number.isFinite(n) ? n : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end("Method Not Allowed");
  }

  const seasonId = parseSeasonId(req);
  if (!seasonId) return res.status(400).json({ error: "Invalid season id" });

  const session = await requireSeasonAccess(req, res, seasonId);
  if (!session) return;

  try {
    const { config, dry_run = true, mode = "add" } = req.body ?? {};

    if (!config) return res.status(400).json({ error: "config is required" });
    if (!["add", "replace"].includes(mode)) {
      return res.status(400).json({ error: "mode must be 'add' or 'replace'" });
    }

    // Fetch enrolled teams
    const teamRows = await sql`
      SELECT t.teamid AS id, t.name
      FROM season_teams st
      JOIN teams t ON t.teamid = st.team_id
      WHERE st.season_id = ${seasonId}
      ORDER BY t.name
    `;

    if (teamRows.length < 2) {
      return res.status(400).json({
        error: "Need at least 2 teams enrolled in the season to auto-schedule.",
      });
    }

    const result = generateSchedule(
      config as ScheduleConfig,
      teamRows as { id: number; name: string }[]
    );

    if (dry_run) {
      const existing = await sql`
        SELECT COUNT(*)::int AS count
        FROM season_games
        WHERE season_id = ${seasonId} AND game_type = 'regular'
      `;
      return res.status(200).json({
        ...result,
        existingGameCount: existing[0].count,
      });
    }

    // Confirmed: create games
    if (mode === "replace") {
      await sql`
        DELETE FROM season_games
        WHERE season_id = ${seasonId} AND game_type = 'regular'
      `;
    }

    if (result.games.length > 0) {
      await Promise.all(
        result.games.map(g => sql`
          INSERT INTO season_games (season_id, gamedate, gametime, home, away, game_type, location, field)
          VALUES (
            ${seasonId},
            ${g.gamedate}::date,
            ${g.gametime}::time,
            ${g.home},
            ${g.away},
            'regular',
            ${g.location || null},
            ${g.field || null}
          )
        `)
      );
    }

    return res.status(200).json({
      ok: true,
      created: result.games.length,
      warnings: result.warnings,
    });
  } catch (err: any) {
    console.error("[seasons/[id]/auto-schedule] error", err);
    return res.status(500).json({ error: err.message ?? "Server error" });
  }
}
