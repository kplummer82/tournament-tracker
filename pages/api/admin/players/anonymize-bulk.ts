import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";
import { pool } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/requireSession";
import { anonymizePlayer } from "@/lib/roster/anonymizePlayer";

// Bulk COPPA player-data deletion across teams. Loops the reusable
// anonymizePlayer core (lib/roster/anonymizePlayer.ts) over every selected
// (rosterId, teamId) inside ONE transaction, so a parent's "remove my kid
// everywhere" request either applies to all rows or none. A shared request_id
// groups the audit-log rows as a single event. Admin-only, mirroring the
// single-team endpoint at pages/api/teams/[teamId]/roster/[rosterId]/anonymize.

const MAX_TARGETS = 100;

type Target = { rosterId: number; teamId: number };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const session = await requireAdmin(req, res);
  if (!session) return;

  const body =
    typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {};

  const rawTargets = Array.isArray(body.targets) ? body.targets : [];
  const seen = new Set<number>();
  const targets: Target[] = [];
  for (const t of rawTargets) {
    const rosterId = parseInt(String(t?.rosterId), 10);
    const teamId = parseInt(String(t?.teamId), 10);
    if (!Number.isFinite(rosterId) || !Number.isFinite(teamId)) continue;
    if (seen.has(rosterId)) continue; // roster_id is a global PK; dedupe.
    seen.add(rosterId);
    targets.push({ rosterId, teamId });
  }

  if (targets.length === 0) {
    return res.status(400).json({ error: "No valid targets provided." });
  }
  if (targets.length > MAX_TARGETS) {
    return res.status(400).json({ error: `Too many targets (max ${MAX_TARGETS}).` });
  }

  const requestedBy =
    typeof body.requestedBy === "string" && body.requestedBy.trim()
      ? body.requestedBy.trim().slice(0, 500)
      : null;
  const reason =
    typeof body.reason === "string" && body.reason.trim()
      ? body.reason.trim().slice(0, 1000)
      : null;

  const requestId = crypto.randomUUID();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const results: { rosterId: number; teamId: number; status: string }[] = [];
    for (const { rosterId, teamId } of targets) {
      const result = await anonymizePlayer(client, {
        rosterId,
        teamId,
        deletedBy: session.user.id,
        deletedByName: session.user.name ?? session.user.email ?? null,
        requestedBy,
        reason,
        requestId,
      });
      const status =
        "ok" in result
          ? "ok"
          : "alreadyDeleted" in result
            ? "alreadyDeleted"
            : "notFound";
      results.push({ rosterId, teamId, status });
    }

    await client.query("COMMIT");

    const anonymized = results.filter((r) => r.status === "ok").length;
    return res.status(200).json({ ok: true, requestId, anonymized, results });
  } catch (err: unknown) {
    await client.query("ROLLBACK").catch(() => {});
    const message = err instanceof Error ? err.message : "Server error";
    console.error("[players anonymize-bulk]", err);
    return res.status(500).json({ error: message });
  } finally {
    client.release();
  }
}
