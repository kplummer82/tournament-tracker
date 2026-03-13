// pages/api/teams/search.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "@/lib/db";
const isDev = process.env.NODE_ENV !== "production";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  // Normalize query params (support multiple casings)
  const qp = req.query as Record<string, string | undefined>;

  const q            = qp.q;
  const divisionLbl  = qp.division; // e.g. "9u"
  const season       = qp.season;
  const year         = qp.year;
  const sportLbl     = qp.sport;

  // Preferred: numeric division id (FK to divisions.id)
  const divisionIdRaw =
    (qp.divisionid as string | undefined) ??
    (qp.divisionId as string | undefined) ??
    (qp.division_id as string | undefined);

  const divisionId = divisionIdRaw && !Number.isNaN(Number(divisionIdRaw))
    ? Number(divisionIdRaw)
    : undefined;

  const exclRaw =
    (qp.excludetournamentid as string | undefined) ??
    (qp.excludeTournamentId as string | undefined) ??
    (qp.excludeTournamentid as string | undefined);
  const excludeTournamentId = exclRaw && !Number.isNaN(Number(exclRaw))
    ? Number(exclRaw)
    : undefined;

  const pageNum  = Math.max(1, parseInt(String(qp.page ?? "1"), 10) || 1);
  const sizeNum  = Math.min(50, Math.max(1, parseInt(String(qp.pageSize ?? "12"), 10) || 12));
  const offset   = (pageNum - 1) * sizeNum;

  // Build WHERE with safe params
  const where: string[] = [];
  const params: any[] = [];

  // Text search
  if (q) {
    params.push(`%${q}%`);
    where.push(`t.name ILIKE $${params.length}`);
  }

  // Division filter:
  // 1) Prefer numeric FK: teams.division = <divisionId>
  // 2) Fallback to label: divisions.division = <divisionLbl> (normalized)
  if (divisionId !== undefined) {
    params.push(divisionId);
    where.push(`t.division = $${params.length}`);
  } else if (divisionLbl) {
    // normalize both sides to lower/trim to be forgiving
    params.push(divisionLbl.trim().toLowerCase());
    where.push(`LOWER(TRIM(d.division)) = $${params.length}`);
  }

  // Season
  if (season) {
    params.push(season);
    where.push(`t.season = $${params.length}`);
  }

  // Year
  if (year && !Number.isNaN(Number(year))) {
    params.push(Number(year));
    where.push(`t.year = $${params.length}`);
  }

  // Sport (label via join)
  if (sportLbl) {
    params.push(sportLbl);
    where.push(`s.sportname = $${params.length}`);
  }

  // Exclude teams already added to a tournament
  if (excludeTournamentId !== undefined) {
    params.push(excludeTournamentId);
    where.push(
      `NOT EXISTS (
         SELECT 1
         FROM tournamentteams tt
         WHERE tt.teamid = t.teamid
           AND tt.tournamentid = $${params.length}
       )`
    );
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  // Base FROM / JOINs
  const baseFromJoins = `
    FROM teams t
    LEFT JOIN sport s     ON s.id = t.sportid
    LEFT JOIN divisions d ON d.id = t.division
  `;

  const listSql = `
    SELECT
      t.teamid         AS id,
      t.name,
      d.division       AS division,   -- "9u" label
      t.season,
      t.year,
      s.sportname      AS sport       -- "Baseball"/"Boys Baseball"/etc.
    ${baseFromJoins}
    ${whereSql}
    ORDER BY t.name ASC
    LIMIT $${params.length + 1}
    OFFSET $${params.length + 2}
  `;

  const countSql = `
    SELECT COUNT(*)::int AS count
    ${baseFromJoins}
    ${whereSql}
  `;

  try {
    const client = await pool.connect();
    try {
      const totalRes = await client.query(countSql, params);
      const rowsRes  = await client.query(listSql, [...params, sizeNum, offset]);

      res.status(200).json({
        rows: rowsRes.rows,
        total: totalRes.rows[0]?.count ?? 0,
      });
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error("GET /api/teams/search error:", err);
    if (isDev) {
      return res.status(500).json({
        error: "Internal Server Error",
        code: err.code,
        message: err.message,
        detail: err.detail,
        hint: err.hint,
      });
    }
    res.status(500).json({ error: "Internal Server Error" });
  }
}
