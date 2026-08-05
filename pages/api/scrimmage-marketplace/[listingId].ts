import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";
import { requireSession, requireTeamAccess } from "@/lib/auth/requireSession";
import { getUserRoles, hasTeamAccess } from "@/lib/auth/permissions";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const listingId = parseInt(req.query.listingId as string, 10);
  if (isNaN(listingId)) return res.status(400).json({ error: "Invalid listing ID" });

  /* ── GET — Single listing detail ─────────────────────────────── */
  if (req.method === "GET") {
    const session = await requireSession(req, res);
    if (!session) return;

    try {
      const rows = await sql`
        SELECT
          sl.*,
          t.name AS team_name, t.league_id, t.league_division_id,
          l.name AS league_name, l.abbreviation AS league_abbr,
          ld.name AS division_name, ld.age_range AS division_age_range,
          sp.sportname AS sport_name,
          loc.name AS official_location_name, loc.address AS location_address,
          loc.city AS location_city, loc.state AS location_state,
          COALESCE((
            SELECT json_agg(json_build_object('id', sb.id, 'name', sb.name) ORDER BY sb.id)
            FROM scrimmage_listing_bats slb
            JOIN bats sb ON sb.id = slb.bat_id
            WHERE slb.listing_id = sl.id
          ), '[]'::json) AS bats
        FROM scrimmage_listings sl
        JOIN teams t ON t.teamid = sl.team_id
        LEFT JOIN leagues l ON l.id = t.league_id
        LEFT JOIN league_divisions ld ON ld.id = t.league_division_id
        LEFT JOIN sport sp ON sp.id = sl.sport_id
        LEFT JOIN locations loc ON loc.id = sl.location_id
        WHERE sl.id = ${listingId}
      `;

      if (rows.length === 0) {
        return res.status(404).json({ error: "Listing not found" });
      }

      const listing = rows[0];

      // Check if current user can manage this listing's team
      const isAdmin = session.user.role === "admin";
      const roles = isAdmin ? [] : await getUserRoles(session.user.id);
      const canManage = isAdmin || hasTeamAccess(roles, listing.team_id, listing.league_id, listing.league_division_id);

      // Determine which teams the viewer manages (so an offering manager can
      // see their own offer + the thread to act on counters).
      const managedTeamIds = isAdmin
        ? null // admin sees all
        : roles
            .filter((r) => r.role === "team_manager" && r.scope_type === "team")
            .map((r) => r.scope_id as number);

      let offers: Array<Record<string, unknown>> | undefined = undefined;
      if (canManage) {
        offers = await sql`
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
      } else if (managedTeamIds && managedTeamIds.length > 0) {
        // Offering manager: return only their own team's offers on this listing.
        offers = await sql`
          SELECT
            so.*,
            t.name AS team_name, t.league_id, t.league_division_id,
            l.name AS league_name,
            ld.name AS division_name, ld.age_range AS division_age_range
          FROM scrimmage_offers so
          JOIN teams t ON t.teamid = so.team_id
          LEFT JOIN leagues l ON l.id = t.league_id
          LEFT JOIN league_divisions ld ON ld.id = t.league_division_id
          WHERE so.listing_id = ${listingId} AND so.team_id = ANY(${managedTeamIds}::int[])
          ORDER BY so.created_at DESC
        `;
      }

      // Attach message threads.
      if (offers && offers.length > 0) {
        const offerIds = offers.map((o) => o.id as number);
        const messages = await sql`
          SELECT som.*, t.name AS sender_team_name
          FROM scrimmage_offer_messages som
          JOIN teams t ON t.teamid = som.sender_team_id
          WHERE som.offer_id = ANY(${offerIds}::int[])
          ORDER BY som.created_at ASC
        `;
        const byOffer: Record<number, typeof messages> = {};
        for (const m of messages) {
          (byOffer[m.offer_id as number] ??= [] as typeof messages).push(m);
        }
        offers = offers.map((o) => ({ ...o, messages: byOffer[o.id as number] ?? [] }));
      }

      // Get pending+countered offer count for non-managers too
      const countRows = await sql`
        SELECT COUNT(*) AS cnt FROM scrimmage_offers
        WHERE listing_id = ${listingId} AND status IN ('pending','countered')
      `;

      // If the listing has been filled, surface the linked scrimmage id so the
      // detail page can deep-link both teams' managers to the game record.
      let scrimmageId: number | null = null;
      if (listing.status === "filled") {
        const scrimRows = await sql`
          SELECT id FROM scrimmages WHERE listing_id = ${listingId}
          ORDER BY id DESC LIMIT 1
        `;
        scrimmageId = scrimRows[0]?.id ?? null;
      }

      return res.status(200).json({
        listing: { ...listing, pending_offers: parseInt(countRows[0].cnt, 10), scrimmage_id: scrimmageId },
        offers,
        canManage,
        managedTeamIds: managedTeamIds ?? undefined,
      });
    } catch (err: unknown) {
      const msg = "Server error";
      console.error("[scrimmage-marketplace] GET detail error", err);
      return res.status(500).json({ error: msg });
    }
  }

  /* ── PATCH — Update listing ──────────────────────────────────── */
  if (req.method === "PATCH") {
    try {
      // Look up the listing first
      const listingRows = await sql`
        SELECT team_id, status FROM scrimmage_listings WHERE id = ${listingId}
      `;
      if (listingRows.length === 0) {
        return res.status(404).json({ error: "Listing not found" });
      }
      if (listingRows[0].status !== "open") {
        return res.status(400).json({ error: "Only open listings can be updated" });
      }

      const authSession = await requireTeamAccess(req, res, listingRows[0].team_id);
      if (!authSession) return;

      const {
        will_travel,
        travel_radius_miles,
        location_id,
        location_name,
        location_lat,
        location_lng,
        available_date,
        time_earliest,
        time_latest,
        opponent_scope,
        age_range_min,
        age_range_max,
        notes,
        bats,
      } = req.body ?? {};

      let batIds: number[] | null = null;
      if (bats !== undefined) {
        if (!Array.isArray(bats)) {
          return res.status(400).json({ error: "bats must be an array" });
        }
        batIds = bats.map((b: unknown) => parseInt(String(b), 10)).filter((n) => !isNaN(n));
        if (batIds.length === 0) {
          return res.status(400).json({ error: "At least one bat type is required" });
        }
      }

      // Denormalize lat/lng if location_id changed
      let finalLat = location_lat ?? null;
      let finalLng = location_lng ?? null;
      if (location_id && (!finalLat || !finalLng)) {
        const locRows = await sql`
          SELECT latitude, longitude FROM locations WHERE id = ${location_id}
        `;
        if (locRows[0]) {
          finalLat = locRows[0].latitude;
          finalLng = locRows[0].longitude;
        }
      }

      await sql`
        UPDATE scrimmage_listings SET
          will_travel = COALESCE(${will_travel ?? null}::boolean, will_travel),
          travel_radius_miles = ${will_travel ? (travel_radius_miles ?? null) : null},
          location_id = COALESCE(${location_id ?? null}::int, location_id),
          location_name = COALESCE(${location_name ?? null}, location_name),
          location_lat = COALESCE(${finalLat}::numeric, location_lat),
          location_lng = COALESCE(${finalLng}::numeric, location_lng),
          available_date = COALESCE(${available_date ?? null}::date, available_date),
          time_earliest = COALESCE(${time_earliest ?? null}::time, time_earliest),
          time_latest = COALESCE(${time_latest ?? null}::time, time_latest),
          opponent_scope = COALESCE(${opponent_scope ?? null}, opponent_scope),
          age_range_min = COALESCE(${age_range_min ?? null}::int, age_range_min),
          age_range_max = COALESCE(${age_range_max ?? null}::int, age_range_max),
          notes = COALESCE(${notes ?? null}, notes),
          updated_at = NOW()
        WHERE id = ${listingId}
      `;

      if (batIds) {
        await sql`DELETE FROM scrimmage_listing_bats WHERE listing_id = ${listingId}`;
        await sql`
          INSERT INTO scrimmage_listing_bats (listing_id, bat_id)
          SELECT ${listingId}, sb.id FROM bats sb WHERE sb.id = ANY(${batIds}::int[])
        `;
      }

      return res.status(200).json({ ok: true });
    } catch (err: unknown) {
      const msg = "Server error";
      console.error("[scrimmage-marketplace] PATCH error", err);
      return res.status(500).json({ error: msg });
    }
  }

  /* ── DELETE — Cancel listing ─────────────────────────────────── */
  if (req.method === "DELETE") {
    try {
      const listingRows = await sql`
        SELECT team_id FROM scrimmage_listings WHERE id = ${listingId}
      `;
      if (listingRows.length === 0) {
        return res.status(404).json({ error: "Listing not found" });
      }

      const authSession = await requireTeamAccess(req, res, listingRows[0].team_id);
      if (!authSession) return;

      await sql`
        UPDATE scrimmage_listings SET status = 'cancelled', updated_at = NOW()
        WHERE id = ${listingId}
      `;

      // Withdraw all open (pending or countered) offers
      await sql`
        UPDATE scrimmage_offers SET status = 'withdrawn', responded_at = NOW()
        WHERE listing_id = ${listingId} AND status IN ('pending','countered')
      `;

      return res.status(200).json({ ok: true });
    } catch (err: unknown) {
      const msg = "Server error";
      console.error("[scrimmage-marketplace] DELETE error", err);
      return res.status(500).json({ error: msg });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
