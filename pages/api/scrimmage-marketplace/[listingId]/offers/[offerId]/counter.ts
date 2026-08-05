import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";
import { requireTeamAccess } from "@/lib/auth/requireSession";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const listingId = parseInt(req.query.listingId as string, 10);
  const offerId = parseInt(req.query.offerId as string, 10);
  if (isNaN(listingId) || isNaN(offerId)) {
    return res.status(400).json({ error: "Invalid listing or offer ID" });
  }

  const {
    proposed_location_id,
    proposed_location,
    proposed_location_field,
    proposed_time,
    note,
  } = req.body ?? {};

  try {
    const rows = await sql`
      SELECT so.*, sl.team_id AS listing_team_id, sl.status AS listing_status,
             sl.will_travel
      FROM scrimmage_offers so
      JOIN scrimmage_listings sl ON sl.id = so.listing_id
      WHERE so.id = ${offerId} AND so.listing_id = ${listingId}
    `;
    if (rows.length === 0) {
      return res.status(404).json({ error: "Offer not found" });
    }
    const offer = rows[0];

    if (!["pending", "countered"].includes(offer.status)) {
      return res.status(400).json({ error: "This offer is no longer open" });
    }
    if (offer.listing_status !== "open") {
      return res.status(400).json({ error: "Listing is no longer open" });
    }

    // The counter must come from whichever side is NOT the last actor.
    const offeringTeamId: number = offer.team_id;
    const listingTeamId: number = offer.listing_team_id;
    const lastActor: number | null = offer.last_action_team_id;

    let counteringTeamId: number;
    if (lastActor === offeringTeamId) {
      counteringTeamId = listingTeamId;
    } else if (lastActor === listingTeamId) {
      counteringTeamId = offeringTeamId;
    } else {
      // Fallback: allow either side; require auth on at least one.
      counteringTeamId = listingTeamId;
    }

    const authSession = await requireTeamAccess(req, res, counteringTeamId);
    if (!authSession) return;

    // Only a travel listing allows proposing a location (mirrors POST offer rule).
    let locId: number | null = null;
    if (offer.will_travel && proposed_location_id != null) {
      const parsed = parseInt(String(proposed_location_id), 10);
      if (isNaN(parsed) || parsed <= 0) {
        return res.status(400).json({ error: "Invalid proposed_location_id" });
      }
      locId = parsed;
    }
    const locName = offer.will_travel
      ? (typeof proposed_location === "string" ? proposed_location.trim() : "") || null
      : null;
    const locField = offer.will_travel
      ? (typeof proposed_location_field === "string" ? proposed_location_field.trim() : "") || null
      : null;
    const propTime = proposed_time || null;
    const noteText = typeof note === "string" ? (note.trim() || null) : null;

    // Update the offer's current proposed terms + status + last actor.
    await sql`
      UPDATE scrimmage_offers SET
        status = 'countered',
        proposed_location_id = ${locId},
        proposed_location = ${locName},
        proposed_location_field = ${locField},
        proposed_time = ${propTime},
        last_action_team_id = ${counteringTeamId}
      WHERE id = ${offerId}
    `;

    // Log the counter as a thread message.
    await sql`
      INSERT INTO scrimmage_offer_messages (
        offer_id, sender_team_id, sender_user_id, action,
        proposed_location_id, proposed_location, proposed_location_field,
        proposed_time, note
      ) VALUES (
        ${offerId}, ${counteringTeamId}, ${authSession.user.id}, 'countered',
        ${locId}, ${locName}, ${locField},
        ${propTime}, ${noteText}
      )
    `;

    return res.status(200).json({ ok: true });
  } catch (err: unknown) {
    const msg = "Server error";
    console.error("[marketplace offer counter] POST error", err);
    return res.status(500).json({ error: msg });
  }
}
