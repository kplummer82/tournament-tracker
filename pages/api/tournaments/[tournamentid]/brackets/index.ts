import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";

const MAX_BRACKETS = 20;

function parseTournamentId(req: NextApiRequest): number | null {
  const raw = Array.isArray(req.query.tournamentid)
    ? req.query.tournamentid[0]
    : (req.query.tournamentid as string | undefined);
  if (raw == null) return null;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const tournamentId = parseTournamentId(req);
  if (!tournamentId) return res.status(400).json({ error: "Invalid tournamentid" });

  try {
    if (req.method === "GET") {
      const rows = await sql`
        SELECT
          tb.id,
          tb.tournament_id,
          tb.name,
          tb.sort_order,
          tb.template_id,
          bt.name AS template_name,
          tb.structure,
          tb.updated_at,
          COUNT(tba.seed_index)::int AS seed_count
        FROM public.tournament_brackets tb
        LEFT JOIN public.bracket_templates bt ON bt.id = tb.template_id
        LEFT JOIN public.tournament_bracket_assignments tba ON tba.bracket_id = tb.id
        WHERE tb.tournament_id = ${tournamentId}
        GROUP BY tb.id, bt.name
        ORDER BY tb.sort_order ASC, tb.id ASC
      `;
      return res.status(200).json({ brackets: rows });
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body ?? {};
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name) return res.status(400).json({ error: "name is required" });

      const sortOrder = Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0;

      // Enforce cap
      const countRows = await sql`
        SELECT COUNT(*)::int AS cnt FROM public.tournament_brackets WHERE tournament_id = ${tournamentId}
      `;
      if ((countRows[0]?.cnt ?? 0) >= MAX_BRACKETS) {
        return res.status(400).json({ error: `Maximum of ${MAX_BRACKETS} brackets per tournament.` });
      }

      const inserted = await sql`
        INSERT INTO public.tournament_brackets (tournament_id, name, sort_order)
        VALUES (${tournamentId}, ${name}, ${sortOrder})
        RETURNING id, tournament_id, name, sort_order, template_id, structure, updated_at
      `;
      return res.status(201).json(inserted[0]);
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (err: unknown) {
    const message = "Server error";
    console.error("[tournament brackets API]", err);
    return res.status(500).json({ error: message });
  }
}
