// Server-only helpers for location suggestions (imports the db — keep out of
// client bundles; pure shapes/validators live in ./types).
import type { NextApiRequest } from "next";
import { sql } from "@/lib/db";
import { buildSnapshot, type LocationSnapshot } from "./types";

/** Live values of a location in snapshot form, or null when it's gone. */
export async function fetchLocationSnapshot(
  locationId: number
): Promise<LocationSnapshot | null> {
  const rows = await sql`
    SELECT name, address, city, state, zip, latitude, longitude
    FROM locations WHERE id = ${locationId}
  `;
  if (!rows.length) return null;
  const fields = await sql`
    SELECT id, name FROM location_fields WHERE location_id = ${locationId} ORDER BY id ASC
  `;
  return buildSnapshot(rows[0], fields as { id: number; name: string }[]);
}

export function parseSuggestionId(req: NextApiRequest): number | null {
  const raw = Array.isArray(req.query.suggestionId)
    ? req.query.suggestionId[0]
    : req.query.suggestionId;
  const n = parseInt(String(raw ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}
