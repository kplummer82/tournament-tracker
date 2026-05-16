import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";
import { requireSession, requireTeamAccess } from "@/lib/auth/requireSession";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const listingId = parseInt(req.query.listingId as string, 10);
  if (isNaN(listingId)) return res.status(400).json({ error: "Invalid listing ID" });

  /* ── GET — List offers for a listing ─────────────────────────── */
  if (req.method === "GET") {
    try {
      // Look up listing to check ownership
      const listingRows = await sql`
        SELECT team_id FROM scrimmage_listings WHERE id = ${listingId}
      `;
      if (listingRows.length === 0) {
        return res.status(404).json({ error: "Listing not found" });
      }

      const authSession = await requireTeamAccess(req, res, listingRows[0].team_id);
      if (!authSession) return;

      const offers = await sql`
        SELECT
          so.*,
          t.name AS team_name, t.league_id, t.league_division_id,
          l.name AS league_name,
          ld.name AS division_name, ld.age_range AS division_age_range
        FROM scrimmage_offers so
        JOIN teams t ON t.teamid = so.team_id
        LEFT JOIN leagues l ON l.id = t.league_id
        LEFT JOIN league_divisions ld ON ld.id = t.league_division_id
        WHERE so.listing_id = ${listingId}
        ORDER BY so.created_at DESC
      `;

      return res.status(200).json({ offers });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Server error";
      console.error("[marketplace offers] GET error", err);
      return res.status(500).json({ error: msg });
    }
  }

  /* ── POST — Submit an offer ──────────────────────────────────── */
  if (req.method === "POST") {
    const session = await requireSession(req, res);
    if (!session) return;

    const { team_id, proposed_location, proposed_time, message } = req.body ?? {};

    if (!team_id) {
      return res.status(400).json({ error: "team_id is required" });
    }

    const offerTeamId = parseInt(String(team_id), 10);
    if (isNaN(offerTeamId)) return res.status(400).json({ error: "Invalid team_id" });

    // Auth: must manage the offering team
    const authSession = await requireTeamAccess(req, res, offerTeamId);
    if (!authSession) return;

    try {
      // Validate listing exists and is open
      const listingRows = await sql`
        SELECT id, team_id, status, opponent_scope, age_range_min, age_range_max,
               sport_id
        FROM scrimmage_listings
        WHERE id = ${listingId}
      `;
      if (listingRows.length === 0) {
        return res.status(404).json({ error: "Listing not found" });
      }
      const listing = listingRows[0];

      if (listing.status !== "open") {
        return res.status(400).json({ error: "This listing is no longer open" });
      }

      if (listing.team_id === offerTeamId) {
        return res.status(400).json({ error: "Cannot offer on your own listing" });
      }

      // Scope validation: check if offering team matches listing's scope
      if (listing.opponent_scope !== "any") {
        const offerTeamRows = await sql`
          SELECT league_id, league_division_id FROM teams WHERE teamid = ${offerTeamId}
        `;
        const listingTeamRows = await sql`
          SELECT league_id, league_division_id FROM teams WHERE teamid = ${listing.team_id}
        `;
        const offerTeam = offerTeamRows[0];
        const listingTeam = listingTeamRows[0];

        if (listing.opponent_scope === "division") {
          if (!offerTeam?.league_division_id || !listingTeam?.league_division_id ||
              offerTeam.league_division_id !== listingTeam.league_division_id) {
            return res.status(400).json({
              error: "This listing is restricted to teams in the same division",
            });
          }
        } else if (listing.opponent_scope === "league") {
          if (!offerTeam?.league_id || !listingTeam?.league_id ||
              offerTeam.league_id !== listingTeam.league_id) {
            return res.status(400).json({
              error: "This listing is restricted to teams in the same league",
            });
          }
        }
      }

      const rows = await sql`
        INSERT INTO scrimmage_offers (
          listing_id, team_id, offered_by,
          proposed_location, proposed_time, message
        ) VALUES (
          ${listingId}, ${offerTeamId}, ${session.user.id},
          ${proposed_location?.trim() || null},
          ${proposed_time || null},
          ${message?.trim() || null}
        )
        RETURNING id
      `;

      return res.status(201).json({ id: rows[0].id });
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes("unique")) {
        return res.status(409).json({ error: "Your team has already offered on this listing" });
      }
      const msg = err instanceof Error ? err.message : "Server error";
      console.error("[marketplace offers] POST error", err);
      return res.status(500).json({ error: msg });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
