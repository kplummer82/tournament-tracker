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
    // Get all listings for teams the user manages (or all if admin)
    const isAdmin = session.user.role === "admin";

    let listings;
    if (isAdmin) {
      listings = await sql`
        SELECT
          sl.*,
          t.name AS team_name, t.league_id, t.league_division_id,
          l.name AS league_name,
          ld.name AS division_name, ld.age_range AS division_age_range,
          sp.sportname AS sport_name,
          loc.name AS official_location_name,
          (SELECT COUNT(*) FROM scrimmage_offers so WHERE so.listing_id = sl.id AND so.status = 'pending') AS pending_offers
        FROM scrimmage_listings sl
        JOIN teams t ON t.teamid = sl.team_id
        LEFT JOIN leagues l ON l.id = t.league_id
        LEFT JOIN league_divisions ld ON ld.id = t.league_division_id
        LEFT JOIN sport sp ON sp.id = sl.sport_id
        LEFT JOIN locations loc ON loc.id = sl.location_id
        ORDER BY
          CASE sl.status WHEN 'open' THEN 0 WHEN 'filled' THEN 1 WHEN 'expired' THEN 2 ELSE 3 END,
          sl.available_date DESC
      `;
    } else {
      listings = await sql`
        SELECT
          sl.*,
          t.name AS team_name, t.league_id, t.league_division_id,
          l.name AS league_name,
          ld.name AS division_name, ld.age_range AS division_age_range,
          sp.sportname AS sport_name,
          loc.name AS official_location_name,
          (SELECT COUNT(*) FROM scrimmage_offers so WHERE so.listing_id = sl.id AND so.status = 'pending') AS pending_offers
        FROM scrimmage_listings sl
        JOIN teams t ON t.teamid = sl.team_id
        LEFT JOIN leagues l ON l.id = t.league_id
        LEFT JOIN league_divisions ld ON ld.id = t.league_division_id
        LEFT JOIN sport sp ON sp.id = sl.sport_id
        LEFT JOIN locations loc ON loc.id = sl.location_id
        WHERE sl.team_id IN (
          SELECT scope_id FROM user_roles
          WHERE user_id = ${session.user.id}
            AND role = 'team_manager'
            AND scope_type = 'team'
        )
        ORDER BY
          CASE sl.status WHEN 'open' THEN 0 WHEN 'filled' THEN 1 WHEN 'expired' THEN 2 ELSE 3 END,
          sl.available_date DESC
      `;
    }

    return res.status(200).json({ listings });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Server error";
    console.error("[my-listings] GET error", err);
    return res.status(500).json({ error: msg });
  }
}
