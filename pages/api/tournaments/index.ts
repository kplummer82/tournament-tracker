// pages/api/tournaments/index.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "@/lib/db";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") return getTournaments(req, res);
  if (req.method === "POST") return createTournament(req, res);
  res.setHeader("Allow", ["GET", "POST"]);
  res.status(405).end("Method Not Allowed");
}

// GET /api/tournaments?q=&year=&division=&status=&visibility=&sport=&page=&pageSize=
async function getTournaments(req: NextApiRequest, res: NextApiResponse) {
  const {
    q, year, division, status, visibility, sport,
    page = "1", pageSize = "12",
  } = req.query as Record<string, string>;

  const where: string[] = [];
  const params: any[] = [];
  let i = 1;

  if (q) {
    where.push(`(LOWER(name) LIKE $${i} OR LOWER(city) LIKE $${i} OR LOWER(state) LIKE $${i})`);
    params.push(`%${q.toLowerCase()}%`); i++;
  }
  if (year)       { where.push(`year = $${i}`);         params.push(Number(year)); i++; }
  if (division)   { where.push(`division = $${i}`);     params.push(division); i++; }
  if (status)     { where.push(`status = $${i}`);       params.push(status); i++; }
  if (visibility) { where.push(`visibility = $${i}`);   params.push(visibility); i++; }
  if (sport)      { where.push(`sport = $${i}`);        params.push(sport); i++; }

  const whereSQL = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limit   = Math.max(1, Math.min(100, parseInt(pageSize, 10) || 12));
  const offset  = (pageNum - 1) * limit;

  const countSql = `SELECT COUNT(*)::int AS total FROM public.tournaments_api ${whereSQL}`;
  const rowsSql  = `
    SELECT
      id,
      name,
      maxrundiff,
      city,
      state,
      year::int AS year,
      division,
      sport,
      status,
      visibility,
      to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "createdAt",
      (SELECT COUNT(*)::int FROM public.tournamentteams tt WHERE tt.tournamentid = id) AS team_count,
      (SELECT COUNT(*)::int FROM public.tournamentgames tg WHERE tg.tournamentid = id AND tg.poolorbracket = 'Pool') AS total_games,
      (SELECT COUNT(*)::int FROM public.tournamentgames tg WHERE tg.tournamentid = id AND tg.poolorbracket = 'Pool' AND tg.gamestatusid = 4) AS final_games
    FROM public.tournaments_api
    ${whereSQL}
    ORDER BY created_at DESC NULLS LAST, id DESC
    LIMIT $${i} OFFSET $${i+1}
  `;

  const client = await pool.connect();
  try {
    const [{ rows: c }, { rows }] = await Promise.all([
      client.query(countSql, params),
      client.query(rowsSql, [...params, limit, offset]),
    ]);
    res.status(200).json({ rows, total: c[0]?.total ?? 0 });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message || "Failed to load tournaments" });
  } finally {
    client.release();
  }
}

/* ---------------- helpers for POST ---------------- */

