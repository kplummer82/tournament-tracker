import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === "GET") {
      const { governing_body_id, sport } = req.query;

      let rows;
      if (governing_body_id && sport) {
        const gbId = Number(governing_body_id);
        rows = await sql`
          SELECT
            l.id, l.name, l.abbreviation, l.city, l.state,
            l.governing_body_id,
            gb.name AS governing_body_name,
            s.sportname AS sport,
            to_char(l.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
            (SELECT COUNT(*)::int FROM league_divisions ld WHERE ld.league_id = l.id) AS division_count
          FROM leagues l
          LEFT JOIN governing_bodies gb ON gb.id = l.governing_body_id
          LEFT JOIN sport s ON s.id = l.sportid
          WHERE l.governing_body_id = ${gbId} AND s.sportname = ${String(sport)}
          ORDER BY l.name ASC
        `;
      } else if (governing_body_id) {
        const gbId = Number(governing_body_id);
        rows = await sql`
          SELECT
            l.id, l.name, l.abbreviation, l.city, l.state,
            l.governing_body_id,
            gb.name AS governing_body_name,
            s.sportname AS sport,
            to_char(l.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
            (SELECT COUNT(*)::int FROM league_divisions ld WHERE ld.league_id = l.id) AS division_count
          FROM leagues l
          LEFT JOIN governing_bodies gb ON gb.id = l.governing_body_id
          LEFT JOIN sport s ON s.id = l.sportid
          WHERE l.governing_body_id = ${gbId}
          ORDER BY l.name ASC
        `;
      } else if (sport) {
        rows = await sql`
          SELECT
            l.id, l.name, l.abbreviation, l.city, l.state,
            l.governing_body_id,
            gb.name AS governing_body_name,
            s.sportname AS sport,
            to_char(l.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
            (SELECT COUNT(*)::int FROM league_divisions ld WHERE ld.league_id = l.id) AS division_count
          FROM leagues l
          LEFT JOIN governing_bodies gb ON gb.id = l.governing_body_id
          LEFT JOIN sport s ON s.id = l.sportid
          WHERE s.sportname = ${String(sport)}
          ORDER BY l.name ASC
        `;
      } else {
        rows = await sql`
          SELECT
            l.id, l.name, l.abbreviation, l.city, l.state,
            l.governing_body_id,
            gb.name AS governing_body_name,
            s.sportname AS sport,
            to_char(l.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
            (SELECT COUNT(*)::int FROM league_divisions ld WHERE ld.league_id = l.id) AS division_count
          FROM leagues l
          LEFT JOIN governing_bodies gb ON gb.id = l.governing_body_id
          LEFT JOIN sport s ON s.id = l.sportid
          ORDER BY l.name ASC
        `;
      }

      return res.status(200).json({ rows });
    }

    if (req.method === "POST") {
      const { name, abbreviation, city, state, governing_body_id, sportid } = req.body ?? {};
      if (!name?.trim()) {
        return res.status(400).json({ error: "name is required" });
      }
      const gbId = governing_body_id ? Number(governing_body_id) : null;
      const sId = sportid ? Number(sportid) : null;

      const inserted = await sql`
        INSERT INTO leagues (name, abbreviation, city, state, governing_body_id, sportid)
        VALUES (
          ${name.trim()},
          ${abbreviation?.trim() ?? null},
          ${city?.trim() ?? null},
          ${state?.trim() ?? null},
          ${gbId},
          ${sId}
        )
        RETURNING id, name, abbreviation, city, state, governing_body_id, sportid,
          to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
      `;
      return res.status(201).json(inserted[0]);
    }

    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).end("Method Not Allowed");
  } catch (err: any) {
    console.error("[leagues] error", err);
    return res.status(500).json({ error: err.message ?? "Server error" });
  }
}
