import type { NextApiRequest, NextApiResponse } from "next";
import { requireSession } from "@/lib/auth/requireSession";
import { sql } from "@/lib/db";
import {
  getUserRoles,
  revokeRole,
  canAssignRole,
  type AppRole,
  type ScopeType,
} from "@/lib/auth/permissions";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "DELETE") return deleteRole(req, res);
  res.setHeader("Allow", ["DELETE"]);
  res.status(405).end("Method Not Allowed");
}

// DELETE /api/admin/roles/:id
async function deleteRole(req: NextApiRequest, res: NextApiResponse) {
  const session = await requireSession(req, res);
  if (!session) return;

  const roleId = Number(req.query.id);
  if (!roleId || isNaN(roleId)) {
    res.status(400).json({ error: "Invalid role ID" });
    return;
  }

  // Fetch the role to check authorization
  const rows = await sql`
    SELECT id, user_id, role, scope_type, scope_id
    FROM user_roles
    WHERE id = ${roleId}
  `;

  if (rows.length === 0) {
    res.status(404).json({ error: "Role assignment not found" });
    return;
  }

  const targetRole = rows[0];

  // Authorization: system admin can revoke anything
  const isAdmin = session.user.role === "admin";
  if (!isAdmin) {
    const assignerRoles = await getUserRoles(session.user.id);
    const allowed = await canAssignRole(
      assignerRoles,
      targetRole.role as AppRole,
      targetRole.scope_type as ScopeType,
      targetRole.scope_id
    );
    if (!allowed) {
      res.status(403).json({ error: "Forbidden: you don't have permission to revoke this role" });
      return;
    }
  }

  try {
    const success = await revokeRole(roleId);
    if (!success) {
      res.status(404).json({ error: "Role assignment not found" });
      return;
    }
    res.status(200).json({ success: true });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message || "Failed to revoke role" });
  }
}
