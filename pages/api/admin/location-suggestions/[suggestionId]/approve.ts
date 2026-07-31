import type { NextApiRequest, NextApiResponse } from "next";
import { sql, pool } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/requireSession";
import {
  isSnapshotStale,
  newPayloadSchema,
  parsePayload,
  type LocationSnapshot,
  type NewPayload,
} from "@/lib/suggestions/types";
import { fetchLocationSnapshot, parseSuggestionId } from "@/lib/suggestions/server";
import {
  applyEditSuggestion,
  applyNewSuggestion,
  applyRemovalSuggestion,
  resolveEditCoords,
  resolveNewCoords,
  type LocationRow,
} from "@/lib/locations/applySuggestion";

// Approving a suggestion APPLIES it. Conflict checks run first and return
// 409s the admin UI turns into "approve anyway" (force) prompts; the apply
// itself runs in one transaction with the status flip so a failed apply
// leaves the suggestion pending.

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const session = await requireAdmin(req, res);
  if (!session) return;

  const suggestionId = parseSuggestionId(req);
  if (!suggestionId) return res.status(400).json({ error: "Invalid suggestion id" });

  const { note, force } = req.body ?? {};
  const reviewNote = typeof note === "string" && note.trim() ? note.trim().slice(0, 1000) : null;

  try {
    const rows = await sql`
      SELECT id, suggestion_type, location_id, payload, snapshot, status
      FROM location_suggestions WHERE id = ${suggestionId}
    `;
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    const suggestion: any = rows[0];

    if (suggestion.status !== "pending") {
      return res.status(409).json({ code: "not_pending", status: suggestion.status });
    }

    const parsed = parsePayload(suggestion.suggestion_type, suggestion.payload);
    if (parsed.ok === false) {
      // Stored payload no longer passes validation — shouldn't happen; surface
      // it rather than applying garbage.
      return res.status(422).json({ error: `Stored payload is invalid: ${parsed.error}` });
    }

    // The admin may approve a new-location suggestion "with edits": the client
    // sends a full replacement payload that overrides the submitter's proposed
    // values. It flows through the same dedup check, geocoding, and apply as an
    // unedited approval. Edits are only honored for new-location suggestions.
    let newPayload: NewPayload = parsed.type === "new" ? parsed.payload : ({} as NewPayload);
    if (parsed.type === "new" && req.body?.edits != null) {
      const editParsed = newPayloadSchema.safeParse(req.body.edits);
      if (!editParsed.success) {
        const first = editParsed.error.issues[0];
        return res.status(422).json({
          error: `Edited values are invalid: ${first ? `${first.path.join(".") || "payload"}: ${first.message}` : "invalid"}`,
        });
      }
      newPayload = editParsed.data;
    }

    // ---- Conflict checks (before any mutation) ----
    let current: LocationSnapshot | null = null;
    if (parsed.type === "edit" || parsed.type === "removal") {
      if (suggestion.location_id == null) {
        return res.status(409).json({ code: "target_deleted" });
      }
      current = await fetchLocationSnapshot(suggestion.location_id);
      if (!current) return res.status(409).json({ code: "target_deleted" });

      const snapshot = suggestion.snapshot as LocationSnapshot | null;
      if (snapshot && isSnapshotStale(snapshot, current) && !force) {
        return res.status(409).json({ code: "stale", snapshot, current });
      }
    }

    if (parsed.type === "new" && !force) {
      const proposedCity = newPayload.city ?? null;
      const matches = await sql`
        SELECT id, name, city, state
        FROM locations
        WHERE LOWER(name) = LOWER(${newPayload.name})
          AND (city IS NULL OR ${proposedCity}::text IS NULL
               OR LOWER(city) = LOWER(${proposedCity}::text))
        LIMIT 5
      `;
      if (matches.length) {
        return res.status(409).json({ code: "possible_duplicate", matches });
      }
    }

    // ---- Geocoding (network) happens before the transaction ----
    const coords =
      parsed.type === "edit"
        ? await resolveEditCoords(parsed.payload, current!)
        : parsed.type === "new"
          ? await resolveNewCoords(newPayload)
          : null;

    // ---- Apply + status flip, atomically ----
    const client = await pool.connect();
    let location: LocationRow | null = null;
    try {
      await client.query("BEGIN");

      // Re-check pending inside the transaction so two admins can't both apply.
      const flipped = await client.query(
        `UPDATE location_suggestions
         SET status = 'approved', reviewed_by = $2, reviewed_at = NOW(), review_note = $3
         WHERE id = $1 AND status = 'pending'
         RETURNING id`,
        [suggestionId, session.user.id, reviewNote]
      );
      if (!flipped.rows.length) {
        await client.query("ROLLBACK");
        client.release();
        return res.status(409).json({ code: "not_pending" });
      }

      if (parsed.type === "edit") {
        location = await applyEditSuggestion(
          client,
          suggestion.location_id,
          parsed.payload,
          coords!
        );
      } else if (parsed.type === "new") {
        location = await applyNewSuggestion(client, newPayload, coords!);
      } else {
        await applyRemovalSuggestion(client, suggestion.location_id, suggestionId);
      }

      await client.query("COMMIT");
    } catch (err: any) {
      await client.query("ROLLBACK").catch(() => {});
      client.release();
      if (err?.code === "23505") {
        // A field rename collided with an existing field name.
        return res.status(409).json({
          code: "field_name_conflict",
          error: "A field with the proposed name already exists on this location",
        });
      }
      throw err;
    }
    client.release();

    return res.status(200).json({ ok: true, location });
  } catch (err: any) {
    console.error("[admin/location-suggestions/approve] error", err);
    return res.status(500).json({ error: err.message ?? "Server error" });
  }
}
