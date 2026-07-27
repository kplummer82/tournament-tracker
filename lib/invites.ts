import { randomBytes } from "crypto";
import type { AppRole, ScopeType, SignupIntent } from "@/lib/auth/permissions";
import { getDivisionAncestry, assignRole } from "@/lib/auth/permissions";
import { resolveEntityName } from "@/lib/scope-names";
import { sql } from "@/lib/db";

/**
 * Server-only invite helpers. Imported by the invite API routes and the
 * activation helper only — do NOT import this from a client component (it pulls
 * in `crypto` and `sql`).
 */

/** The invite columns needed to grant its role. */
export type GrantableInvite = {
  id: number;
  role: string;
  scope_type: string;
  scope_id: number | string;
  invited_by: string;
};

/** URL-safe, hard-to-guess invite token (~32 chars). */
export function generateInviteToken(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * The signup-picker intent to pre-fill for a given role being granted. Intent is
 * just a UX hint on the signup form; the actual grant is driven by the role.
 */
export function intentForRole(role: AppRole): SignupIntent {
  switch (role) {
    case "league_admin":
    case "division_admin":
      return "league_operator";
    case "tournament_admin":
      return "tournament_organizer";
    case "team_manager":
      return "coach";
    case "team_parent":
      return "follower";
  }
}

/**
 * Where to land a user after they accept an invite — the page for the scope they
 * were just granted access to.
 */
export async function scopeRedirectPath(
  scopeType: ScopeType,
  scopeId: number
): Promise<string> {
  switch (scopeType) {
    case "team":
      return `/teams/${scopeId}`;
    case "league":
      return `/leagues/${scopeId}`;
    case "tournament":
      return `/tournaments/${scopeId}/overview`;
    case "division": {
      const ancestry = await getDivisionAncestry(scopeId);
      return ancestry
        ? `/leagues/${ancestry.league_id}/divisions/${scopeId}`
        : "/leagues";
    }
    default:
      return "/";
  }
}

/**
 * Grant the role an invite carries to a user, mark the invite accepted, and
 * auto-follow the scoped entity. Idempotent: assignRole is ON CONFLICT DO
 * NOTHING and the `status = 'pending'` guard on the UPDATE prevents a second
 * grant. Shared by the interactive accept route (POST /api/invites/accept) and
 * the on-approval auto-accept path (lib/auth/activation.ts).
 *
 * Throws if the role grant or accepted-status write fails; the auto-follow is
 * swallowed (a follow failure must not undo an already-granted role).
 */
export async function grantInvite(
  userId: string,
  invite: GrantableInvite
): Promise<void> {
  await assignRole(
    userId,
    invite.role as AppRole,
    invite.scope_type as ScopeType,
    Number(invite.scope_id),
    invite.invited_by
  );

  await sql`
    UPDATE invites
    SET status = 'accepted', accepted_at = NOW(), accepted_by = ${userId}
    WHERE id = ${invite.id} AND status = 'pending'
  `;

  // scope_type maps 1:1 to user_follows.entity_type. Best-effort.
  try {
    await sql`
      INSERT INTO user_follows (user_id, entity_type, entity_id)
      VALUES (${userId}, ${invite.scope_type}, ${Number(invite.scope_id)})
      ON CONFLICT DO NOTHING
    `;
  } catch (e) {
    console.error("[invites] auto-follow failed", e);
  }
}

/**
 * Accept every pending, non-expired invite addressed to `email` on behalf of
 * `userId`. Called when an admin approves a user: any invite that arrived while
 * they were awaiting approval (and therefore couldn't be accepted through the
 * gated accept route) is granted now. Returns the human-readable labels of the
 * scopes granted, for the approval email. Never throws — a per-invite failure
 * is logged and skipped.
 */
export async function acceptPendingInvitesForUser(
  userId: string,
  email: string
): Promise<string[]> {
  let rows: GrantableInvite[] = [];
  try {
    rows = (await sql`
      SELECT id, role, scope_type, scope_id, invited_by
      FROM invites
      WHERE LOWER(email) = LOWER(${email})
        AND status = 'pending'
        AND expires_at > NOW()
    `) as GrantableInvite[];
  } catch (e) {
    console.error("[invites] pending lookup failed", e);
    return [];
  }

  const labels: string[] = [];
  for (const invite of rows) {
    try {
      await grantInvite(userId, invite);
      const label = await resolveEntityName(invite.scope_type, Number(invite.scope_id));
      if (label) labels.push(label);
    } catch (e) {
      console.error("[invites] on-approval grant failed", e);
    }
  }
  return labels;
}
