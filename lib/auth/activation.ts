import type { NextApiRequest } from "next";
import { sql } from "@/lib/db";
import { getUserStatus } from "@/lib/auth/profile";
import { acceptPendingInvitesForUser } from "@/lib/invites";
import { sendEmail } from "@/lib/email/client";
import { approvedEmail } from "@/lib/email/templates";

function getOrigin(req: NextApiRequest): string {
  const proto = (req.headers["x-forwarded-proto"] as string) ?? "http";
  const host = req.headers.host ?? "localhost:3000";
  return `${proto}://${host}`;
}

/**
 * Look up a user's email + display name from Neon Auth (admin list-users),
 * matching by id. Used as a fallback for the approval email recipient when the
 * caller didn't already have it. Best-effort — returns null on any failure.
 *
 * `user_profiles` stores no email, so this is the only server-side source. The
 * list is admin-scoped, so `req` must carry an admin session cookie.
 */
export async function getAuthUserById(
  req: NextApiRequest,
  userId: string
): Promise<{ email: string; name: string | null } | null> {
  try {
    const url = new URL(`${getOrigin(req)}/api/auth/admin/list-users`);
    url.searchParams.set("limit", "1000");
    url.searchParams.set("offset", "0");
    const res = await fetch(url.toString(), {
      headers: { cookie: req.headers.cookie ?? "" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const users = data?.data?.users ?? data?.users ?? [];
    const match = Array.isArray(users)
      ? users.find((u: { id?: string }) => u.id === userId)
      : null;
    if (!match?.email) return null;
    return { email: match.email as string, name: (match.name as string) ?? null };
  } catch {
    return null;
  }
}

type ActivateArgs = {
  req: NextApiRequest;
  userId: string;
  /** Recipient email the admin client already has; falls back to a Neon Auth lookup. */
  email?: string | null;
  name?: string | null;
};

/**
 * Approve a user: flip their profile to 'active' and, only on a real
 * inactive→active transition, (a) grant any invite that was addressed to them
 * while they were pending and (b) email them that they've been approved.
 *
 * Safe to call when the user is already active (no-op, no duplicate email). The
 * status write is authoritative and may throw (surfaced to the caller); the
 * invite grant and email are best-effort so they can never fail the admin
 * action once the status has flipped.
 */
export async function activateUser({ req, userId, email, name }: ActivateArgs): Promise<void> {
  const prevStatus = await getUserStatus(userId); // "active" when no row (legacy)

  // Authoritative — upsert handles the legacy no-row case too.
  await sql`
    INSERT INTO user_profiles (user_id, status, updated_at)
    VALUES (${userId}, 'active', NOW())
    ON CONFLICT (user_id) DO UPDATE SET status = 'active', updated_at = NOW()
  `;

  // Side effects fire only when the user was genuinely awaiting approval.
  if (prevStatus !== "inactive") return;

  // Resolve the recipient: prefer caller-provided, else look up from Neon Auth.
  let recipientEmail = email ?? null;
  let recipientName = name ?? null;
  if (!recipientEmail) {
    const looked = await getAuthUserById(req, userId);
    if (looked) {
      recipientEmail = looked.email;
      recipientName = looked.name;
    }
  }

  // Grant any invites that were waiting on this user's approval.
  let grantedScopes: string[] = [];
  if (recipientEmail) {
    try {
      grantedScopes = await acceptPendingInvitesForUser(userId, recipientEmail);
    } catch (e) {
      console.error("[activation] pending-invite accept failed", e);
    }
  }

  // Tell the user they're in — best-effort.
  if (recipientEmail) {
    try {
      const content = approvedEmail({
        appUrl: getOrigin(req),
        name: recipientName ?? undefined,
        scopeLabel: grantedScopes[0], // name the primary granted scope, if any
      });
      await sendEmail({ to: recipientEmail, ...content });
    } catch (e) {
      console.error("[activation] approval email send failed", e);
    }
  }
}
