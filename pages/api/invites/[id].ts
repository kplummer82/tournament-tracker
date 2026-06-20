import type { NextApiRequest, NextApiResponse } from "next";
import { requireSession } from "@/lib/auth/requireSession";
import { sql } from "@/lib/db";
import {
  getUserRoles,
  canAssignRole,
  type AppRole,
  type ScopeType,
} from "@/lib/auth/permissions";

/**
 * DELETE /api/invites/[id]  — revoke a pending invite.
 * Auth: system admin, or a user with permission to grant the invite's role in
 * its scope (same check as creating it).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "DELETE") {
    res.setHeader("Allow", "DELETE");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const session = await requireSession(req, res);
  if (!session) return;

  const id = Number(req.query.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "Invalid invite id" });
  }

  const rows = await sql`
    SELECT id, role, scope_type, scope_id, status FROM invites WHERE id = ${id}
  `;
  const invite = rows[0];
  if (!invite) {
    return res.status(404).json({ error: "Invite not found" });
  }

  const isAdmin = session.user.role === "admin";
  if (!isAdmin) {
    const assignerRoles = await getUserRoles(session.user.id);
    const allowed = await canAssignRole(
      assignerRoles,
      invite.role as AppRole,
      invite.scope_type as ScopeType,
      Number(invite.scope_id)
    );
    if (!allowed) {
      return res.status(403).json({ error: "Forbidden" });
    }
  }

  try {
    await sql`UPDATE invites SET status = 'revoked' WHERE id = ${id} AND status = 'pending'`;
    return res.status(200).json({ ok: true });
  } catch (e: any) {
    console.error("[invites] revoke failed", e);
    return res.status(500).json({ error: e.message || "Failed to revoke invite" });
  }
}
