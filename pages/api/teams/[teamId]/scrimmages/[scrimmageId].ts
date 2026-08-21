import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";
import { requireTeamAccess } from "@/lib/auth/requireSession";

const CANCELED_STATUS_ID = 8;

function normalizeTime(t: unknown): string | null {
  if (typeof t !== "string" || !t.trim()) return null;
  return t.trim();
}

/** Coerces a score to a non-negative whole number, or null when blank. */
function parseScore(v: unknown): number | null | "invalid" {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) return "invalid";
  return n;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const teamId = parseInt(req.query.teamId as string, 10);
  const scrimmageId = parseInt(req.query.scrimmageId as string, 10);

  if (isNaN(teamId) || isNaN(scrimmageId)) {
    return res.status(400).json({ error: "Invalid ID" });
  }

  /* ── PATCH ───────────────────────────────────────────────────── */
  if (req.method === "PATCH") {
    // Only a manager/admin of this team may edit its scrimmages (IDOR guard).
    const session = await requireTeamAccess(req, res, teamId);
    if (!session) return;

    const body = req.body ?? {};

    // Only re-validate the opponent when the caller is actually changing it, so
    // a score-only body doesn't have to resend the whole game.
    if ("opponent_team_id" in body || "opponent_name" in body) {
      const hasOpponent =
        (typeof body.opponent_team_id === "number" && !isNaN(body.opponent_team_id)) ||
        (typeof body.opponent_name === "string" && body.opponent_name.trim().length > 0);

      if (!hasOpponent) {
        return res.status(400).json({
          error: "opponent_team_id or opponent_name is required",
        });
      }
    }

    // Build SET clauses only for the fields actually present in the body, so
    // omitted columns keep their current values.
    const sets: ReturnType<typeof sql>[] = [];

    if ("gamedate" in body) sets.push(sql`gamedate = ${body.gamedate ?? null}`);
    if ("gametime" in body) sets.push(sql`gametime = ${normalizeTime(body.gametime)}`);
    if ("opponent_team_id" in body) {
      sets.push(sql`opponent_team_id = ${typeof body.opponent_team_id === "number" ? body.opponent_team_id : null}`);
    }
    if ("opponent_name" in body) {
      sets.push(sql`opponent_name = ${typeof body.opponent_name === "string" ? body.opponent_name.trim() || null : null}`);
    }
    if ("location_id" in body) {
      sets.push(sql`location_id = ${typeof body.location_id === "number" && !isNaN(body.location_id) ? body.location_id : null}`);
    }
    if ("location" in body) {
      sets.push(sql`location = ${typeof body.location === "string" ? body.location.trim() || null : null}`);
    }
    if ("field" in body) {
      sets.push(sql`field = ${typeof body.field === "string" ? body.field.trim() || null : null}`);
    }
    if ("notes" in body) {
      sets.push(sql`notes = ${typeof body.notes === "string" ? body.notes.trim() || null : null}`);
    }

    if ("homescore" in body) {
      const score = parseScore(body.homescore);
      if (score === "invalid") {
        return res.status(400).json({ error: "homescore must be a non-negative whole number" });
      }
      sets.push(sql`homescore = ${score}`);
    }
    if ("awayscore" in body) {
      const score = parseScore(body.awayscore);
      if (score === "invalid") {
        return res.status(400).json({ error: "awayscore must be a non-negative whole number" });
      }
      sets.push(sql`awayscore = ${score}`);
    }

    if ("gamestatusid" in body) {
      const statusId =
        body.gamestatusid != null && body.gamestatusid !== "" ? Number(body.gamestatusid) : null;
      if (statusId !== null && !Number.isInteger(statusId)) {
        return res.status(400).json({ error: "gamestatusid must be an integer" });
      }
      sets.push(sql`gamestatusid = ${statusId}`);

      // Moving off "Canceled" clears the cancellation trail.
      if (statusId !== null && statusId !== CANCELED_STATUS_ID) {
        sets.push(sql`cancellation_note = NULL`);
        sets.push(sql`canceled_by_team_id = NULL`);
        sets.push(sql`canceled_at = NULL`);
      }
    }

    if (!sets.length) return res.status(400).json({ error: "No fields to update" });

    let setClause = sets[0];
    for (let i = 1; i < sets.length; i++) {
      setClause = sql`${setClause}, ${sets[i]}`;
    }

    try {
      const rows = await sql`
        UPDATE scrimmages SET ${setClause}
        WHERE id = ${scrimmageId} AND team_id = ${teamId}
        RETURNING *
      `;
      if (!rows.length) return res.status(404).json({ error: "Scrimmage not found" });
      return res.status(200).json({ scrimmage: rows[0] });
    } catch (err: unknown) {
      const msg = "Server error";
      console.error("[scrimmages/id] PATCH error", err);
      return res.status(500).json({ error: msg });
    }
  }

  /* ── DELETE ──────────────────────────────────────────────────── */
  if (req.method === "DELETE") {
    // Only a manager/admin of this team may delete its scrimmages (IDOR guard).
    const session = await requireTeamAccess(req, res, teamId);
    if (!session) return;

    try {
      const existing = await sql`
        SELECT listing_id FROM scrimmages
        WHERE id = ${scrimmageId} AND team_id = ${teamId}
      `;
      if (!existing.length) return res.status(404).json({ error: "Scrimmage not found" });
      if (existing[0].listing_id != null) {
        return res.status(400).json({
          error: "Marketplace scrimmages can't be deleted. Cancel the game instead.",
        });
      }

      await sql`
        DELETE FROM scrimmages
        WHERE id = ${scrimmageId} AND team_id = ${teamId}
      `;
      return res.status(200).json({ ok: true });
    } catch (err: unknown) {
      const msg = "Server error";
      console.error("[scrimmages/id] DELETE error", err);
      return res.status(500).json({ error: msg });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
