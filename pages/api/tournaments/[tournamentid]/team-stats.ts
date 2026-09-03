/**
 * Cross-source game history for every team enrolled in a tournament.
 *
 * Always returns all three sources broken out, so the client can let the viewer
 * toggle scrimmages / league / tournament games on and off and recompute the
 * displayed record locally — no refetch per toggle.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";
import { fetchTeamGameAggregates } from "@/lib/teams/gameHistory";
import { ALL_GAME_SOURCES, type GameSource, type SourceAggregate } from "@/lib/teams/gameSources";

export type TournamentTeamStats = {
  teamid: number;
  team: string;
  bySource: Record<GameSource, SourceAggregate>;
};

function emptyAggregate(teamId: number, source: GameSource): SourceAggregate {
  return { team_id: teamId, source, w: 0, l: 0, t: 0, games: 0, runs_scored: 0, runs_against: 0 };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const raw = Array.isArray(req.query.tournamentid) ? req.query.tournamentid[0] : req.query.tournamentid;
  const tournamentId = raw != null ? parseInt(String(raw), 10) : NaN;
  if (!Number.isFinite(tournamentId)) {
    return res.status(400).json({ error: "Invalid tournamentid" });
  }

  try {
    const teamRows = (await sql`
      SELECT tt.teamid, t.name AS team
      FROM tournamentteams tt
      JOIN teams t ON t.teamid = tt.teamid
      WHERE tt.tournamentid = ${tournamentId}
      ORDER BY t.name ASC
    `) as { teamid: number; team: string }[];

    const teamIds = teamRows.map((r) => Number(r.teamid));
    const aggregates = await fetchTeamGameAggregates(teamIds);

    const teams: TournamentTeamStats[] = teamRows.map((r) => {
      const teamid = Number(r.teamid);
      const bySource = {} as Record<GameSource, SourceAggregate>;
      for (const source of ALL_GAME_SOURCES) {
        bySource[source] =
          aggregates.find((a) => a.team_id === teamid && a.source === source) ??
          emptyAggregate(teamid, source);
      }
      return { teamid, team: r.team, bySource };
    });

    return res.status(200).json({ teams });
  } catch (err: unknown) {
    console.error("[tournament team-stats]", err);
    return res.status(500).json({ error: "Server error" });
  }
}
