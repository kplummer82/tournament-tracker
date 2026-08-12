import type { NextApiRequest, NextApiResponse } from "next";
import { getSessionForRequest } from "./server";
import { sql } from "@/lib/db";
import { markSessionVerified, readTrustedDeviceToken } from "@/lib/mfa";
import {
  getUserRoles,
  getSeasonAncestry,
  getDivisionAncestry,
  getTeamAncestry,
  hasLeagueAccess,
  hasDivisionAccess,
  hasSeasonAccess,
  hasTournamentAccess,
  hasTeamAccess,
  isTeamManager,
} from "./permissions";

type Session = NonNullable<Awaited<ReturnType<typeof getSessionForRequest>>>;
export type { Session };

// In-memory cache for the approval setting (avoids a DB query on every API call)
let approvalCache: { value: boolean; expiresAt: number } | null = null;
const CACHE_TTL_MS = 60_000; // 60 seconds

export async function isApprovalRequired(): Promise<boolean> {
  if (approvalCache && Date.now() < approvalCache.expiresAt) {
    return approvalCache.value;
  }
  try {
    const rows = await sql`SELECT value FROM app_settings WHERE key = 'require_user_approval'`;
    const value = rows.length > 0 && rows[0].value === "true";
    approvalCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  } catch {
    // If the table doesn't exist yet, default to false
    return false;
  }
}

/**
 * Check if a user has 'inactive' status in user_profiles (awaiting admin approval).
 * No row = treat as active (legacy users created before this table existed).
 */
export async function isUserInactive(userId: string): Promise<boolean> {
  try {
    const rows = await sql`SELECT 1 FROM user_profiles WHERE user_id = ${userId} AND status = 'inactive'`;
    return rows.length > 0;
  } catch {
    // If the table doesn't exist yet, treat as active
    return false;
  }
}

// Positive-only MFA cache: session ids known to NOT need verification right
// now (user has MFA off, or this session/device already verified). Never
// cache "needs MFA" — verification may complete on another serverless
// instance and must take effect on the next request here.
const mfaOkCache = new Map<string, number>(); // sessionId -> cache expiry (ms epoch)
const MFA_CACHE_TTL_MS = 60_000; // 60 seconds
const MFA_CACHE_MAX = 5000;

function cacheMfaOk(sessionId: string): void {
  if (mfaOkCache.size > MFA_CACHE_MAX) mfaOkCache.clear();
  mfaOkCache.set(sessionId, Date.now() + MFA_CACHE_TTL_MS);
}

/**
 * Does this session still owe a second factor? True only when the user has
 * MFA enabled AND the session hasn't verified AND no valid trusted-device
 * cookie is present. A trusted-device hit is promoted to a verified session
 * so subsequent checks skip the device join.
 */
export async function needsMfaVerification(
  req: NextApiRequest,
  session: Session
): Promise<boolean> {
  const sessionId = session.session?.id;
  if (!sessionId) return false; // no stable session id — fail open

  const cachedUntil = mfaOkCache.get(sessionId);
  if (cachedUntil && Date.now() < cachedUntil) return false;

  try {
    const deviceToken = readTrustedDeviceToken(req);
    const rows = await sql`
      SELECT up.mfa_enabled,
             (vs.session_id IS NOT NULL) AS session_verified,
             td.id AS trusted_device_id
      FROM user_profiles up
      LEFT JOIN mfa_verified_sessions vs
        ON vs.session_id = ${sessionId} AND vs.expires_at > NOW()
      LEFT JOIN mfa_trusted_devices td
        ON td.user_id = up.user_id
       AND td.token = ${deviceToken ?? ""}
       AND td.revoked_at IS NULL
       AND td.expires_at > NOW()
      WHERE up.user_id = ${session.user.id}
    `;
    const row = rows[0];
    if (!row || !row.mfa_enabled || row.session_verified) {
      cacheMfaOk(sessionId);
      return false;
    }
    if (row.trusted_device_id) {
      await markSessionVerified(sessionId, session.user.id, session.session.expiresAt);
      await sql`UPDATE mfa_trusted_devices SET last_used_at = NOW() WHERE id = ${row.trusted_device_id}`;
      cacheMfaOk(sessionId);
      return false;
    }
    return true;
  } catch {
    // If the tables don't exist yet, treat as verified (fail open — matches
    // the isApprovalRequired/isUserInactive posture).
    return false;
  }
}

/**
 * Like requireSession but does NOT gate on MFA. Only for the MFA endpoints
 * themselves (/api/mfa/status|challenge|verify), which an MFA-pending session
 * must be able to reach to complete verification.
 */
export async function requireSessionAllowMfaPending(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<Session | null> {
  const session = await getSessionForRequest(req);
  if (!session?.user) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }

  const approvalEnabled = await isApprovalRequired();
  if (approvalEnabled && await isUserInactive(session.user.id)) {
    res.status(401).json({ error: "Account pending approval" });
    return null;
  }

  return session;
}

/**
 * Require an authenticated session. Returns the session or sends 401 and returns null.
 * If approval mode is enabled, also rejects users with inactive status.
 * If the user opted into MFA, also rejects sessions that haven't completed
 * the second factor (401 with code "mfa_required").
 */
