import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";
import { requireSeasonAccess } from "@/lib/auth/requireSession";

const VALID_SEASON_TYPES = ["spring", "summer", "fall", "winter"];
const VALID_STATUSES = ["draft", "active", "playoffs", "completed", "archived"];

function parseId(req: NextApiRequest): number | null {
  const raw = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  const n = parseInt(String(raw ?? ""), 10);
  return Number.isFinite(n) ? n : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = parseId(req);
  if (!id) return res.status(400).json({ error: "Invalid id" });

  try {
    if (req.method === "GET") {
      const rows = await sql`
        SELECT
          s.id, s.name, s.year, s.season_type, s.status,
          s.maxrundiff, s.forfeit_run_diff, s.advances_to_playoffs,
          s.league_division_id,
          ld.name          AS division_name,
          ld.age_range     AS division_age_range,
          l.id             AS league_id,
          l.name           AS league_name,
          l.abbreviation   AS league_abbreviation,
          l.city           AS league_city,
          l.state          AS league_state,
          gb.id            AS governing_body_id,
          gb.name          AS governing_body_name,
          to_char(s.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
        FROM seasons s
        JOIN league_divisions ld ON ld.id = s.league_division_id
        JOIN leagues l           ON l.id  = ld.league_id
        LEFT JOIN governing_bodies gb ON gb.id = l.governing_body_id
        WHERE s.id = ${id}
      `;
      if (!rows.length) return res.status(404).json({ error: "Not found" });
      return res.status(200).json(rows[0]);
    }

    if (req.method === "PATCH") {
      const session = await requireSeasonAccess(req, res, id);
      if (!session) return;

      const {
        name, year, season_type, status,
        maxrundiff, forfeit_run_diff, advances_to_playoffs,
      } = req.body ?? {};

      if (season_type && !VALID_SEASON_TYPES.includes(season_type)) {
        return res.status(400).json({ error: `season_type must be one of: ${VALID_SEASON_TYPES.join(", ")}` });
      }
      if (status && !VALID_STATUSES.includes(status)) {
        return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(", ")}` });
      }

      const rows = await sql`
        UPDATE seasons SET
          name                = COALESCE(${name?.trim() ?? null}, name),
          year                = COALESCE(${year != null ? Number(year) : null}, year),
          season_type         = COALESCE(${season_type ?? null}, season_type),
          status              = COALESCE(${status ?? null}, status),
          maxrundiff           = CASE WHEN ${maxrundiff !== undefined} THEN ${maxrundiff != null && maxrundiff !== "" ? Number(maxrundiff) : null} ELSE maxrundiff END,
          forfeit_run_diff     = CASE WHEN ${forfeit_run_diff !== undefined} THEN ${forfeit_run_diff != null && forfeit_run_diff !== "" ? Number(forfeit_run_diff) : null} ELSE forfeit_run_diff END,
          advances_to_playoffs = CASE WHEN ${advances_to_playoffs !== undefined} THEN ${advances_to_playoffs != null && advances_to_playoffs !== "" ? Number(advances_to_playoffs) : null} ELSE advances_to_playoffs END
        WHERE id = ${id}
        RETURNING id, league_division_id, name, year, season_type, status,
          maxrundiff, forfeit_run_diff, advances_to_playoffs,
          to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
      `;
      if (!rows.length) return res.status(404).json({ error: "Not found" });
      return res.status(200).json(rows[0]);
    }

    if (req.method === "DELETE") {
      const session = await requireSeasonAccess(req, res, id);
      if (!session) return;

      const rows = await sql`
        DELETE FROM seasons WHERE id = ${id} RETURNING id
      `;
      if (!rows.length) return res.status(404).json({ error: "Not found" });
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", ["GET", "PATCH", "DELETE"]);
    return res.status(405).end("Method Not Allowed");
  } catch (err: any) {
    console.error("[seasons/[id]] error", err);
    return res.status(500).json({ error: err.message ?? "Server error" });
  }
}
