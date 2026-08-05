import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";
import type { BracketStructure } from "@/components/bracket/types";
import { syncTournamentBracketGames } from "@/lib/tournament-bracket-games";

function parseTournamentId(req: NextApiRequest): number | null {
  const raw = Array.isArray(req.query.tournamentid)
    ? req.query.tournamentid[0]
    : (req.query.tournamentid as string | undefined);
  if (raw == null) return null;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : null;
}

function parseBracketId(req: NextApiRequest): number | null {
  const raw = Array.isArray(req.query.bracketId)
    ? req.query.bracketId[0]
    : (req.query.bracketId as string | undefined);
  if (raw == null) return null;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const tournamentId = parseTournamentId(req);
  const bracketId = parseBracketId(req);
  if (!tournamentId) return res.status(400).json({ error: "Invalid tournamentid" });
  if (!bracketId) return res.status(400).json({ error: "Invalid bracketId" });

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
          tb.updated_at
        FROM public.tournament_brackets tb
        LEFT JOIN public.bracket_templates bt ON bt.id = tb.template_id
        WHERE tb.id = ${bracketId} AND tb.tournament_id = ${tournamentId}
      `;
      if (rows.length === 0) return res.status(404).json({ error: "Bracket not found" });

      const assignments = await sql`
        SELECT tba.seed_index, tba.team_id, t.name AS team_name
        FROM public.tournament_bracket_assignments tba
        LEFT JOIN public.teams t ON t.teamid = tba.team_id
        WHERE tba.bracket_id = ${bracketId}
        ORDER BY tba.seed_index ASC
      `;

      return res.status(200).json({
        ...rows[0],
        assignments: assignments.map((a) => ({
          seedIndex: Number(a.seed_index),
          teamId: Number(a.team_id),
          teamName: a.team_name ?? null,
        })),
      });
    }

    if (req.method === "PATCH") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body ?? {};
      const { name, sort_order, template_id, structure } = body;

      const rows = await sql`
        UPDATE public.tournament_brackets SET
          name        = COALESCE(${name?.trim() ?? null}, name),
          sort_order  = COALESCE(${sort_order != null ? Number(sort_order) : null}, sort_order),
          template_id = CASE WHEN ${template_id !== undefined} THEN ${template_id != null ? Number(template_id) : null} ELSE template_id END,
          structure   = CASE WHEN ${structure !== undefined} THEN ${structure != null ? JSON.stringify(structure) : null}::jsonb ELSE structure END,
          updated_at  = now()
        WHERE id = ${bracketId} AND tournament_id = ${tournamentId}
        RETURNING id, tournament_id, name, sort_order, template_id, structure, updated_at
      `;
      if (rows.length === 0) return res.status(404).json({ error: "Bracket not found" });

      // If the structure changed, sync tournamentgames so new bracket games exist
      // (and orphaned unscored rows for the old structure are cleaned up).
      if (structure !== undefined && structure != null) {
        const assignmentRows = (await sql`
          SELECT seed_index, team_id
          FROM public.tournament_bracket_assignments
          WHERE bracket_id = ${bracketId}
        `) as { seed_index: number; team_id: number }[];
        const assignments = assignmentRows.map((r) => ({ seedIndex: r.seed_index, teamId: r.team_id }));
        await syncTournamentBracketGames(
          tournamentId,
          bracketId,
          rows[0].structure as BracketStructure,
          assignments,
        );
      }

      return res.status(200).json(rows[0]);
    }

    if (req.method === "DELETE") {
      await sql`
        DELETE FROM public.tournament_brackets
        WHERE id = ${bracketId} AND tournament_id = ${tournamentId}
      `;
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, PATCH, DELETE");
    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (err: unknown) {
    const message = "Server error";
    console.error("[tournament bracket detail API]", err);
    return res.status(500).json({ error: message });
  }
}
