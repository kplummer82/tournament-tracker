import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";
import { POSITIONS, type Priority } from "@/lib/positions";

function parseId(val: string | string[] | undefined): number | null {
  const raw = Array.isArray(val) ? val[0] : val;
  if (raw == null) return null;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : null;
}

export type PositionEntry = { position: string; priority: Priority };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const teamId = parseId(req.query.teamId);
  const rosterId = parseId(req.query.rosterId);
  if (!teamId) return res.status(400).json({ error: "Invalid teamId" });
  if (!rosterId) return res.status(400).json({ error: "Invalid rosterId" });

  // Verify roster entry belongs to this team
  const ownerCheck = await sql`
    SELECT id FROM public.team_roster WHERE id = ${rosterId} AND teamid = ${teamId} LIMIT 1
  `;
  if (!ownerCheck?.length) return res.status(404).json({ error: "Roster entry not found." });

  /* ── GET ────────────────────────────────────────────────────── */
  if (req.method === "GET") {
    try {
      const rows = await sql`
        SELECT position, priority
        FROM public.roster_positions
        WHERE roster_id = ${rosterId}
        ORDER BY position ASC
      `;
      return res.status(200).json({ positions: rows as PositionEntry[] });
    } catch (err) {
      console.error("[positions GET]", err);
      return res.status(500).json({ error: err instanceof Error ? err.message : "Server error" });
    }
  }

  /* ── PUT ────────────────────────────────────────────────────── */
  if (req.method === "PUT") {
    try {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
      const incoming: unknown = body.positions;
      if (!Array.isArray(incoming)) {
        return res.status(400).json({ error: "positions array is required" });
      }

      const valid: PositionEntry[] = [];
      for (const entry of incoming) {
        if (typeof entry.position !== "string") continue;
        if (entry.priority !== "primary" && entry.priority !== "secondary") continue;
        if (!(POSITIONS as readonly string[]).includes(entry.position)) continue;
        valid.push({ position: entry.position, priority: entry.priority });
      }

      // Full replace: delete all, re-insert
      await sql`DELETE FROM public.roster_positions WHERE roster_id = ${rosterId}`;

      for (const { position, priority } of valid) {
        await sql`
          INSERT INTO public.roster_positions (roster_id, position, priority)
          VALUES (${rosterId}, ${position}, ${priority})
        `;
      }

      const rows = await sql`
        SELECT position, priority
        FROM public.roster_positions
        WHERE roster_id = ${rosterId}
        ORDER BY position ASC
      `;
      return res.status(200).json({ positions: rows as PositionEntry[] });
    } catch (err) {
      console.error("[positions PUT]", err);
      return res.status(500).json({ error: err instanceof Error ? err.message : "Server error" });
    }
  }

  res.setHeader("Allow", "GET, PUT");
  return res.status(405).json({ error: "Method Not Allowed" });
}
