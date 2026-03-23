import type { NextApiRequest, NextApiResponse } from "next";
import { requireSession } from "@/lib/auth/requireSession";
import { sql, pool } from "@/lib/db";
import {
  getUserRoles,
  assignRole,
  isValidRoleScopeMapping,
  canAssignRole,
  VALID_ROLES,
  VALID_SCOPES,
  type AppRole,
  type ScopeType,
} from "@/lib/auth/permissions";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") return listRoles(req, res);
  if (req.method === "POST") return createRole(req, res);
  res.setHeader("Allow", ["GET", "POST"]);
  res.status(405).end("Method Not Allowed");
}

// GET /api/admin/roles?user_id=&scope_type=&scope_id=
async function listRoles(req: NextApiRequest, res: NextApiResponse) {
  const session = await requireSession(req, res);
  if (!session) return;

  // System admins can list all; scoped admins see roles within their scope
  const isAdmin = session.user.role === "admin";

  const { user_id, scope_type, scope_id } = req.query as Record<string, string>;

  let query = `
    SELECT ur.id, ur.user_id, ur.role, ur.scope_type, ur.scope_id,
           ur.created_at, ur.created_by,
           u.name AS user_name, u.email AS user_email, u.role AS user_system_role
    FROM user_roles ur
    LEFT JOIN neon_auth."user" u ON u.id::text = ur.user_id
    WHERE 1=1
  `;
  const params: any[] = [];
  let i = 1;

  if (user_id) {
    query += ` AND ur.user_id = $${i}`;
    params.push(user_id);
    i++;
  }
  if (scope_type) {
    query += ` AND ur.scope_type = $${i}`;
    params.push(scope_type);
    i++;
  }
  if (scope_id) {
    query += ` AND ur.scope_id = $${i}`;
    params.push(Number(scope_id));
    i++;
  }

  query += ` ORDER BY ur.created_at DESC`;

  if (!isAdmin && !scope_type && !scope_id) {
    // Non-admin without scope filter: only show roles they can see
    // For now, require at least a scope filter for non-admins
    res.status(403).json({ error: "Forbidden: scope_type and scope_id required for non-admin users" });
    return;
  }

  try {
    const result = await pool.query(query, params);
    const rows = result.rows;

    // Resolve entity names for display
    const enriched = await Promise.all(
      rows.map(async (row: any) => {
        const entityName = await resolveEntityName(row.scope_type, row.scope_id);
        return { ...row, entity_name: entityName };
      })
    );

    res.status(200).json({ roles: enriched });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message || "Failed to list roles" });
  }
}

// POST /api/admin/roles
// Body: { userId, role, scopeType, scopeId }
async function createRole(req: NextApiRequest, res: NextApiResponse) {
  const session = await requireSession(req, res);
  if (!session) return;

  const { userId, role, scopeType, scopeId } = req.body ?? {};

  if (!userId || !role || !scopeType || scopeId == null) {
    res.status(400).json({ error: "userId, role, scopeType, and scopeId are required" });
    return;
  }

  if (!VALID_ROLES.includes(role)) {
    res.status(400).json({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}` });
    return;
  }

  if (!VALID_SCOPES.includes(scopeType)) {
    res.status(400).json({ error: `Invalid scopeType. Must be one of: ${VALID_SCOPES.join(", ")}` });
    return;
  }

  if (!isValidRoleScopeMapping(role, scopeType)) {
    res.status(400).json({ error: `Role '${role}' must have scope_type '${role.replace("_admin", "").replace("team_manager", "team").replace("team_parent", "team")}'` });
    return;
  }

  // Verify entity exists
  const entityExists = await checkEntityExists(scopeType as ScopeType, Number(scopeId));
  if (!entityExists) {
    res.status(404).json({ error: `Entity not found: ${scopeType} ${scopeId}` });
    return;
  }

  // Authorization: system admin can assign anything; others need scoped access
  const isAdmin = session.user.role === "admin";
  if (!isAdmin) {
    const assignerRoles = await getUserRoles(session.user.id);
    const allowed = await canAssignRole(assignerRoles, role as AppRole, scopeType as ScopeType, Number(scopeId));
    if (!allowed) {
      res.status(403).json({ error: "Forbidden: you don't have permission to assign this role" });
      return;
    }
  }

  try {
    const result = await assignRole(
      userId,
      role as AppRole,
      scopeType as ScopeType,
      Number(scopeId),
      session.user.id
    );

    if (!result) {
      res.status(409).json({ error: "Role already assigned" });
      return;
    }

    const entityName = await resolveEntityName(scopeType, Number(scopeId));
    res.status(201).json({ role: { ...result, entity_name: entityName } });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message || "Failed to assign role" });
  }
}

// --------------- Helpers ---------------

async function resolveEntityName(scopeType: string, scopeId: number): Promise<string | null> {
  try {
    switch (scopeType) {
      case "league": {
        const rows = await sql`SELECT name FROM leagues WHERE id = ${scopeId}`;
        return rows[0]?.name ?? null;
      }
      case "division": {
        const rows = await sql`SELECT ld.name, l.name AS league_name FROM league_divisions ld JOIN leagues l ON l.id = ld.league_id WHERE ld.id = ${scopeId}`;
        return rows[0] ? `${rows[0].league_name} — ${rows[0].name}` : null;
      }
      case "tournament": {
        const rows = await sql`SELECT name FROM tournaments_api WHERE id = ${scopeId}`;
        return rows[0]?.name ?? null;
      }
      case "team": {
        const rows = await sql`SELECT name FROM teams WHERE teamid = ${scopeId}`;
        return rows[0]?.name ?? null;
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

async function checkEntityExists(scopeType: ScopeType, scopeId: number): Promise<boolean> {
  try {
    switch (scopeType) {
      case "league": {
        const rows = await sql`SELECT 1 FROM leagues WHERE id = ${scopeId}`;
        return rows.length > 0;
      }
      case "division": {
        const rows = await sql`SELECT 1 FROM league_divisions WHERE id = ${scopeId}`;
        return rows.length > 0;
      }
      case "tournament": {
        const rows = await sql`SELECT 1 FROM tournaments WHERE tournamentid = ${scopeId}`;
        return rows.length > 0;
      }
      case "team": {
        const rows = await sql`SELECT 1 FROM teams WHERE teamid = ${scopeId}`;
        return rows.length > 0;
      }
      default:
        return false;
    }
  } catch {
    return false;
  }
}
