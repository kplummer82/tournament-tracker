import { randomBytes, randomInt } from "crypto";
import { sql } from "@/lib/db";
import { sendEmail } from "@/lib/email/client";
import { mfaCodeEmail } from "@/lib/email/templates";

/**
 * Server-only MFA helpers (email OTP second factor on top of Neon Auth).
 * Imported by the MFA API routes and requireSession only — do NOT import
 * from a client component (it pulls in `crypto`).
 *
 * Codes are plaintext like invites.token; a 6-digit code has no useful
 * offline-attack resistance hashed or not, so the real controls are the
 * TTL, the attempt cap, and the resend cooldown below.
 */

export type MfaPurpose = "login" | "enable";

export const MFA_CODE_TTL_MINUTES = 10;
export const MFA_MAX_ATTEMPTS = 5;
export const MFA_RESEND_COOLDOWN_SECONDS = 60;
export const MFA_HOURLY_CHALLENGE_CAP = 6;
export const TRUSTED_DEVICE_TTL_DAYS = 30;

/** 6-digit numeric one-time code, zero-padded. */
export function generateMfaCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/** URL-safe 256-bit trusted-device token (~43 chars). */
export function generateDeviceToken(): string {
  return randomBytes(32).toString("base64url");
}

// ── Challenges ────────────────────────────────────────────────────────────────

export type CreateChallengeResult =
  | { status: "ok"; expiresInSeconds: number }
  | { status: "resend_cooldown"; retryAfterSeconds: number }
  | { status: "too_many_requests" }
  | { status: "email_send_failed" };

/**
 * Create a new challenge for the user and email the code. Invalidates any
 * prior unconsumed codes for the same purpose so only the latest code works.
 * Unlike invite emails, a send failure here is fatal — the code is the whole
 * mechanism — so the just-created challenge is invalidated and the caller
 * gets `email_send_failed` (no cooldown penalty for retrying).
 */
export async function createChallenge(
  userId: string,
  purpose: MfaPurpose,
  email: string
): Promise<CreateChallengeResult> {
  const recent = await sql`
    SELECT EXTRACT(EPOCH FROM (NOW() - created_at))::int AS age_seconds
    FROM mfa_challenges
    WHERE user_id = ${userId} AND purpose = ${purpose} AND consumed_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1
  `;
  const age = recent[0]?.age_seconds;
  if (age != null && age < MFA_RESEND_COOLDOWN_SECONDS) {
    return { status: "resend_cooldown", retryAfterSeconds: MFA_RESEND_COOLDOWN_SECONDS - age };
  }

  const hourly = await sql`
    SELECT COUNT(*)::int AS n
    FROM mfa_challenges
    WHERE user_id = ${userId} AND created_at > NOW() - INTERVAL '1 hour'
  `;
  if ((hourly[0]?.n ?? 0) >= MFA_HOURLY_CHALLENGE_CAP) {
    return { status: "too_many_requests" };
  }

  // Lazy prune: challenges are worthless after 10 minutes; a day is generous.
  await sql`DELETE FROM mfa_challenges WHERE created_at < NOW() - INTERVAL '1 day'`;

  await sql`
    UPDATE mfa_challenges SET consumed_at = NOW()
    WHERE user_id = ${userId} AND purpose = ${purpose} AND consumed_at IS NULL
  `;

  const code = generateMfaCode();
  const inserted = await sql`
    INSERT INTO mfa_challenges (user_id, method, purpose, code)
    VALUES (${userId}, 'email', ${purpose}, ${code})
    RETURNING id
  `;

  try {
    const content = mfaCodeEmail({ code, expiresMinutes: MFA_CODE_TTL_MINUTES });
    await sendEmail({ to: email, ...content });
  } catch (e) {
    console.error("[mfa] code email send failed", e);
    await sql`UPDATE mfa_challenges SET consumed_at = NOW() WHERE id = ${inserted[0].id}`;
    return { status: "email_send_failed" };
  }

  return { status: "ok", expiresInSeconds: MFA_CODE_TTL_MINUTES * 60 };
}

