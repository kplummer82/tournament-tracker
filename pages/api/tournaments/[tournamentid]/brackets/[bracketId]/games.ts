import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";

function parseTournamentId(req: NextApiRequest): number | null {
  const raw = Array.isArray(req.query.tournamentid)
    ? req.query.tournamentid[0]
    : (req.query.tournamentid as string | undefined);
  if (raw == null) return null;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : null;
}

function parseBracketId(req: NextApiRequest): number | null {
  const raw = Array.isArray(req.query.bracketId)
    ? req.query.bracketId[0]
    : (req.query.bracketId as string | undefined);
  if (raw == null) return null;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const tournamentId = parseTournamentId(req);
  const bracketId = parseBracketId(req);
  if (!tournamentId) return res.status(400).json({ error: "Invalid tournamentid" });
  if (!bracketId) return res.status(400).json({ error: "Invalid bracketId" });

  try {
    if (req.method === "GET") {
      const rows = await sql`
        SELECT
          tg.id,
          tg.bracket_game_id,
          to_char(tg.gamedate, 'YYYY-MM-DD') AS gamedate,
          to_char(tg.gametime, 'HH24:MI')    AS gametime,
          tg.location,
          tg.field,
          tg.location_id,
          tg.tournament_venue_id,
          tg.home,
          tg.away,
          th.name AS home_team,
          ta.name AS away_team,
          tg.homescore,
          tg.awayscore,
          tg.gamestatusid
        FROM public.tournamentgames tg
        LEFT JOIN public.teams th ON th.teamid = tg.home
        LEFT JOIN public.teams ta ON ta.teamid = tg.away
        WHERE tg.tournamentid = ${tournamentId}
          AND tg.bracket_id = ${bracketId}
        ORDER BY tg.bracket_game_id ASC
      `;
      return res.status(200).json({ games: rows });
    }

    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("[tournament bracket games API]", err);
    return res.status(500).json({ error: message });
  }
}
