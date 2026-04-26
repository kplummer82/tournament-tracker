import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";
import { requireLeagueAccess } from "@/lib/auth/requireSession";

function parseLeagueId(req: NextApiRequest): number | null {
  const raw = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  const n = parseInt(String(raw ?? ""), 10);
  return Number.isFinite(n) ? n : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const leagueId = parseLeagueId(req);
  if (!leagueId) return res.status(400).json({ error: "Invalid league id" });

  try {
    if (req.method === "GET") {
      const rows = await sql`
        SELECT
          lc.id, lc.first_name, lc.last_name, lc.phone,
          to_char(lc.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
          (SELECT COUNT(*)::int FROM team_coaches tc WHERE tc.coach_id = lc.id) AS team_count
        FROM league_coaches lc
        WHERE lc.league_id = ${leagueId}
        ORDER BY lc.last_name ASC, lc.first_name ASC
      `;
      return res.status(200).json({ coaches: rows });
    }

    if (req.method === "POST") {
      const session = await requireLeagueAccess(req, res, leagueId);
      if (!session) return;

      const { first_name, last_name, phone } = req.body ?? {};
      if (!first_name?.trim() || !last_name?.trim()) {
        return res.status(400).json({ error: "first_name and last_name are required" });
      }
      const trimFirst = first_name.trim();
      const trimLast = last_name.trim();
      const trimPhone = phone?.trim() || null;

      // Duplicate check: exact match on first_name, last_name, phone
      const dupes = await sql`
        SELECT id FROM league_coaches
        WHERE league_id = ${leagueId}
          AND LOWER(first_name) = LOWER(${trimFirst})
          AND LOWER(last_name) = LOWER(${trimLast})
          AND (
            (phone IS NULL AND ${trimPhone}::text IS NULL)
            OR LOWER(phone) = LOWER(${trimPhone}::text)
          )
        LIMIT 1
      `;
      if (dupes.length > 0) {
        return res.status(409).json({ error: "A coach with this name and phone number already exists" });
      }

      const inserted = await sql`
        INSERT INTO league_coaches (league_id, first_name, last_name, phone)
        VALUES (
          ${leagueId},
          ${trimFirst},
          ${trimLast},
          ${trimPhone}
        )
        RETURNING id, league_id, first_name, last_name, phone,
          to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
      `;
      return res.status(201).json(inserted[0]);
    }

    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).end("Method Not Allowed");
  } catch (err: any) {
    console.error("[leagues/[id]/coaches] error", err);
    return res.status(500).json({ error: err.message ?? "Server error" });
  }
}
