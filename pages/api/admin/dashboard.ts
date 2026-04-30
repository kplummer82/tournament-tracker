import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/requireSession";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const session = await requireAdmin(req, res);
    if (!session) return;

    const [
      usersResult,
      rolesResult,
      leaguesResult,
      seasonsResult,
      tournamentsResult,
      seasonGamesResult,
      seasonGamesTemporalResult,
      tournamentGamesResult,
      coachesResult,
      scenariosResult,
      bracketsResult,
      settingsResult,
    ] = await Promise.all([
      // 1. Users
      sql`SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'active')::int AS active,
        COUNT(*) FILTER (WHERE status = 'inactive')::int AS inactive,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')::int AS recent_signups
      FROM user_profiles`,

      // 2. Roles by type
      sql`SELECT role, COUNT(*)::int AS count FROM user_roles GROUP BY role`,

      // 3. Leagues + divisions
      sql`SELECT
        (SELECT COUNT(*)::int FROM leagues) AS leagues,
        (SELECT COUNT(*)::int FROM league_divisions) AS divisions`,

      // 4. Seasons by status
      sql`SELECT COALESCE(status, 'draft') AS status, COUNT(*)::int AS count FROM seasons GROUP BY status`,

      // 5. Tournaments by status
      sql`SELECT ts.tournamentstatus AS status, COUNT(*)::int AS count
        FROM tournaments t
        JOIN tournamentstatus ts ON ts.id = t.tournamentstatus
        GROUP BY ts.tournamentstatus`,

      // 6. Season games by status
      sql`SELECT gso.gamestatus AS status, COUNT(*)::int AS count
        FROM season_games sg
        JOIN gamestatusoptions gso ON gso.id = sg.gamestatusid
        GROUP BY gso.gamestatus`,

      // 7. Season games temporal
      sql`SELECT
        COUNT(*) FILTER (WHERE gamedate = CURRENT_DATE)::int AS today,
        COUNT(*) FILTER (WHERE gamedate >= date_trunc('week', CURRENT_DATE)
          AND gamedate < date_trunc('week', CURRENT_DATE) + INTERVAL '7 days')::int AS this_week,
        COUNT(*) FILTER (WHERE gamedate < CURRENT_DATE AND gamestatusid = 1)::int AS overdue
      FROM season_games`,

      // 8. Tournament games by status
      sql`SELECT gso.gamestatus AS status, COUNT(*)::int AS count
        FROM tournamentgames tg
        JOIN gamestatusoptions gso ON gso.id = tg.gamestatusid
        GROUP BY gso.gamestatus`,

      // 9. Coaches
      sql`SELECT
        (SELECT COUNT(*)::int FROM league_coaches) AS total,
        (SELECT COUNT(*)::int FROM league_coaches lc
         WHERE NOT EXISTS (SELECT 1 FROM team_coaches tc WHERE tc.coach_id = lc.id)) AS unassigned`,

      // 10. Scenarios
      sql`SELECT status, COUNT(*)::int AS count FROM scenario_questions GROUP BY status`,

      // 11. Bracket templates
      sql`SELECT
        COUNT(*) FILTER (WHERE is_library = true)::int AS library,
        COUNT(*) FILTER (WHERE is_library = false OR is_library IS NULL)::int AS custom
      FROM bracket_templates`,

      // 12. Settings
      sql`SELECT key, value FROM app_settings WHERE key IN ('max_simulations', 'require_user_approval')`,
    ]);

    // Parse users
    const usersRow = usersResult[0] || { total: 0, active: 0, inactive: 0, recent_signups: 0 };

    // Parse roles into a map
    const rolesByType: Record<string, number> = {};
    let rolesTotal = 0;
    for (const row of rolesResult) {
      rolesByType[row.role] = row.count;
      rolesTotal += row.count;
    }

    // Parse leagues
    const leaguesRow = leaguesResult[0] || { leagues: 0, divisions: 0 };

    // Parse seasons by status
    const seasonsByStatus: Record<string, number> = {};
    let seasonsTotal = 0;
    for (const row of seasonsResult) {
      seasonsByStatus[row.status] = row.count;
      seasonsTotal += row.count;
    }

    // Parse tournaments by status
    const tournamentsByStatus: Record<string, number> = {};
    let tournamentsTotal = 0;
    for (const row of tournamentsResult) {
      tournamentsByStatus[row.status] = row.count;
      tournamentsTotal += row.count;
    }

    // Parse season games
    const seasonGamesByStatus: Record<string, number> = {};
    let seasonGamesTotal = 0;
    for (const row of seasonGamesResult) {
      seasonGamesByStatus[row.status] = row.count;
      seasonGamesTotal += row.count;
    }
    const temporal = seasonGamesTemporalResult[0] || { today: 0, this_week: 0, overdue: 0 };

    // Parse tournament games
    const tournamentGamesByStatus: Record<string, number> = {};
    let tournamentGamesTotal = 0;
    for (const row of tournamentGamesResult) {
      tournamentGamesByStatus[row.status] = row.count;
      tournamentGamesTotal += row.count;
    }

    // Parse coaches
    const coachesRow = coachesResult[0] || { total: 0, unassigned: 0 };

    // Parse scenarios
    const scenariosByStatus: Record<string, number> = {};
    let scenariosTotal = 0;
    for (const row of scenariosResult) {
      scenariosByStatus[row.status] = row.count;
      scenariosTotal += row.count;
    }

    // Parse brackets
    const bracketsRow = bracketsResult[0] || { library: 0, custom: 0 };

    // Parse settings
    let maxSimulations = 10000;
    let requireApproval = false;
    for (const row of settingsResult) {
      if (row.key === "max_simulations") maxSimulations = parseInt(row.value, 10) || 10000;
      if (row.key === "require_user_approval") requireApproval = row.value === "true";
    }

    return res.status(200).json({
      users: {
        total: usersRow.total,
        active: usersRow.active,
        inactive: usersRow.inactive,
        admins: 0, // admin count not easily available without neon auth introspection
        recentSignups: usersRow.recent_signups,
      },
      roles: {
        total: rolesTotal,
        byRole: rolesByType,
      },
      leagues: {
        total: leaguesRow.leagues,
        divisions: leaguesRow.divisions,
      },
      seasons: {
        total: seasonsTotal,
        byStatus: seasonsByStatus,
      },
      tournaments: {
        total: tournamentsTotal,
        byStatus: tournamentsByStatus,
      },
      games: {
        season: {
          total: seasonGamesTotal,
          byStatus: seasonGamesByStatus,
          today: temporal.today,
          thisWeek: temporal.this_week,
          overdue: temporal.overdue,
        },
        tournament: {
          total: tournamentGamesTotal,
          byStatus: tournamentGamesByStatus,
        },
      },
      coaches: {
        total: coachesRow.total,
        unassigned: coachesRow.unassigned,
      },
      scenarios: {
        total: scenariosTotal,
        byStatus: scenariosByStatus,
      },
      brackets: {
        library: bracketsRow.library,
        custom: bracketsRow.custom,
      },
      settings: {
        maxSimulations,
        requireApproval,
      },
    });
  } catch (err: unknown) {
    console.error("[admin dashboard]", err);
    const message = err instanceof Error ? err.message : "Server error";
    return res.status(500).json({ error: message });
  }
}
