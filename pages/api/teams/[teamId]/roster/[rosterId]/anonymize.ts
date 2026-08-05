import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/requireSession";
import { anonymizePlayer } from "@/lib/roster/anonymizePlayer";

// COPPA player-data deletion. Anonymizes a player's PII in place (see
// lib/roster/anonymizePlayer.ts) rather than deleting the row, so game history
// keyed by roster_id survives. Admin-only for now; the reusable core is built
// so a future parent-driven flow can call it with a different auth gate.

function parseId(val: string | string[] | undefined): number | null {
  const raw = Array.isArray(val) ? val[0] : val;
  if (raw == null) return null;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const session = await requireAdmin(req, res);
  if (!session) return;

  const teamId = parseId(req.query.teamId);
  const rosterId = parseId(req.query.rosterId);
  if (!teamId) return res.status(400).json({ error: "Invalid teamId" });
  if (!rosterId) return res.status(400).json({ error: "Invalid rosterId" });

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {};
  const requestedBy =
    typeof body.requestedBy === "string" && body.requestedBy.trim()
      ? body.requestedBy.trim().slice(0, 500)
      : null;
  const reason =
    typeof body.reason === "string" && body.reason.trim()
      ? body.reason.trim().slice(0, 1000)
      : null;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await anonymizePlayer(client, {
      rosterId,
      teamId,
      deletedBy: session.user.id,
      deletedByName: session.user.name ?? session.user.email ?? null,
      requestedBy,
      reason,
    });

    if ("notFound" in result) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Roster entry not found." });
    }
    if ("alreadyDeleted" in result) {
      await client.query("ROLLBACK");
      return res.status(200).json({ ok: true, alreadyDeleted: true });
    }

    await client.query("COMMIT");
    return res.status(200).json({ ok: true, player: result.player });
  } catch (err: unknown) {
    await client.query("ROLLBACK").catch(() => {});
    const message = "Server error";
    console.error("[roster anonymize]", err);
    return res.status(500).json({ error: message });
  } finally {
    client.release();
  }
}
