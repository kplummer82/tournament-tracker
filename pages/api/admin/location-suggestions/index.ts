import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/requireSession";

const STATUSES = ["pending", "approved", "rejected", "superseded"] as const;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end("Method Not Allowed");
  }

  const session = await requireAdmin(req, res);
  if (!session) return;

  try {
    const raw = Array.isArray(req.query.status) ? req.query.status[0] : req.query.status;
    const status = (STATUSES as readonly string[]).includes(raw ?? "")
      ? (raw as (typeof STATUSES)[number])
      : raw === "all"
        ? "all"
        : "pending";

    const countRows = await sql`
      SELECT status, COUNT(*)::int AS count
      FROM location_suggestions
      GROUP BY status
    `;
    const counts: Record<string, number> = {
      pending: 0,
      approved: 0,
      rejected: 0,
      superseded: 0,
    };
    for (const r of countRows as { status: string; count: number }[]) {
      counts[r.status] = r.count;
    }

    const rows =
      status === "all"
        ? await sql`
            SELECT
              s.id, s.suggestion_type, s.location_id, s.payload, s.snapshot,
              s.reason, s.status, s.submitted_by, s.submitted_by_name,
              s.reviewed_by, s.review_note,
              s.ai_status, s.ai_recommendation, s.ai_confidence, s.ai_rationale,
              s.ai_flags, s.ai_model, s.ai_error,
              to_char(s.submitted_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS submitted_at,
              to_char(s.reviewed_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS reviewed_at,
              to_char(s.ai_analyzed_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS ai_analyzed_at,
              l.name AS live_location_name
            FROM location_suggestions s
            LEFT JOIN locations l ON l.id = s.location_id
            ORDER BY s.submitted_at DESC
            LIMIT 200
          `
        : await sql`
            SELECT
              s.id, s.suggestion_type, s.location_id, s.payload, s.snapshot,
              s.reason, s.status, s.submitted_by, s.submitted_by_name,
              s.reviewed_by, s.review_note,
              s.ai_status, s.ai_recommendation, s.ai_confidence, s.ai_rationale,
              s.ai_flags, s.ai_model, s.ai_error,
              to_char(s.submitted_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS submitted_at,
              to_char(s.reviewed_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS reviewed_at,
              to_char(s.ai_analyzed_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS ai_analyzed_at,
              l.name AS live_location_name
            FROM location_suggestions s
            LEFT JOIN locations l ON l.id = s.location_id
            WHERE s.status = ${status}
            ORDER BY s.submitted_at DESC
            LIMIT 200
          `;

    const suggestions = (rows as any[]).map((r) => ({
      ...r,
      location_name:
        r.live_location_name ?? r.snapshot?.name ?? r.payload?.name ?? null,
    }));

    return res.status(200).json({ suggestions, counts });
  } catch (err: any) {
    console.error("[admin/location-suggestions] error", err);
    return res.status(500).json({ error: "Server error" });
  }
}
