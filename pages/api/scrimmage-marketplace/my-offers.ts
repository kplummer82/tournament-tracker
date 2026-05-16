import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth/requireSession";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = await requireSession(req, res);
  if (!session) return;

  try {
    const isAdmin = session.user.role === "admin";

    let offers;
    if (isAdmin) {
      offers = await sql`
        SELECT
          so.*,
          ot.name AS offer_team_name,
          sl.available_date, sl.time_earliest, sl.time_latest,
          sl.location_name AS listing_location, sl.status AS listing_status,
          sl.will_travel, sl.opponent_scope,
          lt.name AS listing_team_name, lt.league_division_id AS listing_division_id,
          ll.name AS listing_league_name,
          lld.name AS listing_division_name
        FROM scrimmage_offers so
        JOIN scrimmage_listings sl ON sl.id = so.listing_id
        JOIN teams ot ON ot.teamid = so.team_id
        JOIN teams lt ON lt.teamid = sl.team_id
        LEFT JOIN leagues ll ON ll.id = lt.league_id
        LEFT JOIN league_divisions lld ON lld.id = lt.league_division_id
        ORDER BY so.created_at DESC
      `;
    } else {
      offers = await sql`
        SELECT
          so.*,
          ot.name AS offer_team_name,
          sl.available_date, sl.time_earliest, sl.time_latest,
          sl.location_name AS listing_location, sl.status AS listing_status,
          sl.will_travel, sl.opponent_scope,
          lt.name AS listing_team_name, lt.league_division_id AS listing_division_id,
          ll.name AS listing_league_name,
          lld.name AS listing_division_name
        FROM scrimmage_offers so
        JOIN scrimmage_listings sl ON sl.id = so.listing_id
        JOIN teams ot ON ot.teamid = so.team_id
        JOIN teams lt ON lt.teamid = sl.team_id
        LEFT JOIN leagues ll ON ll.id = lt.league_id
        LEFT JOIN league_divisions lld ON lld.id = lt.league_division_id
        WHERE so.team_id IN (
          SELECT scope_id FROM user_roles
          WHERE user_id = ${session.user.id}
            AND role = 'team_manager'
            AND scope_type = 'team'
        )
        ORDER BY so.created_at DESC
      `;
    }

    return res.status(200).json({ offers });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Server error";
    console.error("[my-offers] GET error", err);
    return res.status(500).json({ error: msg });
  }
}