export async function requireSession(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<Session | null> {
  const session = await requireSessionAllowMfaPending(req, res);
  if (!session) return null;

  if (await needsMfaVerification(req, session)) {
    res.status(401).json({ error: "MFA required", code: "mfa_required" });
    return null;
  }

  return session;
}

/**
 * Require an authenticated admin session. Returns the session or sends 401/403 and returns null.
 */
export async function requireAdmin(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<Session | null> {
  const session = await requireSession(req, res);
  if (!session) return null;
  if (session.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return null;
  }
  return session;
}

/**
 * Require a session that holds at least one scoped role (team_manager,
 * league_admin, ...) or is a system admin. Gates location suggestions:
 * any-authenticated-user is NOT enough. Client-side parity is
 * usePermissions().hasAnyRole.
 */
export async function requireRoleHolder(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<Session | null> {
  const session = await requireSession(req, res);
  if (!session) return null;
  if (session.user.role === "admin") return session;

  const roles = await getUserRoles(session.user.id);
  if (roles.length > 0) return session;

  res.status(403).json({ error: "Forbidden" });
  return null;
}

// --------------- Scoped Access Helpers ---------------

/**
 * Require league_admin access for a specific league.
 * System admins always pass.
 */
export async function requireLeagueAccess(
  req: NextApiRequest,
  res: NextApiResponse,
  leagueId: number
): Promise<Session | null> {
  const session = await requireSession(req, res);
  if (!session) return null;
  if (session.user.role === "admin") return session;

  const roles = await getUserRoles(session.user.id);
  if (hasLeagueAccess(roles, leagueId)) return session;

  res.status(403).json({ error: "Forbidden" });
  return null;
}

/**
 * Require division_admin (or league_admin on parent league) access.
 * System admins always pass.
 */
export async function requireDivisionAccess(
  req: NextApiRequest,
  res: NextApiResponse,
  divisionId: number
): Promise<Session | null> {
  const session = await requireSession(req, res);
  if (!session) return null;
  if (session.user.role === "admin") return session;

  const ancestry = await getDivisionAncestry(divisionId);
  if (!ancestry) {
    res.status(404).json({ error: "Division not found" });
    return null;
  }

  const roles = await getUserRoles(session.user.id);
  if (hasDivisionAccess(roles, divisionId, ancestry.league_id)) return session;

  res.status(403).json({ error: "Forbidden" });
  return null;
}

/**
 * Require access to a season (via division_admin or league_admin on parent).
 * System admins always pass.
 */
export async function requireSeasonAccess(
  req: NextApiRequest,
  res: NextApiResponse,
  seasonId: number
): Promise<Session | null> {
  const session = await requireSession(req, res);
  if (!session) return null;
  if (session.user.role === "admin") return session;

  const ancestry = await getSeasonAncestry(seasonId);
  if (!ancestry) {
    res.status(404).json({ error: "Season not found" });
    return null;
  }

  const roles = await getUserRoles(session.user.id);
  if (hasSeasonAccess(roles, ancestry.division_id, ancestry.league_id)) return session;

  res.status(403).json({ error: "Forbidden" });
  return null;
}

/**
 * Require tournament_admin access for a specific tournament.
 * System admins always pass.
 */
export async function requireTournamentAccess(
  req: NextApiRequest,
  res: NextApiResponse,
  tournamentId: number
): Promise<Session | null> {
  const session = await requireSession(req, res);
  if (!session) return null;
  if (session.user.role === "admin") return session;

  const roles = await getUserRoles(session.user.id);
  if (hasTournamentAccess(roles, tournamentId)) return session;

  res.status(403).json({ error: "Forbidden" });
  return null;
}

/**
 * Require team_manager access (or division_admin/league_admin on parent, or creator of unaffiliated team).
 * System admins always pass.
 */
export async function requireTeamAccess(
  req: NextApiRequest,
  res: NextApiResponse,
  teamId: number
): Promise<Session | null> {
  const session = await requireSession(req, res);
  if (!session) return null;
  if (session.user.role === "admin") return session;

  const teamAncestry = await getTeamAncestry(teamId);
  if (!teamAncestry) {
    res.status(404).json({ error: "Team not found" });
    return null;
  }

  // Creator of unaffiliated team always has access
  if (!teamAncestry.league_id && teamAncestry.created_by === session.user.id) {
    return session;
  }

  const roles = await getUserRoles(session.user.id);
  if (hasTeamAccess(roles, teamId, teamAncestry.league_id, teamAncestry.league_division_id)) {
    return session;
  }

  res.status(403).json({ error: "Forbidden" });
  return null;
}

/**
 * Require coach/manager of *this* team specifically.
 *
 * Deliberately stricter than `requireTeamAccess`: there is **no system-admin
 * bypass**, league/division admins do not inherit, and unlike that guard the
 * team's creator gets no fallback — the only thing that counts is holding
 * `team_manager` on this team, exactly what Manage Access lists as
 * "Coach / Manager". For per-coach data like roster position ratings, admins
 * are readers: they have no set of their own and must not overwrite a coach's.
 *
 * Creating a team auto-assigns `team_manager`, so a creator normally qualifies.
 * If that role is ever revoked, a system admin can restore it via /admin/roles.
 *
 * Pair it with `requireTeamAccess` on the matching GET so admins can still look.
 */
export async function requireTeamManager(
  req: NextApiRequest,
  res: NextApiResponse,
  teamId: number
): Promise<Session | null> {
  const session = await requireSession(req, res);
  if (!session) return null;

  // Resolve the team first so a missing one 404s instead of reading as a 403.
  const teamAncestry = await getTeamAncestry(teamId);
  if (!teamAncestry) {
    res.status(404).json({ error: "Team not found" });
    return null;
  }

  const roles = await getUserRoles(session.user.id);
  if (isTeamManager(roles, teamId)) return session;

  res.status(403).json({ error: "Only a coach or manager of this team can do that." });
  return null;
}
