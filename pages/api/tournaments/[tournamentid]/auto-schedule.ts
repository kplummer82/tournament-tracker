import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "@/lib/db";
import { requireTournamentAccess } from "@/lib/auth/requireSession";
import {
  generateTournamentSchedule,
  normalizeTournamentScheduleConfig,
  findTravelConflicts,
  type TournamentTeam,
  type TravelContext,
  type ScheduledGameLite,
} from "@/lib/tournament-schedule";
import { ensureTravelTimes, CHANGEOVER_MINUTES } from "@/lib/tournaments/travelTimes";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end("Method Not Allowed");
  }

  const tournamentid = Number(req.query.tournamentid);
  if (!Number.isFinite(tournamentid)) {
    return res.status(400).json({ error: "Invalid tournament id" });
  }

  const session = await requireTournamentAccess(req, res, tournamentid);
  if (!session) return;

  const { config: rawConfig, dry_run = true, games: draftGames } = req.body ?? {};
  if (!rawConfig) return res.status(400).json({ error: "config is required" });
  const config = normalizeTournamentScheduleConfig(rawConfig);

  const client = await pool.connect();
  try {
    // Teams with their pool group.
    const teamRes = await client.query(
      `
      SELECT t.teamid AS id, t.name, tt.pool_group AS pool_group
        FROM tournamentteams tt
        JOIN teams t ON t.teamid = tt.teamid
       WHERE tt.tournamentid = $1
       ORDER BY t.name
      `,
      [tournamentid],
    );
    if (teamRes.rows.length < 2) {
      return res.status(400).json({
        error: "Need at least 2 teams in the tournament to auto-schedule.",
      });
    }

    const teams: TournamentTeam[] = teamRes.rows.map((r) => ({
      id: Number(r.id),
      name: String(r.name),
      poolGroup: r.pool_group != null ? String(r.pool_group) : null,
    }));

    const result = generateTournamentSchedule(config, teams);

    // Travel context (predefined-location drive times), for cross-location warnings.
    const { drivingMinutes, venueLocation } = await ensureTravelTimes(client, tournamentid);
    const travel: TravelContext = {
      venueLocation,
      drivingMinutes,
      changeoverMinutes: CHANGEOVER_MINUTES,
    };
    const teamName = new Map(teams.map((t) => [t.id, t.name]));
    const travelWarnings = (games: ScheduledGameLite[]): string[] =>
      findTravelConflicts(games, config.gameDurationMinutes, travel).map((c) => {
        const fmtM = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
        return `${teamName.get(c.teamId) ?? `Team ${c.teamId}`} on ${c.date}: not enough travel time between venues (needs to arrive by ${fmtM(
          c.needMinutes,
        )} for the ${c.game2Time} game).`;
      });

    // Existing pool-game counts (total + how many already have a score).
    const existing = await client.query(
      `
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE homescore IS NOT NULL OR awayscore IS NOT NULL)::int AS scored
        FROM tournamentgames
       WHERE tournamentid = $1 AND poolorbracket = 'Pool'
      `,
      [tournamentid],
    );
    const existingPoolGameCount = Number(existing.rows[0]?.total ?? 0);
    const existingScoredCount = Number(existing.rows[0]?.scored ?? 0);

    if (dry_run) {
      const tw = travelWarnings(
        result.games.map((g) => ({
          date: g.gamedate,
          time: g.gametime,
          home: g.home,
          away: g.away,
          tournamentVenueId: g.tournament_venue_id,
        })),
      );
      return res.status(200).json({
        ...result,
        warnings: [...result.warnings, ...tw],
        existingPoolGameCount,
        existingScoredCount,
      });
    }

    // Commit (replace-only): refuse if any existing pool game has a score.
    if (existingScoredCount > 0) {
      return res.status(409).json({
        error: "Clear pool-game scores before regenerating the schedule.",
      });
    }

    // Default status = "Scheduled" (fall back to the lowest id if renamed/missing).
    const statusRes = await client.query(
      `SELECT COALESCE(
         (SELECT id FROM gamestatusoptions WHERE gamestatus = 'Scheduled' LIMIT 1),
         (SELECT MIN(id) FROM gamestatusoptions)
       ) AS id`,
    );
    const scheduledStatusId = Number(statusRes.rows[0]?.id);

    // When the workspace passes an explicit draft, commit those games verbatim;
    // otherwise commit the freshly generated set. Only complete games (both teams)
    // are persisted.
    const commitGames: Array<{
      gamedate: string;
      gametime: string;
      home: number;
      away: number;
      tournament_venue_id: number | null;
      field: string;
    }> = Array.isArray(draftGames)
      ? draftGames
          .filter(
            (g: any) =>
              g && g.home != null && g.away != null && g.gamedate && g.gametime,
          )
          .map((g: any) => ({
            gamedate: String(g.gamedate),
            gametime: String(g.gametime),
            home: Number(g.home),
            away: Number(g.away),
            tournament_venue_id:
              g.tournament_venue_id != null ? Number(g.tournament_venue_id) : null,
            field: typeof g.field === "string" ? g.field : "",
          }))
      : result.games;

    await client.query("BEGIN");
    try {
      await client.query(
        `DELETE FROM tournamentgames WHERE tournamentid = $1 AND poolorbracket = 'Pool'`,
        [tournamentid],
      );

      for (const g of commitGames) {
        const time = String(g.gametime).length === 5 ? `${g.gametime}:00` : String(g.gametime);
        await client.query(
          `
          INSERT INTO tournamentgames
            (tournamentid, home, away, gamedate, gametime, poolorbracket,
             gamestatusid, tournament_venue_id, field)
          VALUES ($1, $2, $3, $4::date, $5::time, 'Pool', $6, $7, $8)
          `,
          [
            tournamentid,
            g.home,
            g.away,
            g.gamedate,
            time,
            scheduledStatusId,
            g.tournament_venue_id,
            g.field || null,
          ],
        );
      }

      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }

    const commitTravelWarnings = travelWarnings(
      commitGames.map((g) => ({
        date: g.gamedate,
        time: g.gametime,
        home: g.home,
        away: g.away,
        tournamentVenueId: g.tournament_venue_id,
      })),
    );

    return res.status(200).json({
      ok: true,
      created: commitGames.length,
      warnings: [...result.warnings, ...commitTravelWarnings],
    });
  } catch (err: any) {
    console.error("[tournaments/[tournamentid]/auto-schedule] error", err);
    return res.status(500).json({ error: err?.message ?? "Server error" });
  } finally {
    client.release();
  }
}
