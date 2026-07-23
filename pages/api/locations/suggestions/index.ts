import type { NextApiRequest, NextApiResponse } from "next";
import { waitUntil } from "@vercel/functions";
import { sql } from "@/lib/db";
import { requireRoleHolder } from "@/lib/auth/requireSession";
import { aiConfigured, analyzeSuggestion } from "@/lib/suggestions/aiAdvisor";
import {
  parsePayload,
  suggestionTypeSchema,
  type LocationSnapshot,
} from "@/lib/suggestions/types";
import { fetchLocationSnapshot } from "@/lib/suggestions/server";

// Crowdsourced suggestions: role-holders propose location/field changes that
// pend until an admin reviews them in /admin/suggestions. Nothing here writes
// to locations/location_fields — approval does that.

const MAX_PENDING_PER_USER = 10;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === "GET") {
      const session = await requireRoleHolder(req, res);
      if (!session) return;

      const rows = await sql`
        SELECT
          s.id, s.suggestion_type, s.location_id, s.payload, s.snapshot,
          s.reason, s.status, s.review_note,
          to_char(s.submitted_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS submitted_at,
          to_char(s.reviewed_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS reviewed_at,
          l.name AS live_location_name
        FROM location_suggestions s
        LEFT JOIN locations l ON l.id = s.location_id
        WHERE s.submitted_by = ${session.user.id}
        ORDER BY s.submitted_at DESC
        LIMIT 50
      `;

      const suggestions = rows.map((r: any) => ({
        ...r,
        // Display name: live row when it still exists, else the snapshot taken
        // at submission, else (for 'new') the proposed name.
        location_name:
          r.live_location_name ?? r.snapshot?.name ?? r.payload?.name ?? null,
      }));
      return res.status(200).json({ suggestions });
    }

    if (req.method === "POST") {
      const session = await requireRoleHolder(req, res);
      if (!session) return;

      const { suggestion_type, location_id, payload, reason } = req.body ?? {};

      const typeResult = suggestionTypeSchema.safeParse(suggestion_type);
      if (!typeResult.success) {
        return res.status(400).json({ error: "Invalid suggestion_type" });
      }
      const type = typeResult.data;

      const parsed = parsePayload(type, payload);
      if (parsed.ok === false) return res.status(400).json({ error: parsed.error });

      // edit/removal target an existing location; 'new' must not.
      let targetId: number | null = null;
      let snapshot: LocationSnapshot | null = null;
      if (type === "edit" || type === "removal") {
        const n = parseInt(String(location_id ?? ""), 10);
        if (!Number.isFinite(n) || n <= 0) {
          return res.status(400).json({ error: "location_id is required" });
        }
        snapshot = await fetchLocationSnapshot(n);
        if (!snapshot) return res.status(404).json({ error: "Location not found" });
        targetId = n;
      }

      if (parsed.type === "edit" && parsed.payload.fields) {
        // Field ops must reference real fields of the target; overwrite the
        // client's display strings with the server's so the admin diff is
        // grounded in what actually existed at submission time.
        const byId = new Map(snapshot!.fields.map((f) => [f.id, f.name]));
        for (const op of parsed.payload.fields.rename ?? []) {
          const liveName = byId.get(op.id);
          if (liveName == null) {
            return res.status(400).json({ error: `Field ${op.id} not found on this location` });
          }
          op.from = liveName;
        }
        for (const op of parsed.payload.fields.remove ?? []) {
          const liveName = byId.get(op.id);
          if (liveName == null) {
            return res.status(400).json({ error: `Field ${op.id} not found on this location` });
          }
          op.name = liveName;
        }
      }

      if (parsed.type === "removal" && parsed.payload.duplicate_of_location_id) {
        if (parsed.payload.duplicate_of_location_id === targetId) {
          return res.status(400).json({ error: "A location cannot duplicate itself" });
        }
        const dup = await sql`
          SELECT 1 FROM locations WHERE id = ${parsed.payload.duplicate_of_location_id}
        `;
        if (!dup.length) {
          return res.status(400).json({ error: "duplicate_of_location_id does not exist" });
        }
      }

      const pendingRows = await sql`
        SELECT COUNT(*)::int AS count FROM location_suggestions
        WHERE submitted_by = ${session.user.id} AND status = 'pending'
      `;
      if ((pendingRows[0]?.count ?? 0) >= MAX_PENDING_PER_USER) {
        return res.status(429).json({
          error: `You already have ${MAX_PENDING_PER_USER} pending suggestions. Please wait for review before submitting more.`,
        });
      }

      const trimmedReason = typeof reason === "string" && reason.trim() ? reason.trim().slice(0, 1000) : null;
      const inserted = await sql`
        INSERT INTO location_suggestions
          (suggestion_type, location_id, payload, snapshot, reason, submitted_by, submitted_by_name)
        VALUES (
          ${type},
          ${targetId},
          ${JSON.stringify(parsed.payload)}::jsonb,
          ${snapshot ? JSON.stringify(snapshot) : null}::jsonb,
          ${trimmedReason},
          ${session.user.id},
          ${session.user.name ?? session.user.email ?? null}
        )
        RETURNING id, suggestion_type, location_id, payload, snapshot, reason, status, ai_status,
          to_char(submitted_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS submitted_at
      `;
      const suggestion = inserted[0];

      // AI advisor runs after the response is sent; a failure there can never
      // block submission. Without a key the queue shows "AI not configured".
      if (aiConfigured()) {
        waitUntil(analyzeSuggestion(suggestion.id));
        return res.status(201).json({ suggestion });
      }
      await sql`
        UPDATE location_suggestions SET ai_status = 'skipped' WHERE id = ${suggestion.id}
      `.catch(() => {});
      return res.status(201).json({ suggestion: { ...suggestion, ai_status: "skipped" } });
    }

    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).end("Method Not Allowed");
  } catch (err: any) {
    console.error("[locations/suggestions] error", err);
    return res.status(500).json({ error: err.message ?? "Server error" });
  }
}
