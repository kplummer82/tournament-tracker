import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";

function parseIds(req: NextApiRequest) {
  const seasonId = parseInt(String(Array.isArray(req.query.id) ? req.query.id[0] : req.query.id), 10);
  const bracketId = parseInt(String(Array.isArray(req.query.bracketId) ? req.query.bracketId[0] : req.query.bracketId), 10);
  return { seasonId, bracketId };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { seasonId, bracketId } = parseIds(req);
  if (!Number.isFinite(seasonId) || !Number.isFinite(bracketId)) {
    return res.status(400).json({ error: "Invalid season or bracket id" });
  }

  try {
    if (req.method === "GET") {
      const rows = await sql`
        SELECT
          sb.id, sb.season_id, sb.name, sb.sort_order, sb.template_id,
          bt.name AS template_name,
          sb.structure,
          to_char(sb.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
        FROM season_brackets sb
        LEFT JOIN bracket_templates bt ON bt.id = sb.template_id
        WHERE sb.id = ${bracketId} AND sb.season_id = ${seasonId}
      `;
      if (!rows.length) return res.status(404).json({ error: "Not found" });

      const assignments = await sql`
        SELECT sba.seed_index, sba.team_id, t.name AS team_name
        FROM season_bracket_assignments sba
        LEFT JOIN teams t ON t.teamid = sba.team_id
        WHERE sba.season_bracket_id = ${bracketId}
        ORDER BY sba.seed_index ASC
      `;

      return res.status(200).json({
        ...rows[0],
        assignments: assignments.map((a: any) => ({
          seedIndex: Number(a.seed_index),
          teamId: Number(a.team_id),
          teamName: a.team_name ?? null,
        })),
      });
    }

    if (req.method === "PATCH") {
      const { name, sort_order, template_id, structure } = req.body ?? {};

      const rows = await sql`
        UPDATE season_brackets SET
          name       = COALESCE(${name?.trim() ?? null}, name),
          sort_order = COALESCE(${sort_order != null ? Number(sort_order) : null}, sort_order),
          template_id = CASE WHEN ${template_id !== undefined} THEN ${template_id != null && template_id !== "" ? Number(template_id) : null} ELSE template_id END,
          structure  = CASE WHEN ${structure !== undefined} THEN ${structure != null ? JSON.stringify(structure) : null}::jsonb ELSE structure END,
          updated_at = now()
        WHERE id = ${bracketId} AND season_id = ${seasonId}
        RETURNING id, season_id, name, sort_order, template_id,
          to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
      `;
      if (!rows.length) return res.status(404).json({ error: "Not found" });
      return res.status(200).json(rows[0]);
    }

    if (req.method === "DELETE") {
      const rows = await sql`
        DELETE FROM season_brackets
        WHERE id = ${bracketId} AND season_id = ${seasonId}
        RETURNING id
      `;
      if (!rows.length) return res.status(404).json({ error: "Not found" });
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", ["GET", "PATCH", "DELETE"]);
    return res.status(405).end("Method Not Allowed");
  } catch (err: any) {
    console.error("[seasons/[id]/brackets/[bracketId]] error", err);
    return res.status(500).json({ error: err.message ?? "Server error" });
  }
}
