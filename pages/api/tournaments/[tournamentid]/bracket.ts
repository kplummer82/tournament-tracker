import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";

type BracketRow = {
  tournament_id: number;
  template_id: number | null;
  template_name: string | null;
  structure: Record<string, unknown>;
  updated_at: string | null;
};

type AssignmentRow = {
  seed_index: number;
  team_id: number;
  team_name?: string | null;
};

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
      const bracketRows = (await sql`
        SELECT tb.tournament_id, tb.template_id, bt.name AS template_name, tb.structure, tb.updated_at
        FROM public.tournament_bracket tb
        LEFT JOIN public.bracket_templates bt ON bt.id = tb.template_id
        WHERE tb.tournament_id = ${tournamentId}
      `) as BracketRow[];

      if (bracketRows.length === 0) {
        return res.status(200).json({
          templateId: null,
          templateName: null,
          structure: null,
          assignments: [],
          teams: [],
        });
      }

      const bracket = bracketRows[0];
      const assignmentRows = (await sql`
        SELECT ba.seed_index, ba.team_id, t.name AS team_name
        FROM public.bracket_assignments ba
        LEFT JOIN public.teams t ON t.teamid = ba.team_id
        WHERE ba.tournament_id = ${tournamentId}
        ORDER BY ba.seed_index ASC
      `) as AssignmentRow[];

      const assignments = assignmentRows.map((r) => ({
        seedIndex: r.seed_index,
        teamId: r.team_id,
        teamName: r.team_name ?? null,
      }));

      return res.status(200).json({
        templateId: bracket.template_id,
        templateName: bracket.template_name ?? null,
        structure: bracket.structure,
        assignments,
        updatedAt: bracket.updated_at,
      });
    }

    if (req.method === "PUT") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body ?? {};
      const templateId =
        body.templateId != null ? (Number(body.templateId) || null) : null;
      const structure = body.structure != null && typeof body.structure === "object" ? body.structure : null;
      const rawAssignments = Array.isArray(body.assignments) ? body.assignments : [];

      if (!structure) return res.status(400).json({ error: "structure is required." });

      const assignments = rawAssignments
        .filter(
          (a: { seedIndex?: number; teamId?: number }) =>
            Number.isFinite(Number(a.seedIndex)) &&
            Number.isFinite(Number(a.teamId)) &&
            Number(a.seedIndex) >= 1
        )
        .map((a: { seedIndex?: number; teamId?: number }) => ({
          seedIndex: Number(a.seedIndex),
          teamId: Number(a.teamId),
        }));

      // Upsert tournament_bracket
      await sql`
        INSERT INTO public.tournament_bracket (tournament_id, template_id, structure, updated_at)
        VALUES (${tournamentId}, ${templateId}, ${JSON.stringify(structure)}::jsonb, now())
        ON CONFLICT (tournament_id) DO UPDATE SET
          template_id = EXCLUDED.template_id,
          structure = EXCLUDED.structure,
          updated_at = now()
      `;

      // Replace bracket_assignments
      await sql`DELETE FROM public.bracket_assignments WHERE tournament_id = ${tournamentId}`;
      for (const a of assignments) {
        await sql`
          INSERT INTO public.bracket_assignments (tournament_id, seed_index, team_id)
          VALUES (${tournamentId}, ${a.seedIndex}, ${a.teamId})
        `;
      }

      const bracketRows = (await sql`
        SELECT tb.tournament_id, tb.template_id, bt.name AS template_name, tb.structure, tb.updated_at
        FROM public.tournament_bracket tb
        LEFT JOIN public.bracket_templates bt ON bt.id = tb.template_id
        WHERE tb.tournament_id = ${tournamentId}
      `) as BracketRow[];
      const assignmentRows = (await sql`
        SELECT ba.seed_index, ba.team_id, t.name AS team_name
        FROM public.bracket_assignments ba
        LEFT JOIN public.teams t ON t.teamid = ba.team_id
        WHERE ba.tournament_id = ${tournamentId}
        ORDER BY ba.seed_index ASC
      `) as AssignmentRow[];

      return res.status(200).json({
        templateId: bracketRows[0]?.template_id ?? templateId,
        templateName: bracketRows[0]?.template_name ?? null,
        structure: bracketRows[0]?.structure ?? structure,
        assignments: assignmentRows.map((r) => ({
          seedIndex: r.seed_index,
          teamId: r.team_id,
          teamName: r.team_name ?? null,
        })),
        updatedAt: bracketRows[0]?.updated_at ?? null,
      });
    }

    res.setHeader("Allow", "GET, PUT");
    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("[tournament bracket API]", err);
    return res.status(500).json({ error: message });
  }
}
