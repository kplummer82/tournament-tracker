import type { NextApiRequest, NextApiResponse } from "next";
import { requireSession } from "@/lib/auth/requireSession";
import { sql } from "@/lib/db";
import { type ScopeType } from "@/lib/auth/permissions";
import { scopeRedirectPath, grantInvite, type GrantableInvite } from "@/lib/invites";

/**
 * POST /api/invites/accept  — Body: { token }
 *
 * The accepting account's email must match the invited email (case-insensitive).
 * Grants the invite's role to the current user and marks the invite accepted.
 * Works for both the new-user path (auto-logged-in after signup) and the
 * existing-user path (already logged in).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const session = await requireSession(req, res);
  if (!session) return;

  const { token } = req.body ?? {};
  if (!token || typeof token !== "string") {
    return res.status(400).json({ error: "token is required" });
  }

  const rows = await sql`
    SELECT id, email, role, scope_type, scope_id, invited_by, status, expires_at
    FROM invites
    WHERE token = ${token}
  `;
  const invite = rows[0];

  if (!invite || invite.status !== "pending" || new Date(invite.expires_at) <= new Date()) {
    return res.status(404).json({ error: "This invitation is invalid, already used, or expired." });
  }

  if (session.user.email.toLowerCase() !== String(invite.email).toLowerCase()) {
    return res.status(403).json({
      error: "This invite was sent to a different email address.",
      invitedEmail: invite.email,
    });
  }

  try {
    await grantInvite(session.user.id, invite as GrantableInvite);
  } catch (e: any) {
    console.error("[invites] accept failed", e);
    return res.status(500).json({ error: "Failed to accept invite" });
  }

  const redirect = await scopeRedirectPath(
    invite.scope_type as ScopeType,
    Number(invite.scope_id)
  );

  return res.status(200).json({ ok: true, redirect });
}