export type VerifyChallengeResult =
  | { status: "ok" }
  | { status: "no_active_code" }
  | { status: "invalid_code"; attemptsRemaining: number }
  | { status: "too_many_attempts" };

/** Check a submitted code against the user's latest active challenge. */
export async function verifyChallenge(
  userId: string,
  purpose: MfaPurpose,
  code: string
): Promise<VerifyChallengeResult> {
  const rows = await sql`
    SELECT id, code, attempts, (expires_at < NOW()) AS expired
    FROM mfa_challenges
    WHERE user_id = ${userId} AND purpose = ${purpose} AND consumed_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1
  `;
  const challenge = rows[0];
  if (!challenge || challenge.expired) return { status: "no_active_code" };
  if (challenge.attempts >= MFA_MAX_ATTEMPTS) return { status: "too_many_attempts" };

  if (challenge.code !== code) {
    const updated = await sql`
      UPDATE mfa_challenges SET attempts = attempts + 1
      WHERE id = ${challenge.id}
      RETURNING attempts
    `;
    const attempts = updated[0]?.attempts ?? challenge.attempts + 1;
    if (attempts >= MFA_MAX_ATTEMPTS) return { status: "too_many_attempts" };
    return { status: "invalid_code", attemptsRemaining: MFA_MAX_ATTEMPTS - attempts };
  }

  await sql`UPDATE mfa_challenges SET consumed_at = NOW() WHERE id = ${challenge.id}`;
  return { status: "ok" };
}

// ── Verified sessions ─────────────────────────────────────────────────────────

/**
 * Record that this Neon Auth session completed MFA. `expiresAt` mirrors the
 * session's own expiry so the row dies with the session.
 */
export async function markSessionVerified(
  sessionId: string,
  userId: string,
  expiresAt: Date | string
): Promise<void> {
  await sql`DELETE FROM mfa_verified_sessions WHERE expires_at < NOW()`;
  await sql`
    INSERT INTO mfa_verified_sessions (session_id, user_id, expires_at)
    VALUES (${sessionId}, ${userId}, ${expiresAt})
    ON CONFLICT (session_id) DO NOTHING
  `;
}

// ── Trusted devices ───────────────────────────────────────────────────────────

/** Create a trusted-device record and return its cookie token. */
export async function createTrustedDevice(
  userId: string,
  userAgent: string | undefined
): Promise<string> {
  const token = generateDeviceToken();
  const label = userAgent ? userAgent.slice(0, 255) : null;
  await sql`
    INSERT INTO mfa_trusted_devices (token, user_id, label)
    VALUES (${token}, ${userId}, ${label})
  `;
  return token;
}

// ── Trusted-device cookie ─────────────────────────────────────────────────────
// Same dev/prod prefix split as the Neon Auth session cookie (see the auth
// proxy): __Secure- requires HTTPS, which dev-over-HTTP doesn't have.

const TRUSTED_DEVICE_COOKIE = "sb.trusted_device";

function isProd(): boolean {
  return process.env.NODE_ENV === "production";
}

export function trustedDeviceCookieName(): string {
  return isProd() ? `__Secure-${TRUSTED_DEVICE_COOKIE}` : TRUSTED_DEVICE_COOKIE;
}

export function readTrustedDeviceToken(req: {
  headers: { cookie?: string };
}): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  const wanted = new Set([`__Secure-${TRUSTED_DEVICE_COOKIE}`, TRUSTED_DEVICE_COOKIE]);
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const name = part.slice(0, idx).trim();
    if (wanted.has(name)) {
      const value = part.slice(idx + 1).trim();
      if (value) return value;
    }
  }
  return null;
}

export function trustedDeviceSetCookie(token: string): string {
  const maxAge = TRUSTED_DEVICE_TTL_DAYS * 24 * 60 * 60;
  const secure = isProd() ? "; Secure" : "";
  return `${trustedDeviceCookieName()}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function trustedDeviceClearCookie(): string {
  const secure = isProd() ? "; Secure" : "";
  return `${trustedDeviceCookieName()}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}
