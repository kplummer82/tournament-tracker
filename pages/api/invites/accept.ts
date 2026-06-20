import type { NextApiRequest, NextApiResponse } from "next";
import { requireSession } from "@/lib/auth/requireSession";
import { sql } from "@/lib/db";
import { assignRole, type AppRole, type ScopeType } from "@/lib/auth/permissions";
import { scopeRedirectPath } from "@/lib/invites";

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
    await assignRole(
      session.user.id,
      invite.role as AppRole,
      invite.scope_type as ScopeType,
      Number(invite.scope_id),
      invite.invited_by
    );

    await sql`
      UPDATE invites
      SET status = 'accepted', accepted_at = NOW(), accepted_by = ${session.user.id}
      WHERE id = ${invite.id} AND status = 'pending'
    `;
  } catch (e: any) {
    console.error("[invites] accept failed", e);
    return res.status(500).json({ error: e.message || "Failed to accept invite" });
  }

  // Auto-follow the entity they were just granted access to, so it shows up in
  // their "My …" lists. scope_type matches user_follows.entity_type 1:1.
  // Best-effort: a follow failure must not fail the (already-granted) accept.
  try {
    await sql`
      INSERT INTO user_follows (user_id, entity_type, entity_id)
      VALUES (${session.user.id}, ${invite.scope_type}, ${Number(invite.scope_id)})
      ON CONFLICT DO NOTHING
    `;
  } catch (e) {
    console.error("[invites] auto-follow failed", e);
  }

  const redirect = await scopeRedirectPath(
    invite.scope_type as ScopeType,
    Number(invite.scope_id)
  );

  return res.status(200).json({ ok: true, redirect });
}
