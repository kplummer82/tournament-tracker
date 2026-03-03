import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";

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
          l.id, l.name, l.abbreviation, l.city, l.state,
          l.governing_body_id,
          gb.name        AS governing_body_name,
          gb.abbreviation AS governing_body_abbreviation,
          s.id           AS sportid,
          s.sportname    AS sport,
          to_char(l.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
        FROM leagues l
        LEFT JOIN governing_bodies gb ON gb.id = l.governing_body_id
        LEFT JOIN sport s ON s.id = l.sportid
        WHERE l.id = ${id}
      `;
      if (!rows.length) return res.status(404).json({ error: "Not found" });

      const divisions = await sql`
        SELECT
          ld.id, ld.name, ld.age_range, ld.sort_order,
          (SELECT COUNT(*)::int FROM seasons se WHERE se.league_division_id = ld.id) AS season_count
        FROM league_divisions ld
        WHERE ld.league_id = ${id}
        ORDER BY ld.sort_order ASC, ld.name ASC
      `;

      return res.status(200).json({ ...rows[0], divisions });
    }

    if (req.method === "PATCH") {
      const { name, abbreviation, city, state, governing_body_id, sportid } = req.body ?? {};
      const gbId = governing_body_id !== undefined
        ? (governing_body_id === null || governing_body_id === "" ? null : Number(governing_body_id))
        : undefined;
      const sId = sportid !== undefined
        ? (sportid === null || sportid === "" ? null : Number(sportid))
        : undefined;
      const abbrProvided = "abbreviation" in (req.body ?? {});
      const cityProvided = "city" in (req.body ?? {});
      const stateProvided = "state" in (req.body ?? {});
      const newAbbr = abbrProvided ? (abbreviation?.trim() || null) : null;
      const newCity = cityProvided ? (city?.trim() || null) : null;
      const newState = stateProvided ? (state?.trim() || null) : null;

      const rows = await sql`
        UPDATE leagues
        SET
          name              = COALESCE(${name?.trim() ?? null}, name),
          abbreviation      = CASE WHEN ${abbrProvided} THEN ${newAbbr} ELSE abbreviation END,
          city              = CASE WHEN ${cityProvided} THEN ${newCity} ELSE city END,
          state             = CASE WHEN ${stateProvided} THEN ${newState} ELSE state END,
          governing_body_id = CASE WHEN ${gbId !== undefined} THEN ${gbId ?? null} ELSE governing_body_id END,
          sportid           = CASE WHEN ${sId !== undefined} THEN ${sId ?? null} ELSE sportid END
        WHERE id = ${id}
        RETURNING id, name, abbreviation, city, state, governing_body_id, sportid,
          to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
      `;
      if (!rows.length) return res.status(404).json({ error: "Not found" });
      return res.status(200).json(rows[0]);
    }

    if (req.method === "DELETE") {
      const rows = await sql`
        DELETE FROM leagues WHERE id = ${id} RETURNING id
      `;
      if (!rows.length) return res.status(404).json({ error: "Not found" });
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", ["GET", "PATCH", "DELETE"]);
    return res.status(405).end("Method Not Allowed");
  } catch (err: any) {
    console.error("[leagues/[id]] error", err);
    return res.status(500).json({ error: err.message ?? "Server error" });
  }
}
