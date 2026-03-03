import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";
import type { RosterRow } from "@/pages/api/teams/[teamId]/roster";

function parseId(val: string | string[] | undefined): number | null {
  const raw = Array.isArray(val) ? val[0] : val;
  if (raw == null) return null;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const teamId = parseId(req.query.teamId);
  const rosterId = parseId(req.query.rosterId);
  if (!teamId) return res.status(400).json({ error: "Invalid teamId" });
  if (!rosterId) return res.status(400).json({ error: "Invalid rosterId" });

  if (req.method !== "PATCH") {
    res.setHeader("Allow", "PATCH");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};

    // Collect only the fields that were explicitly provided in the request body
    const updates: Record<string, unknown> = {};
    if ("hat_monogram" in body) {
      updates.hat_monogram = typeof body.hat_monogram === "string" ? body.hat_monogram.trim() || null : null;
    }
    if ("walkup_song" in body) {
      updates.walkup_song = typeof body.walkup_song === "string" ? body.walkup_song.trim() || null : null;
    }
    if ("walkup_song_itunes_id" in body) {
      const raw = body.walkup_song_itunes_id;
      if (raw == null || raw === "") {
        updates.walkup_song_itunes_id = null;
      } else {
        const n = parseInt(String(raw), 10);
        updates.walkup_song_itunes_id = Number.isFinite(n) ? n : null;
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No updatable fields provided." });
    }

    // Build the SET clause dynamically using tagged template literal approach via raw sql
    // We'll use conditional sql fragments
    const hatMonogram = "hat_monogram" in updates ? updates.hat_monogram as string | null : undefined;
    const walkupSong = "walkup_song" in updates ? updates.walkup_song as string | null : undefined;
    const walkupSongItunesId = "walkup_song_itunes_id" in updates ? updates.walkup_song_itunes_id as number | null : undefined;

    let updated: RosterRow[];

    if (hatMonogram !== undefined && walkupSong !== undefined && walkupSongItunesId !== undefined) {
      updated = (await sql`
        UPDATE public.team_roster
        SET hat_monogram = ${hatMonogram},
            walkup_song = ${walkupSong},
            walkup_song_itunes_id = ${walkupSongItunesId}
        WHERE id = ${rosterId} AND teamid = ${teamId}
        RETURNING id, teamid, first_name, last_name, role, jersey_number, hat_monogram, walkup_song, walkup_song_itunes_id
      `) as RosterRow[];
    } else if (hatMonogram !== undefined && walkupSong !== undefined) {
      updated = (await sql`
        UPDATE public.team_roster
        SET hat_monogram = ${hatMonogram},
            walkup_song = ${walkupSong}
        WHERE id = ${rosterId} AND teamid = ${teamId}
        RETURNING id, teamid, first_name, last_name, role, jersey_number, hat_monogram, walkup_song, walkup_song_itunes_id
      `) as RosterRow[];
    } else if (hatMonogram !== undefined && walkupSongItunesId !== undefined) {
      updated = (await sql`
        UPDATE public.team_roster
        SET hat_monogram = ${hatMonogram},
            walkup_song_itunes_id = ${walkupSongItunesId}
        WHERE id = ${rosterId} AND teamid = ${teamId}
        RETURNING id, teamid, first_name, last_name, role, jersey_number, hat_monogram, walkup_song, walkup_song_itunes_id
      `) as RosterRow[];
    } else if (walkupSong !== undefined && walkupSongItunesId !== undefined) {
      updated = (await sql`
        UPDATE public.team_roster
        SET walkup_song = ${walkupSong},
            walkup_song_itunes_id = ${walkupSongItunesId}
        WHERE id = ${rosterId} AND teamid = ${teamId}
        RETURNING id, teamid, first_name, last_name, role, jersey_number, hat_monogram, walkup_song, walkup_song_itunes_id
      `) as RosterRow[];
    } else if (hatMonogram !== undefined) {
      updated = (await sql`
        UPDATE public.team_roster
        SET hat_monogram = ${hatMonogram}
        WHERE id = ${rosterId} AND teamid = ${teamId}
        RETURNING id, teamid, first_name, last_name, role, jersey_number, hat_monogram, walkup_song, walkup_song_itunes_id
      `) as RosterRow[];
    } else if (walkupSong !== undefined) {
      updated = (await sql`
        UPDATE public.team_roster
        SET walkup_song = ${walkupSong}
        WHERE id = ${rosterId} AND teamid = ${teamId}
        RETURNING id, teamid, first_name, last_name, role, jersey_number, hat_monogram, walkup_song, walkup_song_itunes_id
      `) as RosterRow[];
    } else {
      updated = (await sql`
        UPDATE public.team_roster
        SET walkup_song_itunes_id = ${walkupSongItunesId as number | null}
        WHERE id = ${rosterId} AND teamid = ${teamId}
        RETURNING id, teamid, first_name, last_name, role, jersey_number, hat_monogram, walkup_song, walkup_song_itunes_id
      `) as RosterRow[];
    }

    if (!updated || updated.length === 0) {
      return res.status(404).json({ error: "Roster entry not found." });
    }

    return res.status(200).json(updated[0]);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("[roster PATCH]", err);
    return res.status(500).json({ error: message });
  }
}