function toIntOrNull(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Prefer a numeric id (inputId). If it's absent, and a name is provided (inputName),
 * resolve the id by case-insensitive match on the given table/nameCol.
 * Returns null if neither id nor name are present.
 */
async function getIdOrResolve(
  client: any,
  inputId: any,
  inputName: any,
  table: string,
  nameCol: string
): Promise<number | null> {
  const asInt = toIntOrNull(inputId);
  if (asInt !== null) return asInt;

  if (typeof inputName === "string" && inputName.trim() !== "") {
    const sql = `SELECT id FROM public.${table} WHERE LOWER(${nameCol}) = LOWER($1) LIMIT 1`;
    const { rows } = await client.query(sql, [inputName.trim()]);
    if (!rows[0]) throw new Error(`No ${table} found for value "${inputName}"`);
    return Number(rows[0].id);
  }

  return null;
}

// POST /api/tournaments
// Accepts either ids or names for sport/status/visibility/division.
// Body example:
// {
//   "name":"Coastal Summer Classic","city":"San Marcos","state":"CA","year":2025,"division": 6, "maxrundiff":7,
//   "sportid": 1,                 // or "sport": "Boys Baseball"
//   "statusid": 1,                // or "status": "Draft"
//   "visibilityid": 2             // or "visibility": "Private"
// }
async function createTournament(req: NextApiRequest, res: NextApiResponse) {
  const body = req.body || {};
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // IDs first; names only as fallback
    // NOTE: Your schema uses:
    //   - divisions table with column "division" (name)
    //   - sport table with column "sportname"
    //   - tournamentstatus table with column "tournamentstatus"
    //   - tournamentvisibility table with column "tournamentvisibility"
    const divisionId = await getIdOrResolve(
      client,
      body.divisionid ?? body.division,   // may send either
      body.divisionname ?? body.division, // allow name fallback if a string was sent
      "divisions",
      "division"
    );

    const sportId = await getIdOrResolve(
      client,
      body.sportid,
      body.sport,
      "sport",
      "sportname"
    );

    const statusId = await getIdOrResolve(
      client,
      body.statusid ?? body.tournamentstatus,
      body.status,
      "tournamentstatus",
      "tournamentstatus"
    );

    const visibilityId = await getIdOrResolve(
      client,
      body.visibilityid ?? body.tournamentvisibility,
      body.visibility,
      "tournamentvisibility",
      "tournamentvisibility"
    );

    // basic requireds
    const name =
      typeof body.name === "string" && body.name.trim() !== "" ? body.name.trim() : null;
    if (!name) throw new Error("Name is required");
    if (divisionId === null) throw new Error("Division (id or name) is required");
    if (sportId === null) throw new Error("Sport (id or name) is required");
    if (statusId === null) throw new Error("Status (id or name) is required");
    if (visibilityId === null) throw new Error("Visibility (id or name) is required");

    const yearVal = toIntOrNull(body.year);

    // Duplicate check: same name + year already exists
    const dupCheck = await client.query(
      `SELECT id FROM public.tournaments_api
       WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) AND year IS NOT DISTINCT FROM $2
       LIMIT 1`,
      [name, yearVal]
    );
    if (dupCheck.rows?.length > 0) {
      const existingId = Number(dupCheck.rows[0].id);
      res.status(409).json({
        error: "A tournament with this name and year already exists.",
        existingId,
      });
      await client.query("ROLLBACK");
      return;
    }

    const advancesPerGroup =
      body.advances_per_group === "" || body.advances_per_group == null
        ? null
        : toIntOrNull(body.advances_per_group);

    const numPoolGroups =
      body.num_pool_groups === "" || body.num_pool_groups == null
        ? null
        : toIntOrNull(body.num_pool_groups);

    const fields = [
      "name",
      "city",
      "state",
      "year",
      "division",              // stores the division ID in your schema
      "maxrundiff",
      "sportid",
      "tournamentstatus",
      "tournamentvisibility",
      "advances_per_group",
      "num_pool_groups",
    ];

    const values = [
      name,
      body.city ?? null,
      body.state ?? null,
      toIntOrNull(body.year),
      divisionId,
      body.maxrundiff === "" || body.maxrundiff == null ? null : toIntOrNull(body.maxrundiff),
      sportId,
      statusId,
      visibilityId,
      advancesPerGroup,
      numPoolGroups,
    ];

    const placeholders = values.map((_, idx) => `$${idx + 1}`).join(",");

    const insertSql = `
      INSERT INTO public.tournaments (${fields.join(",")})
      VALUES (${placeholders})
      RETURNING tournamentid
    `;

    const { rows: inserted } = await client.query(insertSql, values);
    const newId = inserted[0].tournamentid;

    // Shape response to match GET
    const { rows } = await client.query(
      `SELECT
         v.id, v.name, v.maxrundiff, v.city, v.state, v.year::int AS year, v.division,
         v.sport, v.status, v.visibility,
         to_char(v.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "createdAt",
         t.advances_per_group,
         t.num_pool_groups
       FROM public.tournaments_api v
       JOIN public.tournaments t ON t.tournamentid = v.id
       WHERE v.id = $1`,
      [newId]
    );

    await client.query("COMMIT");
    res.status(201).json(rows[0]);
  } catch (e: any) {
    await client.query("ROLLBACK");
    console.error(e);
    res.status(400).json({ error: e.message || "Failed to create tournament" });
  } finally {
    client.release();
  }
}
