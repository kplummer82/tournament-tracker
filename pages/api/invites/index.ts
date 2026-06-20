import type { NextApiRequest, NextApiResponse } from "next";
import { requireSession } from "@/lib/auth/requireSession";
import { sql } from "@/lib/db";
import {
  getUserRoles,
  isValidRoleScopeMapping,
  canAssignRole,
  VALID_ROLES,
  VALID_SCOPES,
  type AppRole,
  type ScopeType,
} from "@/lib/auth/permissions";
import { resolveEntityName, checkEntityExists } from "@/lib/scope-names";
import { generateInviteToken, intentForRole } from "@/lib/invites";
import { sendEmail } from "@/lib/email/client";
import { inviteEmail } from "@/lib/email/templates";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") return listInvites(req, res);
  if (req.method === "POST") return createInvite(req, res);
  res.setHeader("Allow", ["GET", "POST"]);
  res.status(405).end("Method Not Allowed");
}

// GET /api/invites?scope_type=&scope_id=  — pending, non-expired invites for a scope
async function listInvites(req: NextApiRequest, res: NextApiResponse) {
  const session = await requireSession(req, res);
  if (!session) return;

  const { scope_type, scope_id } = req.query as Record<string, string>;
  if (!scope_type || !scope_id) {
    res.status(400).json({ error: "scope_type and scope_id are required" });
    return;
  }

  try {
    const rows = await sql`
      SELECT id, email, role, scope_type, scope_id, invited_by_name, created_at, expires_at
      FROM invites
      WHERE scope_type = ${scope_type}
        AND scope_id = ${Number(scope_id)}
        AND status = 'pending'
        AND expires_at > NOW()
      ORDER BY created_at DESC
    `;
    res.status(200).json({ invites: rows });
  } catch (e: any) {
    console.error("[invites] list failed", e);
    res.status(500).json({ error: e.message || "Failed to list invites" });
  }
}

// POST /api/invites  — Body: { email, role, scopeType, scopeId, intent? }
async function createInvite(req: NextApiRequest, res: NextApiResponse) {
  const session = await requireSession(req, res);
  if (!session) return;

  const { email, role, scopeType, scopeId } = req.body ?? {};

  if (!email || !role || !scopeType || scopeId == null) {
    res.status(400).json({ error: "email, role, scopeType, and scopeId are required" });
    return;
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalizedEmail)) {
    res.status(400).json({ error: "Enter a valid email address" });
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
    res.status(400).json({ error: `Role '${role}' is not valid for scope '${scopeType}'` });
    return;
  }

  const entityExists = await checkEntityExists(scopeType as ScopeType, Number(scopeId));
  if (!entityExists) {
    res.status(404).json({ error: `Entity not found: ${scopeType} ${scopeId}` });
    return;
  }

  // Authorization: system admin can invite anyone; others need scoped permission
  // to assign this role — identical to POST /api/admin/roles.
  const isAdmin = session.user.role === "admin";
  if (!isAdmin) {
    const assignerRoles = await getUserRoles(session.user.id);
    const allowed = await canAssignRole(
      assignerRoles,
      role as AppRole,
      scopeType as ScopeType,
      Number(scopeId)
    );
    if (!allowed) {
      res.status(403).json({ error: "Forbidden: you don't have permission to grant this role" });
      return;
    }
  }

  const token = generateInviteToken();
  const intent = intentForRole(role as AppRole);
  const invitedByName = session.user.name || session.user.email;

  let invite;
  try {
    const rows = await sql`
      INSERT INTO invites (token, email, intent, role, scope_type, scope_id, invited_by, invited_by_name)
      VALUES (
        ${token}, ${normalizedEmail}, ${intent}, ${role},
        ${scopeType}, ${Number(scopeId)}, ${session.user.id}, ${invitedByName}
      )
      RETURNING id, email, role, scope_type, scope_id, invited_by_name, created_at, expires_at
    `;
    invite = rows[0];
  } catch (e: any) {
    console.error("[invites] insert failed", e);
    res.status(500).json({ error: e.message || "Failed to create invite" });
    return;
  }

  const proto = (req.headers["x-forwarded-proto"] as string) ?? "http";
  const host = req.headers.host ?? "localhost:3000";
  const inviteUrl = `${proto}://${host}/invite/${token}`;

  const scopeLabel = (await resolveEntityName(scopeType, Number(scopeId))) ?? `${scopeType} #${scopeId}`;

  // Don't let a missing API key / unverified domain block invite creation — the
  // operator can always copy the returned inviteUrl.
  let emailId: string | undefined;
  let warning: string | undefined;
  try {
    const content = inviteEmail({ inviteUrl, invitedByName, scopeLabel });
    const result = await sendEmail({ to: normalizedEmail, ...content });
    emailId = result.id;
  } catch (e: any) {
    warning = `Invite created, but the email could not be sent (${e.message}). Copy the link below to share it manually.`;
    console.error("[invites] email send failed", e);
  }

  res.status(201).json({ invite, inviteUrl, emailId, warning });
}
