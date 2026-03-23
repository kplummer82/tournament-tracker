import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";
import { requireSeasonAccess } from "@/lib/auth/requireSession";

function parseSeasonId(req: NextApiRequest): number | null {
  const raw = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  const n = parseInt(String(raw ?? ""), 10);
  return Number.isFinite(n) ? n : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const seasonId = parseSeasonId(req);
  if (!seasonId) return res.status(400).json({ error: "Invalid season id" });

  try {
    if (req.method === "GET") {
      const rows = await sql`
        SELECT
          sb.id, sb.name, sb.sort_order, sb.template_id,
          bt.name AS template_name,
          sb.structure,
          to_char(sb.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at,
          (SELECT COUNT(*)::int FROM season_bracket_assignments sba WHERE sba.season_bracket_id = sb.id) AS seed_count
        FROM season_brackets sb
        LEFT JOIN bracket_templates bt ON bt.id = sb.template_id
        WHERE sb.season_id = ${seasonId}
        ORDER BY sb.sort_order ASC, sb.name ASC
      `;
      return res.status(200).json({ brackets: rows });
    }

    if (req.method === "POST") {
      const session = await requireSeasonAccess(req, res, seasonId);
      if (!session) return;

      const { name, sort_order, template_id } = req.body ?? {};
      if (!name?.trim()) return res.status(400).json({ error: "name is required" });

      const tid = template_id != null && template_id !== "" ? Number(template_id) : null;

      // Copy structure from template at creation time so season brackets are
      // fully decoupled from the template (edits/deletes to the template won't affect them).
      let templateStructure: object | null = null;
      if (tid) {
        const tmpl = await sql`
          SELECT structure FROM public.bracket_templates WHERE id = ${tid}
        `;
        if (tmpl.length > 0) templateStructure = (tmpl[0] as { structure: object }).structure ?? null;
      }

      const inserted = await sql`
        INSERT INTO season_brackets (season_id, name, sort_order, template_id, structure)
        VALUES (
          ${seasonId},
          ${name.trim()},
          ${Number(sort_order) || 0},
          ${tid},
          ${templateStructure ? JSON.stringify(templateStructure) : null}::jsonb
        )
        RETURNING id, season_id, name, sort_order, template_id,
          to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
      `;
      return res.status(201).json(inserted[0]);
    }

    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).end("Method Not Allowed");
  } catch (err: any) {
    console.error("[seasons/[id]/brackets] error", err);
    if (err.code === "23505") {
      return res.status(409).json({ error: "A bracket with this name already exists in the season" });
    }
    return res.status(500).json({ error: err.message ?? "Server error" });
  }
}
