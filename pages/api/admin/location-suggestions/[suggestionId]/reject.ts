import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/requireSession";
import { parseSuggestionId } from "@/lib/suggestions/server";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const session = await requireAdmin(req, res);
  if (!session) return;

  const suggestionId = parseSuggestionId(req);
  if (!suggestionId) return res.status(400).json({ error: "Invalid suggestion id" });

  const { note } = req.body ?? {};
  const reviewNote = typeof note === "string" && note.trim() ? note.trim().slice(0, 1000) : null;

  try {
    const rows = await sql`
      UPDATE location_suggestions
      SET status = 'rejected', reviewed_by = ${session.user.id},
          reviewed_at = NOW(), review_note = ${reviewNote}
      WHERE id = ${suggestionId} AND status = 'pending'
      RETURNING id
    `;
    if (!rows.length) {
      const exists = await sql`SELECT status FROM location_suggestions WHERE id = ${suggestionId}`;
      if (!exists.length) return res.status(404).json({ error: "Not found" });
      return res.status(409).json({ code: "not_pending", status: exists[0].status });
    }
    return res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error("[admin/location-suggestions/reject] error", err);
    return res.status(500).json({ error: err.message ?? "Server error" });
  }
}
