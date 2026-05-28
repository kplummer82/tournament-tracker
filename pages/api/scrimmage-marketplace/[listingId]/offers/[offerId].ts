import type { NextApiRequest, NextApiResponse } from "next";
import { sql, pool } from "@/lib/db";
import { requireSession, requireTeamAccess } from "@/lib/auth/requireSession";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const listingId = parseInt(req.query.listingId as string, 10);
  const offerId = parseInt(req.query.offerId as string, 10);
  if (isNaN(listingId) || isNaN(offerId)) {
    return res.status(400).json({ error: "Invalid listing or offer ID" });
  }

  /* ── PATCH — Accept / Decline / Withdraw ─────────────────────── */
  if (req.method === "PATCH") {
    const session = await requireSession(req, res);
    if (!session) return;

    const { status, note } = req.body ?? {};
    if (!status || !["accepted", "declined", "withdrawn"].includes(status)) {
      return res.status(400).json({ error: "status must be accepted, declined, or withdrawn" });
    }
    const noteText = typeof note === "string" ? (note.trim() || null) : null;

    try {
      // Load offer and listing
      const offerRows = await sql`
        SELECT so.*, sl.team_id AS listing_team_id, sl.status AS listing_status,
               sl.available_date, sl.time_earliest, sl.location_name,
               sl.location_id AS listing_location_id
        FROM scrimmage_offers so
        JOIN scrimmage_listings sl ON sl.id = so.listing_id
        WHERE so.id = ${offerId} AND so.listing_id = ${listingId}
      `;

      if (offerRows.length === 0) {
        return res.status(404).json({ error: "Offer not found" });
      }

      const offer = offerRows[0];

      if (!["pending", "countered"].includes(offer.status)) {
        return res.status(400).json({ error: "This offer has already been resolved" });
      }

      // Auth check depends on the action.
      // For accept/decline: whoever is up (not the last actor) responds.
      // For withdraw: the offering team can always withdraw their own offer.
      let actingTeamId: number;
      if (status === "withdrawn") {
        actingTeamId = offer.team_id;
        const authSession = await requireTeamAccess(req, res, offer.team_id);
        if (!authSession) return;
      } else {
        if (offer.last_action_team_id === offer.team_id) {
          actingTeamId = offer.listing_team_id;
        } else if (offer.last_action_team_id === offer.listing_team_id) {
          actingTeamId = offer.team_id;
        } else {
          actingTeamId = offer.listing_team_id;
        }
        const authSession = await requireTeamAccess(req, res, actingTeamId);
        if (!authSession) return;
      }

      if (status === "accepted") {
        // Must be open
        if (offer.listing_status !== "open") {
          return res.status(400).json({ error: "Listing is no longer open" });
        }

        // Use a transaction: accept offer, fill listing, decline others, create scrimmage
        const client = await pool.connect();
        try {
          await client.query("BEGIN");

          // Lock the listing row to prevent races
          const lockRes = await client.query(
            "SELECT id, status FROM scrimmage_listings WHERE id = $1 FOR UPDATE",
            [listingId]
          );
          if (lockRes.rows[0]?.status !== "open") {
            await client.query("ROLLBACK");
            return res.status(400).json({ error: "Listing is no longer open" });
          }

          // Accept this offer
          await client.query(
            `UPDATE scrimmage_offers SET status = 'accepted', responded_at = NOW(), responded_by = $1,
               last_action_team_id = $2
             WHERE id = $3`,
            [session.user.id, actingTeamId, offerId]
          );

          await client.query(
            `INSERT INTO scrimmage_offer_messages
               (offer_id, sender_team_id, sender_user_id, action, note)
             VALUES ($1, $2, $3, 'accepted', $4)`,
            [offerId, actingTeamId, session.user.id, noteText]
          );

          // Fill the listing
          await client.query(
            "UPDATE scrimmage_listings SET status = 'filled', updated_at = NOW() WHERE id = $1",
            [listingId]
          );

          // Decline all other open offers (pending or countered)
          await client.query(
            `UPDATE scrimmage_offers SET status = 'declined', responded_at = NOW(), responded_by = $1
             WHERE listing_id = $2 AND id != $3 AND status IN ('pending','countered')`,
            [session.user.id, listingId, offerId]
          );

          // Create a scrimmage record linking both teams. Prefer the offer's
          // structured proposal (location_id + field) over the listing's,
          // falling back to freeform text when neither is structured.
          const gamedate = offer.available_date;
          const gametime = offer.proposed_time || offer.time_earliest || null;
          const locationId = offer.proposed_location_id ?? offer.listing_location_id ?? null;
          const field = offer.proposed_location_field ?? null;
          const location = offer.proposed_location || offer.location_name || null;

          await client.query(
            `INSERT INTO scrimmages (team_id, gamedate, gametime, opponent_team_id, location, location_id, field, notes, gamestatusid, listing_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
              offer.listing_team_id,
              gamedate,
              gametime,
              offer.team_id,
              location,
              locationId,
              field,
              "Created from scrimmage marketplace",
              1, // Scheduled
              listingId,
            ]
          );

          await client.query("COMMIT");
        } catch (txErr) {
          await client.query("ROLLBACK");
          throw txErr;
        } finally {
          client.release();
        }

        return res.status(200).json({ ok: true, action: "accepted" });
      }

      // Declined or withdrawn — simple update + thread message.
      await sql`
        UPDATE scrimmage_offers
        SET status = ${status}, responded_at = NOW(), responded_by = ${session.user.id},
            last_action_team_id = ${actingTeamId}
        WHERE id = ${offerId}
      `;

      await sql`
        INSERT INTO scrimmage_offer_messages
          (offer_id, sender_team_id, sender_user_id, action, note)
        VALUES (${offerId}, ${actingTeamId}, ${session.user.id}, ${status}, ${noteText})
      `;

      return res.status(200).json({ ok: true, action: status });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Server error";
      console.error("[marketplace offer action] PATCH error", err);
      return res.status(500).json({ error: msg });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
