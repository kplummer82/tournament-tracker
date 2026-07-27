import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/requireSession";

// Cross-team player search for the COPPA deletion tool. Admin-only: this
// enumerates children by name across every team, so it must never be exposed
// beyond system admins. Returns empty for a blank query (a search tool, not a
// dump of every child on the platform). See pages/api/teams/search.ts for the
// pool/positional-params pattern this mirrors.

function toInt(v: unknown, fallback: number): number {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const session = await requireAdmin(req, res);
  if (!session) return;

  const q = (Array.isArray(req.query.q) ? req.query.q[0] : req.query.q ?? "")
    .toString()
    .trim();
  const includeDeleted =
    req.query.includeDeleted === "1" || req.query.includeDeleted === "true";
  const page = Math.max(1, toInt(req.query.page, 1));
  const pageSize = Math.min(100, toInt(req.query.pageSize, 25));
  const offset = (page - 1) * pageSize;

  // A search tool: no query -> no results (don't scan the whole roster table).
  if (!q) {
    return res.status(200).json({ rows: [], total: 0, page, pageSize });
  }

  const where: string[] = ["r.role = 'player'"];
  const params: unknown[] = [];

  params.push(`%${q}%`);
  const p = `$${params.length}`;
  where.push(
    `((r.first_name || ' ' || COALESCE(r.last_name, '')) ILIKE ${p} OR r.first_name ILIKE ${p} OR r.last_name ILIKE ${p})`
  );

  if (!includeDeleted) where.push("r.deleted_at IS NULL");

  const whereSql = `WHERE ${where.join(" AND ")}`;
  const baseFromJoins = `
    FROM public.team_roster r
    JOIN public.teams t     ON t.teamid = r.teamid
    LEFT JOIN public.divisions d ON d.id = t.division
  `;

  const listSql = `
    SELECT
      r.id            AS roster_id,
      r.teamid        AS team_id,
      t.name          AS team_name,
      d.division      AS division,
      t.season        AS season,
      t.year          AS year,
      r.first_name    AS first_name,
      r.last_name     AS last_name,
      r.jersey_number AS jersey_number,
      to_char(r.deleted_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS deleted_at
    ${baseFromJoins}
    ${whereSql}
    ORDER BY r.last_name NULLS LAST, r.first_name, t.name
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `;
  const countSql = `SELECT COUNT(*)::int AS count ${baseFromJoins} ${whereSql}`;

  const client = await pool.connect();
  try {
    const totalRes = await client.query(countSql, params);
    const rowsRes = await client.query(listSql, [...params, pageSize, offset]);
    return res.status(200).json({
      rows: rowsRes.rows.map((row) => ({
        rosterId: row.roster_id,
        teamId: row.team_id,
        teamName: row.team_name,
        division: row.division,
        season: row.season,
        year: row.year,
        firstName: row.first_name,
        lastName: row.last_name,
        jerseyNumber: row.jersey_number,
        deletedAt: row.deleted_at,
      })),
      total: totalRes.rows[0]?.count ?? 0,
      page,
      pageSize,
    });
  } catch (err) {
    console.error("GET /api/admin/players/search error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  } finally {
    client.release();
  }
}
