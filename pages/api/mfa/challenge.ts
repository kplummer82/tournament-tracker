import type { NextApiRequest, NextApiResponse } from "next";
import {
  requireSession,
  requireSessionAllowMfaPending,
  needsMfaVerification,
} from "@/lib/auth/requireSession";
import { sql } from "@/lib/db";
import {
  createChallenge,
  MFA_RESEND_COOLDOWN_SECONDS,
  type MfaPurpose,
} from "@/lib/mfa";

// POST /api/mfa/challenge — Body: { purpose: "login" | "enable" }
// Creates a one-time code and emails it. "login" is reachable by MFA-pending
// sessions; "enable" requires a fully verified session.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const body =
    typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {};
  const purpose = body.purpose as MfaPurpose;
  if (purpose !== "login" && purpose !== "enable") {
    return res.status(400).json({ error: "purpose must be 'login' or 'enable'" });
  }

  const session =
    purpose === "login"
      ? await requireSessionAllowMfaPending(req, res)
      : await requireSession(req, res);
  if (!session) return;

  try {
    if (purpose === "login") {
      // Only sessions that actually owe a code may request one.
      if (!(await needsMfaVerification(req, session))) {
        return res.status(400).json({ error: "MFA verification is not required", code: "not_required" });
      }
    } else {
      const rows = await sql`
        SELECT mfa_enabled FROM user_profiles WHERE user_id = ${session.user.id}
      `;
      if (rows[0]?.mfa_enabled === true) {
        return res.status(400).json({ error: "MFA is already enabled", code: "already_enabled" });
      }
    }

    const result = await createChallenge(session.user.id, purpose, session.user.email);
    switch (result.status) {
      case "ok":
        return res.status(200).json({
          ok: true,
          expiresInSeconds: result.expiresInSeconds,
          resendCooldownSeconds: MFA_RESEND_COOLDOWN_SECONDS,
        });
      case "resend_cooldown":
        return res.status(429).json({
          error: "A code was just sent — wait before requesting another",
          code: "resend_cooldown",
          retryAfterSeconds: result.retryAfterSeconds,
        });
      case "too_many_requests":
        return res.status(429).json({
          error: "Too many codes requested — try again later",
          code: "too_many_requests",
        });
      case "email_send_failed":
        return res.status(502).json({
          error: "Failed to send verification code",
          code: "email_send_failed",
        });
    }
  } catch (e) {
    console.error("[mfa/challenge] failed", e);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
