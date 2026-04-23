// pages/api/teams/index.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { neon } from "@neondatabase/serverless";
import { requireSession } from "@/lib/auth/requireSession";
import { assignRole } from "@/lib/auth/permissions";

const sql = neon(process.env.DATABASE_URL!);

const SEASON_ORDER = ["Spring", "Summer", "Fall", "Winter"];

const toInt = (v: any, fallback: number) => {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

// Normalize result shape across driver variations
function normalizeRows<T = any>(res: any): T[] {
  // neon() returns an array of rows
  if (Array.isArray(res)) return res as T[];
  // pg-like shape (for safety if env changes)
  if (res && Array.isArray(res.rows)) return res.rows as T[];
  return [];
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === "GET") {
      const {
        q = "",
        division,
        season,
        year,
        sport,
        mine,
        tab = "all",
        page = "1",
        pageSize = "12",
      } = req.query;

      const _page = Math.max(1, toInt(page, 1));
      const _pageSize = Math.min(100, Math.max(1, toInt(pageSize, 12)));
      const offset = (_page - 1) * _pageSize;

      const whereClauses: string[] = [];
      const params: any[] = [];

      if (mine === "true") {
        const session = await requireSession(req, res);
        if (!session) return;
        const isAdmin = session.user.role === "admin";
        if (isAdmin) {
          params.push(session.user.id);
          whereClauses.push(`(t.created_by = $${params.length} OR t.created_by IS NULL)`);
        } else {
          params.push(session.user.id);
          whereClauses.push(`t.created_by = $${params.length}`);
        }
      }

      if (q) {
        params.push(`%${q}%`);
        whereClauses.push(`t.name ILIKE $${params.length}`);
      }

      if (division) {
        if (!isNaN(Number(division))) {
          params.push(Number(division));
          whereClauses.push(`t.division = $${params.length}`);
        } else {
          params.push(String(division));
          whereClauses.push(`d.division ILIKE $${params.length}`);
        }
      }

      if (season) {
        params.push(season);
        whereClauses.push(`t.season = $${params.length}`);
      }

      if (year) {
        params.push(year);
        whereClauses.push(`t.year = $${params.length}`);
      }

      if (sport) {
        params.push(sport);
        whereClauses.push(`s.sportname = $${params.length}`);
      }

      const whereSQL = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";

      const orderBySQL = `
        ORDER BY
          d.sorting_key NULLS LAST,
          CASE
            ${SEASON_ORDER.map((s, i) => `WHEN t.season = '${s}' THEN ${i}`).join(" ")}
            ELSE 999
          END,
          t.year DESC,
          t.name ASC
      `;

      // --- total
      const totalResult = await sql.query(
        `
        SELECT COUNT(*)::text AS count
        FROM teams t
        LEFT JOIN sport          s  ON s.id  = t.sportid
        LEFT JOIN divisions      d  ON d.id  = t.division
        LEFT JOIN leagues        l  ON l.id  = t.league_id
        LEFT JOIN league_divisions ld ON ld.id = t.league_division_id
        ${whereSQL};
        `,
        params
      );
      const totalRows = normalizeRows<{ count: string }>(totalResult);
      const total = Number(totalRows?.[0]?.count ?? 0);

      // --- page rows
      const pageParams = [...params, _pageSize, offset];
      const pageResult = await sql.query(
        `
        SELECT
          t.teamid          AS id,
          t.name            AS name,
          d.division        AS division_label,
          t.season          AS season,
          t.year            AS year,
          s.sportname       AS sport,
          t.created_at      AS created_at,
          t.league_id       AS league_id,
          l.name            AS league_name,
          t.league_division_id   AS league_division_id,
          ld.name                AS league_division_name
        FROM teams t
        LEFT JOIN sport          s  ON s.id  = t.sportid
        LEFT JOIN divisions      d  ON d.id  = t.division
        LEFT JOIN leagues        l  ON l.id  = t.league_id
        LEFT JOIN league_divisions ld ON ld.id = t.league_division_id
        ${whereSQL}
        ${orderBySQL}
        LIMIT $${pageParams.length - 1} OFFSET $${pageParams.length};
        `,
        pageParams
      );
      const pageRows = normalizeRows(pageResult);

      const rows = pageRows.map((r: any) => ({
        id: r.id,
        name: r.name,
        division: r.division_label ?? undefined,
        season: r.season,
        year: Number(r.year),
        sport: r.sport ?? undefined,
        createdAt: r.created_at ?? new Date().toISOString(),
        league_id: r.league_id ?? null,
        league_name: r.league_name ?? null,
        league_division_id: r.league_division_id ?? null,
        league_division_name: r.league_division_name ?? null,
      }));

      res.status(200).json({ rows, total });
      return;
    }

    if (req.method === "POST") {
      const session = await requireSession(req, res);
      if (!session) return;

      const { name, divisionId, divisionLabel, season, year, sportId, leagueId, leagueDivisionId } = req.body || {};
      const isLeagueTeam = !!leagueId;

      // League team requires leagueDivisionId; independent team requires divisionId or divisionLabel
      if (!name || !season || !year) {
        res.status(400).json({ error: "Missing required fields: name, season, year" });
        return;
      }
      if (isLeagueTeam && !leagueDivisionId) {
        res.status(400).json({ error: "leagueDivisionId is required when leagueId is provided" });
        return;
      }
      if (!isLeagueTeam && !(divisionId || divisionLabel)) {
        res.status(400).json({ error: "divisionId or divisionLabel is required for independent teams" });
        return;
      }

      let divId: number | undefined = divisionId ? Number(divisionId) : undefined;

      if (!isLeagueTeam && !divId && divisionLabel) {
        const look = await sql.query(
          `SELECT id FROM divisions WHERE division ILIKE $1 LIMIT 1;`,
          [String(divisionLabel)]
        );
        const found = normalizeRows<{ id: number }>(look);
        if (!found.length) {
          res.status(400).json({ error: `Division label not found: ${divisionLabel}` });
          return;
        }
        divId = found[0].id;
      }

      // Duplicate check: no two teams may share the same name in the same division-season
      if (isLeagueTeam) {
        const dupeCheck = await sql.query(
          `SELECT teamid FROM teams
           WHERE league_division_id = $1 AND season = $2 AND year = $3 AND LOWER(name) = LOWER($4)
           LIMIT 1;`,
          [Number(leagueDivisionId), season, Number(year), String(name)]
        );
        if (normalizeRows(dupeCheck).length > 0) {
          res.status(409).json({ error: `A team named "${name}" already exists in this division and season.` });
          return;
        }
      } else if (divId != null) {
        const dupeCheck = await sql.query(
          `SELECT teamid FROM teams
           WHERE division = $1 AND season = $2 AND year = $3 AND LOWER(name) = LOWER($4)
           LIMIT 1;`,
          [divId, season, Number(year), String(name)]
        );
        if (normalizeRows(dupeCheck).length > 0) {
          res.status(409).json({ error: `A team named "${name}" already exists in this division and season.` });
          return;
        }
      }

      const insertRes = await sql.query(
        `
        INSERT INTO teams (name, division, season, year, sportid, league_id, league_division_id, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING teamid AS id;
        `,
        [
          name,
          isLeagueTeam ? null : (divId ?? null),
          season,
          year,
          sportId ?? null,
          leagueId ? Number(leagueId) : null,
          leagueDivisionId ? Number(leagueDivisionId) : null,
          session.user.id,
        ]
      );

      const insertedRows = normalizeRows<{ id: number }>(insertRes);
      const newTeamId = insertedRows[0].id;

      // Auto-assign team_manager to creator for unaffiliated teams
      if (!isLeagueTeam) {
        await assignRole(session.user.id, "team_manager", "team", newTeamId, "system");
      }

      // Auto-follow the newly created team
      await sql.query(
        `INSERT INTO user_follows (user_id, entity_type, entity_id) VALUES ($1, 'team', $2) ON CONFLICT DO NOTHING`,
        [session.user.id, newTeamId]
      );

      res.status(201).json({ id: newTeamId });
      return;
    }

    res.setHeader("Allow", ["GET", "POST"]);
    res.status(405).end("Method Not Allowed");
  } catch (err) {
    console.error("/api/teams error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
}
