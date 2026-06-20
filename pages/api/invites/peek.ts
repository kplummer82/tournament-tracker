import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";
import { resolveEntityName } from "@/lib/scope-names";

/**
 * GET /api/invites/peek?token=<token>
 *
 * Pre-login peek used by the signup page and the /invite/[token] landing page.
 * Returns invite metadata for a valid pending token; 404 for any unknown,
 * already-used, revoked, or expired token. Exposes no secrets beyond the invite
 * itself (which the recipient already holds via the link).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const token = req.query.token;
  if (typeof token !== "string" || token.length === 0) {
    return res.status(404).json({ error: "Invite not found" });
  }

  try {
    const rows = await sql`
      SELECT intent, email, role, scope_type, scope_id, invited_by_name
      FROM invites
      WHERE token = ${token}
        AND status = 'pending'
        AND expires_at > NOW()
    `;
    const invite = rows[0];
    if (!invite) {
      return res.status(404).json({ error: "Invite not found" });
    }

    const scopeLabel =
      (await resolveEntityName(invite.scope_type, invite.scope_id)) ??
      `${invite.scope_type} #${invite.scope_id}`;

    return res.status(200).json({
      intent: invite.intent,
      email: invite.email,
      role: invite.role,
      scope: { type: invite.scope_type, id: invite.scope_id },
      scopeLabel,
      invitedBy: { name: invite.invited_by_name },
    });
  } catch (e) {
    // Treat any lookup failure as "no invite" so the signup page falls through.
    console.error("[invites] peek failed", e);
    return res.status(404).json({ error: "Invite not found" });
  }
}
