import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";

export type RosterRow = {
  id: number;
  teamid: number;
  first_name: string;
  last_name: string | null;
  role: "player" | "staff";
  jersey_number: number | null;
  hat_monogram: string | null;
  walkup_song: string | null;
  walkup_song_itunes_id: number | null;
};

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
      const rows = (await sql`
        SELECT id, teamid, first_name, last_name, role, jersey_number,
               hat_monogram, walkup_song, walkup_song_itunes_id
        FROM public.team_roster
        WHERE teamid = ${teamId}
        ORDER BY role ASC, last_name ASC NULLS LAST, first_name ASC
      `) as RosterRow[];
      return res.status(200).json({ roster: rows });
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
      const firstName = typeof body.first_name === "string" ? body.first_name.trim() : "";
      const role = body.role === "staff" ? "staff" : body.role === "player" ? "player" : null;

      if (!firstName) return res.status(400).json({ error: "First name is required." });
      if (!role) return res.status(400).json({ error: "Role is required. Choose Player or Staff." });

      const lastName = typeof body.last_name === "string" ? body.last_name.trim() || null : null;
      const jerseyNumber =
        body.jersey_number !== undefined && body.jersey_number !== null && body.jersey_number !== ""
          ? parseInt(String(body.jersey_number), 10)
          : null;
      const jersey = Number.isFinite(jerseyNumber) ? jerseyNumber : null;
      const hatMonogram = typeof body.hat_monogram === "string" ? body.hat_monogram.trim() || null : null;
      const walkupSong = typeof body.walkup_song === "string" ? body.walkup_song.trim() || null : null;
      const walkupSongItunesId =
        body.walkup_song_itunes_id != null && body.walkup_song_itunes_id !== ""
          ? parseInt(String(body.walkup_song_itunes_id), 10)
          : null;

      const inserted = (await sql`
        INSERT INTO public.team_roster
          (teamid, first_name, last_name, role, jersey_number, hat_monogram, walkup_song, walkup_song_itunes_id)
        VALUES
          (${teamId}, ${firstName}, ${lastName}, ${role}, ${jersey}, ${hatMonogram}, ${walkupSong}, ${walkupSongItunesId})
        RETURNING id, teamid, first_name, last_name, role, jersey_number, hat_monogram, walkup_song, walkup_song_itunes_id
      `) as RosterRow[];

      return res.status(201).json(inserted[0]);
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("[roster API]", err);
    return res.status(500).json({ error: message });
  }
}
