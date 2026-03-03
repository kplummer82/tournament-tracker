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
          id,
          name,
          abbreviation,
          to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
        FROM governing_bodies
        WHERE id = ${id}
      `;
      if (!rows.length) return res.status(404).json({ error: "Not found" });
      const leagues = await sql`
        SELECT id, name, abbreviation, city, state
        FROM leagues
        WHERE governing_body_id = ${id}
        ORDER BY name ASC
      `;
      return res.status(200).json({ ...rows[0], leagues });
    }

    if (req.method === "PATCH") {
      const { name, abbreviation } = req.body ?? {};
      const abbrProvided = "abbreviation" in (req.body ?? {});
      const newAbbr = abbrProvided ? (abbreviation?.trim() || null) : null;
      const rows = await sql`
        UPDATE governing_bodies
        SET
          name         = COALESCE(${name?.trim() ?? null}, name),
          abbreviation = CASE WHEN ${abbrProvided} THEN ${newAbbr} ELSE abbreviation END
        WHERE id = ${id}
        RETURNING id, name, abbreviation,
          to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
      `;
      if (!rows.length) return res.status(404).json({ error: "Not found" });
      return res.status(200).json(rows[0]);
    }

    if (req.method === "DELETE") {
      const rows = await sql`
        DELETE FROM governing_bodies WHERE id = ${id} RETURNING id
      `;
      if (!rows.length) return res.status(404).json({ error: "Not found" });
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", ["GET", "PATCH", "DELETE"]);
    return res.status(405).end("Method Not Allowed");
  } catch (err: any) {
    console.error("[governing-bodies/[id]] error", err);
    return res.status(500).json({ error: err.message ?? "Server error" });
  }
}
