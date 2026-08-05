import type { NextApiRequest, NextApiResponse } from "next";
import { waitUntil } from "@vercel/functions";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/requireSession";
import { parseSuggestionId } from "@/lib/suggestions/server";
import { aiConfigured, analyzeSuggestion } from "@/lib/suggestions/aiAdvisor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const session = await requireAdmin(req, res);
  if (!session) return;

  const suggestionId = parseSuggestionId(req);
  if (!suggestionId) return res.status(400).json({ error: "Invalid suggestion id" });

  if (!aiConfigured()) {
    return res.status(409).json({ error: "AI analysis is not configured (ANTHROPIC_API_KEY missing)" });
  }

  try {
    const rows = await sql`
      UPDATE location_suggestions
      SET ai_status = 'running',
          ai_recommendation = NULL, ai_confidence = NULL, ai_rationale = NULL,
          ai_flags = NULL, ai_analyzed_at = NULL, ai_error = NULL
      WHERE id = ${suggestionId}
      RETURNING id
    `;
    if (!rows.length) return res.status(404).json({ error: "Not found" });

    waitUntil(analyzeSuggestion(suggestionId));
    return res.status(202).json({ ok: true, ai_status: "running" });
  } catch (err: any) {
    console.error("[admin/location-suggestions/reanalyze] error", err);
    return res.status(500).json({ error: "Server error" });
  }
}
