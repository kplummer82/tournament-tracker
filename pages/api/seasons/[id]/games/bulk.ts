import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";
import { requireSeasonAccess } from "@/lib/auth/requireSession";

function parseSeasonId(req: NextApiRequest): number | null {
  const raw = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  const n = parseInt(String(raw ?? ""), 10);
  return Number.isFinite(n) ? n : null;
}

interface BulkGame {
  gamedate: string;
  gametime: string;
  home: number;
  away: number;
  location?: string;
  field?: string;
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
    const { games, mode = "add" } = req.body ?? {};

    if (!Array.isArray(games)) {
      return res.status(400).json({ error: "games must be an array" });
    }
    if (!["add", "replace"].includes(mode)) {
      return res.status(400).json({ error: "mode must be 'add' or 'replace'" });
    }

    const valid: BulkGame[] = games.filter(
      (g: any) =>
        g &&
        typeof g.gamedate === "string" &&
        typeof g.gametime === "string" &&
        typeof g.home === "number" &&
        typeof g.away === "number" &&
        g.home !== g.away
    );

    if (valid.length === 0) {
      return res.status(400).json({ error: "No valid games to insert" });
    }

    if (mode === "replace") {
      await sql`
        DELETE FROM season_games
        WHERE season_id = ${seasonId} AND game_type = 'regular'
      `;
    }

    await Promise.all(
      valid.map(g => sql`
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

    return res.status(200).json({ ok: true, created: valid.length });
  } catch (err: any) {
    console.error("[seasons/[id]/games/bulk] error", err);
    return res.status(500).json({ error: err.message ?? "Server error" });
  }
}
