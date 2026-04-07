import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth/requireSession";
import { assignRole } from "@/lib/auth/permissions";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === "GET") {
      const { governing_body_id, sport, mine } = req.query;

      // Resolve mine filter once
      let mineUserId: string | null = null;
      let mineIncludeNull = false;
      if (mine === "true") {
        const session = await requireSession(req, res);
        if (!session) return;
        mineUserId = session.user.id;
        mineIncludeNull = session.user.role === "admin";
      }

      let rows;
      if (governing_body_id && sport) {
        const gbId = Number(governing_body_id);
        if (mineUserId && mineIncludeNull) {
          rows = await sql`
            SELECT
              l.id, l.name, l.abbreviation, l.city, l.state,
              l.governing_body_id,
              gb.name AS governing_body_name,
              l.sportid,
              s.sportname AS sport,
              to_char(l.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
              (SELECT COUNT(*)::int FROM league_divisions ld WHERE ld.league_id = l.id) AS division_count
            FROM leagues l
            LEFT JOIN governing_bodies gb ON gb.id = l.governing_body_id
            LEFT JOIN sport s ON s.id = l.sportid
            WHERE l.governing_body_id = ${gbId} AND s.sportname = ${String(sport)}
              AND (l.created_by = ${mineUserId} OR l.created_by IS NULL)
            ORDER BY l.name ASC
          `;
        } else if (mineUserId) {
          rows = await sql`
            SELECT
              l.id, l.name, l.abbreviation, l.city, l.state,
              l.governing_body_id,
              gb.name AS governing_body_name,
              l.sportid,
              s.sportname AS sport,
              to_char(l.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
              (SELECT COUNT(*)::int FROM league_divisions ld WHERE ld.league_id = l.id) AS division_count
            FROM leagues l
            LEFT JOIN governing_bodies gb ON gb.id = l.governing_body_id
            LEFT JOIN sport s ON s.id = l.sportid
            WHERE l.governing_body_id = ${gbId} AND s.sportname = ${String(sport)}
              AND l.created_by = ${mineUserId}
            ORDER BY l.name ASC
          `;
        } else {
          rows = await sql`
            SELECT
              l.id, l.name, l.abbreviation, l.city, l.state,
              l.governing_body_id,
              gb.name AS governing_body_name,
              l.sportid,
              s.sportname AS sport,
              to_char(l.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
              (SELECT COUNT(*)::int FROM league_divisions ld WHERE ld.league_id = l.id) AS division_count
            FROM leagues l
            LEFT JOIN governing_bodies gb ON gb.id = l.governing_body_id
            LEFT JOIN sport s ON s.id = l.sportid
            WHERE l.governing_body_id = ${gbId} AND s.sportname = ${String(sport)}
            ORDER BY l.name ASC
          `;
        }
      } else if (governing_body_id) {
        const gbId = Number(governing_body_id);
        if (mineUserId && mineIncludeNull) {
          rows = await sql`
            SELECT
              l.id, l.name, l.abbreviation, l.city, l.state,
              l.governing_body_id,
              gb.name AS governing_body_name,
              l.sportid,
              s.sportname AS sport,
              to_char(l.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
              (SELECT COUNT(*)::int FROM league_divisions ld WHERE ld.league_id = l.id) AS division_count
            FROM leagues l
            LEFT JOIN governing_bodies gb ON gb.id = l.governing_body_id
            LEFT JOIN sport s ON s.id = l.sportid
            WHERE l.governing_body_id = ${gbId}
              AND (l.created_by = ${mineUserId} OR l.created_by IS NULL)
            ORDER BY l.name ASC
          `;
        } else if (mineUserId) {
          rows = await sql`
            SELECT
              l.id, l.name, l.abbreviation, l.city, l.state,
              l.governing_body_id,
              gb.name AS governing_body_name,
              l.sportid,
              s.sportname AS sport,
              to_char(l.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
              (SELECT COUNT(*)::int FROM league_divisions ld WHERE ld.league_id = l.id) AS division_count
            FROM leagues l
            LEFT JOIN governing_bodies gb ON gb.id = l.governing_body_id
            LEFT JOIN sport s ON s.id = l.sportid
            WHERE l.governing_body_id = ${gbId}
              AND l.created_by = ${mineUserId}
            ORDER BY l.name ASC
          `;
        } else {
          rows = await sql`
            SELECT
              l.id, l.name, l.abbreviation, l.city, l.state,
              l.governing_body_id,
              gb.name AS governing_body_name,
              l.sportid,
              s.sportname AS sport,
              to_char(l.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
              (SELECT COUNT(*)::int FROM league_divisions ld WHERE ld.league_id = l.id) AS division_count
            FROM leagues l
            LEFT JOIN governing_bodies gb ON gb.id = l.governing_body_id
            LEFT JOIN sport s ON s.id = l.sportid
            WHERE l.governing_body_id = ${gbId}
            ORDER BY l.name ASC
          `;
        }
      } else if (sport) {
        if (mineUserId && mineIncludeNull) {
          rows = await sql`
            SELECT
              l.id, l.name, l.abbreviation, l.city, l.state,
              l.governing_body_id,
              gb.name AS governing_body_name,
              l.sportid,
              s.sportname AS sport,
              to_char(l.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
              (SELECT COUNT(*)::int FROM league_divisions ld WHERE ld.league_id = l.id) AS division_count
            FROM leagues l
            LEFT JOIN governing_bodies gb ON gb.id = l.governing_body_id
            LEFT JOIN sport s ON s.id = l.sportid
            WHERE s.sportname = ${String(sport)}
              AND (l.created_by = ${mineUserId} OR l.created_by IS NULL)
            ORDER BY l.name ASC
          `;
        } else if (mineUserId) {
          rows = await sql`
            SELECT
              l.id, l.name, l.abbreviation, l.city, l.state,
              l.governing_body_id,
              gb.name AS governing_body_name,
              l.sportid,
              s.sportname AS sport,
              to_char(l.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
              (SELECT COUNT(*)::int FROM league_divisions ld WHERE ld.league_id = l.id) AS division_count
            FROM leagues l
            LEFT JOIN governing_bodies gb ON gb.id = l.governing_body_id
            LEFT JOIN sport s ON s.id = l.sportid
            WHERE s.sportname = ${String(sport)}
              AND l.created_by = ${mineUserId}
            ORDER BY l.name ASC
          `;
        } else {
          rows = await sql`
            SELECT
              l.id, l.name, l.abbreviation, l.city, l.state,
              l.governing_body_id,
              gb.name AS governing_body_name,
              l.sportid,
              s.sportname AS sport,
              to_char(l.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
              (SELECT COUNT(*)::int FROM league_divisions ld WHERE ld.league_id = l.id) AS division_count
            FROM leagues l
            LEFT JOIN governing_bodies gb ON gb.id = l.governing_body_id
            LEFT JOIN sport s ON s.id = l.sportid
            WHERE s.sportname = ${String(sport)}
            ORDER BY l.name ASC
          `;
        }
      } else {
        if (mineUserId && mineIncludeNull) {
          rows = await sql`
            SELECT
              l.id, l.name, l.abbreviation, l.city, l.state,
              l.governing_body_id,
              gb.name AS governing_body_name,
              l.sportid,
              s.sportname AS sport,
              to_char(l.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
              (SELECT COUNT(*)::int FROM league_divisions ld WHERE ld.league_id = l.id) AS division_count
            FROM leagues l
            LEFT JOIN governing_bodies gb ON gb.id = l.governing_body_id
            LEFT JOIN sport s ON s.id = l.sportid
            WHERE (l.created_by = ${mineUserId} OR l.created_by IS NULL)
            ORDER BY l.name ASC
          `;
        } else if (mineUserId) {
          rows = await sql`
            SELECT
              l.id, l.name, l.abbreviation, l.city, l.state,
              l.governing_body_id,
              gb.name AS governing_body_name,
              l.sportid,
              s.sportname AS sport,
              to_char(l.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
              (SELECT COUNT(*)::int FROM league_divisions ld WHERE ld.league_id = l.id) AS division_count
            FROM leagues l
            LEFT JOIN governing_bodies gb ON gb.id = l.governing_body_id
            LEFT JOIN sport s ON s.id = l.sportid
            WHERE l.created_by = ${mineUserId}
            ORDER BY l.name ASC
          `;
        } else {
          rows = await sql`
            SELECT
              l.id, l.name, l.abbreviation, l.city, l.state,
              l.governing_body_id,
              gb.name AS governing_body_name,
              l.sportid,
              s.sportname AS sport,
              to_char(l.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
              (SELECT COUNT(*)::int FROM league_divisions ld WHERE ld.league_id = l.id) AS division_count
            FROM leagues l
            LEFT JOIN governing_bodies gb ON gb.id = l.governing_body_id
            LEFT JOIN sport s ON s.id = l.sportid
            ORDER BY l.name ASC
          `;
        }
      }

      return res.status(200).json({ rows });
    }

    if (req.method === "POST") {
      const session = await requireSession(req, res);
      if (!session) return;

      const { name, abbreviation, city, state, governing_body_id, sportid } = req.body ?? {};
      if (!name?.trim()) {
        return res.status(400).json({ error: "name is required" });
      }
      const gbId = governing_body_id ? Number(governing_body_id) : null;
      const sId = sportid ? Number(sportid) : null;

      const inserted = await sql`
        INSERT INTO leagues (name, abbreviation, city, state, governing_body_id, sportid, created_by)
        VALUES (
          ${name.trim()},
          ${abbreviation?.trim() ?? null},
          ${city?.trim() ?? null},
          ${state?.trim() ?? null},
          ${gbId},
          ${sId},
          ${session.user.id}
        )
        RETURNING id, name, abbreviation, city, state, governing_body_id, sportid,
          to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
      `;
      const newLeague = inserted[0];

      // Auto-assign league_admin role to creator
      await assignRole(session.user.id, "league_admin", "league", newLeague.id, "system");

      return res.status(201).json(newLeague);
    }

    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).end("Method Not Allowed");
  } catch (err: any) {
    console.error("[leagues] error", err);
    return res.status(500).json({ error: err.message ?? "Server error" });
  }
}
