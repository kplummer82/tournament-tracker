import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";
import { requireTeamAccess } from "@/lib/auth/requireSession";
import { parseStartSeconds } from "@/lib/roster/walkupSong";
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

  /* ── GET ─────────────────────────────────────────────────────── */
  if (req.method === "GET") {
    try {
      const rows = await sql`
        SELECT id, teamid, first_name, last_name, role, jersey_number,
               hat_monogram, walkup_song, walkup_song_itunes_id,
               walkup_song_start_seconds, deleted_at
        FROM public.team_roster
        WHERE id = ${rosterId} AND teamid = ${teamId}
        LIMIT 1
      `;
      if (!rows?.length) return res.status(404).json({ error: "Roster entry not found." });
      return res.status(200).json(rows[0]);
    } catch (err: unknown) {
      const message = "Server error";
      console.error("[roster GET]", err);
      return res.status(500).json({ error: message });
    }
  }

  /* ── DELETE ──────────────────────────────────────────────────── */
  if (req.method === "DELETE") {
    const session = await requireTeamAccess(req, res, teamId);
    if (!session) return;
    try {
      const rows = await sql`
        DELETE FROM public.team_roster
        WHERE id = ${rosterId} AND teamid = ${teamId}
        RETURNING id
      `;
      if (!rows?.length) return res.status(404).json({ error: "Roster entry not found." });
      return res.status(200).json({ ok: true });
    } catch (err: unknown) {
      const message = "Server error";
      console.error("[roster DELETE]", err);
      return res.status(500).json({ error: message });
    }
  }

  /* ── PATCH ───────────────────────────────────────────────────── */
  if (req.method === "PATCH") {
    const session = await requireTeamAccess(req, res, teamId);
    if (!session) return;
    try {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};

      // Core-fields edit: sent when the inline row editor saves
      if ("first_name" in body) {
        const firstName = typeof body.first_name === "string" ? body.first_name.trim() : "";
        if (!firstName) return res.status(400).json({ error: "First name is required." });
        const role = body.role === "staff" ? "staff" : body.role === "player" ? "player" : null;
        if (!role) return res.status(400).json({ error: "Role is required." });
        const lastName = typeof body.last_name === "string" ? body.last_name.trim() || null : null;
        const jn = body.jersey_number !== null && body.jersey_number !== ""
          ? parseInt(String(body.jersey_number), 10)
          : null;
        const jersey = Number.isFinite(jn) ? jn : null;

        const rows = (await sql`
          UPDATE public.team_roster
          SET first_name    = ${firstName},
              last_name     = ${lastName},
              role          = ${role},
              jersey_number = ${jersey}
          WHERE id = ${rosterId} AND teamid = ${teamId}
          RETURNING id, teamid, first_name, last_name, role, jersey_number,
                    hat_monogram, walkup_song, walkup_song_itunes_id,
                    walkup_song_start_seconds
        `) as RosterRow[];

        if (!rows?.length) return res.status(404).json({ error: "Roster entry not found." });
        return res.status(200).json(rows[0]);
      }

      // Parent-view-only edit: hat_monogram / walkup_song / walkup_song_itunes_id /
      // walkup_song_start_seconds. Each field is optional and only the ones
      // present in the body are touched.
      //
      // This used to branch through every combination of present fields — one
      // hand-written UPDATE per subset, which is 2^n statements and was already
      // at seven for three fields. The CASE form below says "write this column
      // only if its flag is set", so a new field costs one line instead of
      // doubling the branches. The casts are needed because a bare NULL
      // parameter has no type Postgres can infer inside a CASE.
      const hasHat = "hat_monogram" in body;
      const hasSong = "walkup_song" in body;
      const hasItunesId = "walkup_song_itunes_id" in body;
      const hasStart = "walkup_song_start_seconds" in body;

      if (!hasHat && !hasSong && !hasItunesId && !hasStart) {
        return res.status(400).json({ error: "No updatable fields provided." });
      }

      const hatMonogram =
        typeof body.hat_monogram === "string" ? body.hat_monogram.trim() || null : null;
      const walkupSong =
        typeof body.walkup_song === "string" ? body.walkup_song.trim() || null : null;

      let walkupSongItunesId: number | null = null;
      if (hasItunesId && body.walkup_song_itunes_id != null && body.walkup_song_itunes_id !== "") {
        const n = parseInt(String(body.walkup_song_itunes_id), 10);
        walkupSongItunesId = Number.isFinite(n) ? n : null;
      }

      const startSeconds = parseStartSeconds(hasStart ? body.walkup_song_start_seconds : null);
      if (startSeconds.error) return res.status(400).json({ error: startSeconds.error });

      const updated = (await sql`
        UPDATE public.team_roster
        SET hat_monogram = CASE WHEN ${hasHat} THEN ${hatMonogram}::text ELSE hat_monogram END,
            walkup_song  = CASE WHEN ${hasSong} THEN ${walkupSong}::text ELSE walkup_song END,
            walkup_song_itunes_id =
              CASE WHEN ${hasItunesId} THEN ${walkupSongItunesId}::bigint ELSE walkup_song_itunes_id END,
            walkup_song_start_seconds =
              CASE WHEN ${hasStart} THEN ${startSeconds.value}::integer ELSE walkup_song_start_seconds END
        WHERE id = ${rosterId} AND teamid = ${teamId}
        RETURNING id, teamid, first_name, last_name, role, jersey_number, hat_monogram,
                  walkup_song, walkup_song_itunes_id, walkup_song_start_seconds
      `) as RosterRow[];

      if (!updated || updated.length === 0) {
        return res.status(404).json({ error: "Roster entry not found." });
      }
      return res.status(200).json(updated[0]);
    } catch (err: unknown) {
      const message = "Server error";
      console.error("[roster PATCH]", err);
      return res.status(500).json({ error: message });
    }
  }

  res.setHeader("Allow", "GET, PATCH, DELETE");
  return res.status(405).json({ error: "Method Not Allowed" });
}
