import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/requireSession";
import { isSnapshotStale, type LocationSnapshot } from "@/lib/suggestions/types";
import { fetchLocationSnapshot, parseSuggestionId } from "@/lib/suggestions/server";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end("Method Not Allowed");
  }

  const session = await requireAdmin(req, res);
  if (!session) return;

  const suggestionId = parseSuggestionId(req);
  if (!suggestionId) return res.status(400).json({ error: "Invalid suggestion id" });

  try {
    const rows = await sql`
      SELECT
        s.*,
        to_char(s.submitted_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS submitted_at,
        to_char(s.reviewed_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS reviewed_at,
        to_char(s.ai_analyzed_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS ai_analyzed_at,
        l.name AS live_location_name
      FROM location_suggestions s
      LEFT JOIN locations l ON l.id = s.location_id
      WHERE s.id = ${suggestionId}
    `;
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    const suggestion: any = rows[0];

    // Live state of the target so the client can render then/now/proposed.
    const current = suggestion.location_id
      ? await fetchLocationSnapshot(suggestion.location_id)
      : null;
    const stale =
      suggestion.status === "pending" &&
      suggestion.snapshot != null &&
      current != null &&
      isSnapshotStale(suggestion.snapshot as LocationSnapshot, current);

    return res.status(200).json({
      suggestion: {
        ...suggestion,
        location_name:
          suggestion.live_location_name ??
          suggestion.snapshot?.name ??
          suggestion.payload?.name ??
          null,
      },
      current,
      stale,
    });
  } catch (err: any) {
    console.error("[admin/location-suggestions/detail] error", err);
    return res.status(500).json({ error: "Server error" });
  }
}
