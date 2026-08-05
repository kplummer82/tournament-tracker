import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";
import type { BracketStructure } from "@/components/bracket/types";
import { syncTournamentBracketGames, repropagateTournamentWinners } from "@/lib/tournament-bracket-games";

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

  // Verify bracket belongs to this tournament and load its structure for downstream sync
  const bracketCheck = (await sql`
    SELECT id, structure FROM public.tournament_brackets
    WHERE id = ${bracketId} AND tournament_id = ${tournamentId}
  `) as { id: number; structure: BracketStructure | null }[];
  if (bracketCheck.length === 0) return res.status(404).json({ error: "Bracket not found" });
  const bracketStructure = bracketCheck[0].structure;

  try {
    if (req.method === "GET") {
      const rows = await sql`
        SELECT tba.seed_index, tba.team_id, t.name AS team_name
        FROM public.tournament_bracket_assignments tba
        LEFT JOIN public.teams t ON t.teamid = tba.team_id
        WHERE tba.bracket_id = ${bracketId}
        ORDER BY tba.seed_index ASC
      `;
      return res.status(200).json({
        assignments: rows.map((r) => ({
          seedIndex: Number(r.seed_index),
          teamId: Number(r.team_id),
          teamName: r.team_name ?? null,
        })),
      });
    }

    if (req.method === "PUT") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body ?? {};
      const raw = Array.isArray(body.assignments) ? body.assignments : [];

      const assignments = raw
        .filter(
          (a: { seedIndex?: unknown; teamId?: unknown }) =>
            Number.isFinite(Number(a.seedIndex)) &&
            Number.isFinite(Number(a.teamId)) &&
            Number(a.seedIndex) >= 1
        )
        .map((a: { seedIndex?: unknown; teamId?: unknown }) => ({
          seedIndex: Number(a.seedIndex),
          teamId: Number(a.teamId),
        }));

      await sql`DELETE FROM public.tournament_bracket_assignments WHERE bracket_id = ${bracketId}`;
      for (const a of assignments) {
        await sql`
          INSERT INTO public.tournament_bracket_assignments (bracket_id, seed_index, team_id)
          VALUES (${bracketId}, ${a.seedIndex}, ${a.teamId})
        `;
      }

      // Sync tournamentgames rows from the bracket structure, then re-propagate
      // any already-scored winners in case earlier-round seedings changed.
      if (bracketStructure) {
        await syncTournamentBracketGames(tournamentId, bracketId, bracketStructure, assignments);
        await repropagateTournamentWinners(tournamentId, bracketId);
      }

      const rows = await sql`
        SELECT tba.seed_index, tba.team_id, t.name AS team_name
        FROM public.tournament_bracket_assignments tba
        LEFT JOIN public.teams t ON t.teamid = tba.team_id
        WHERE tba.bracket_id = ${bracketId}
        ORDER BY tba.seed_index ASC
      `;
      return res.status(200).json({
        assignments: rows.map((r) => ({
          seedIndex: Number(r.seed_index),
          teamId: Number(r.team_id),
          teamName: r.team_name ?? null,
        })),
      });
    }

    res.setHeader("Allow", "GET, PUT");
    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (err: unknown) {
    const message = "Server error";
    console.error("[tournament bracket assignments API]", err);
    return res.status(500).json({ error: message });
  }
}
