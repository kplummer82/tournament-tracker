import type { NextApiRequest, NextApiResponse } from "next";
import {
  requireSession,
  requireSessionAllowMfaPending,
} from "@/lib/auth/requireSession";
import { sql } from "@/lib/db";
import {
  verifyChallenge,
  markSessionVerified,
  createTrustedDevice,
  trustedDeviceSetCookie,
  type MfaPurpose,
} from "@/lib/mfa";

// POST /api/mfa/verify — Body: { purpose: "login" | "enable", code, trustDevice? }
// Checks the code. On success: "login" marks the session verified; "enable"
// turns MFA on for the user (a working code proves email delivery works).
// trustDevice additionally creates a 30-day trusted device + cookie.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const body =
    typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {};
  const purpose = body.purpose as MfaPurpose;
  const code = typeof body.code === "string" ? body.code.trim() : "";
  const trustDevice = body.trustDevice === true;

  if (purpose !== "login" && purpose !== "enable") {
    return res.status(400).json({ error: "purpose must be 'login' or 'enable'" });
  }
  if (!/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: "code must be 6 digits", code: "invalid_code" });
  }

  const session =
    purpose === "login"
      ? await requireSessionAllowMfaPending(req, res)
      : await requireSession(req, res);
  if (!session) return;

  try {
    if (purpose === "login") {
      // If MFA was disabled while this code was pending, there's nothing to verify.
      const rows = await sql`
        SELECT mfa_enabled FROM user_profiles WHERE user_id = ${session.user.id}
      `;
      if (rows[0]?.mfa_enabled !== true) {
        return res.status(400).json({ error: "MFA verification is not required", code: "not_required" });
      }
    }

    const result = await verifyChallenge(session.user.id, purpose, code);
    switch (result.status) {
      case "no_active_code":
        return res.status(410).json({
          error: "Code expired or not found — request a new one",
          code: "code_expired",
        });
      case "too_many_attempts":
        return res.status(429).json({
          error: "Too many incorrect attempts — request a new code",
          code: "too_many_attempts",
        });
      case "invalid_code":
        return res.status(400).json({
          error: "Incorrect code",
          code: "invalid_code",
          attemptsRemaining: result.attemptsRemaining,
        });
      case "ok":
        break;
    }

    if (purpose === "enable") {
      // Upsert like setUserSignupIntent: works for legacy users with no
      // profile row, and the status fallback honors approval mode.
      await sql`
        INSERT INTO user_profiles (user_id, mfa_enabled, mfa_method, mfa_enabled_at, status, updated_at)
        VALUES (
          ${session.user.id}, TRUE, 'email', NOW(),
          COALESCE(
            (SELECT CASE WHEN value = 'true' THEN 'inactive' ELSE 'active' END
             FROM app_settings WHERE key = 'require_user_approval' LIMIT 1),
            'active'
          ),
          NOW()
        )
        ON CONFLICT (user_id) DO UPDATE
          SET mfa_enabled = TRUE, mfa_method = 'email', mfa_enabled_at = NOW(), updated_at = NOW()
      `;
    }

    // Either way this session has proven the second factor — don't
    // immediately gate the user who just enabled MFA.
    await markSessionVerified(
      session.session.id,
      session.user.id,
      session.session.expiresAt
    );

    if (trustDevice) {
      const userAgent = Array.isArray(req.headers["user-agent"])
        ? req.headers["user-agent"][0]
        : req.headers["user-agent"];
      const token = await createTrustedDevice(session.user.id, userAgent);
      res.setHeader("Set-Cookie", trustedDeviceSetCookie(token));
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("[mfa/verify] failed", e);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
