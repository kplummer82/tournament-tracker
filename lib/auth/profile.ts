import { sql } from "@/lib/db";
import type { SignupIntent } from "./permissions";
import { isValidSignupIntent } from "./permissions";

/**
 * Read the signup_intent for a user. Returns null if no row, no intent set,
 * or if validation fails (in case the DB ever has a stale value).
 */
export async function getUserSignupIntent(
  userId: string
): Promise<SignupIntent | null> {
  try {
    const rows = await sql`
      SELECT signup_intent FROM user_profiles WHERE user_id = ${userId}
    `;
    const raw = rows[0]?.signup_intent ?? null;
    return isValidSignupIntent(raw) ? raw : null;
  } catch {
    return null;
  }
}

/**
 * Set the signup_intent for a user. Upserts so it works even if the
 * user_profiles row was not created (defensive — the auth proxy normally
 * creates it on signup). The status fallback honors require_user_approval:
 * if we end up inserting a new row, it picks up 'inactive' when approval
 * mode is on, matching what the auth proxy would have written.
 */
export async function setUserSignupIntent(
  userId: string,
  intent: SignupIntent
): Promise<void> {
  await sql`
    INSERT INTO user_profiles (user_id, signup_intent, status, updated_at)
    VALUES (
      ${userId},
      ${intent},
      COALESCE(
        (SELECT CASE WHEN value = 'true' THEN 'inactive' ELSE 'active' END
         FROM app_settings WHERE key = 'require_user_approval' LIMIT 1),
        'active'
      ),
      NOW()
    )
    ON CONFLICT (user_id) DO UPDATE
      SET signup_intent = ${intent}, updated_at = NOW()
  `;
}

/**
 * Ensure a user_profiles row exists, seeding approval-aware status if it's
 * brand new. Idempotent (ON CONFLICT DO NOTHING) so an existing row — and its
 * status — is never disturbed.
 *
 * This is the OAuth safety net: Google/social logins don't traverse the
 * email `sign-up` path that creates the row in the auth proxy, so without this
 * an OAuth user would have no row and "no row = active" would let them bypass
 * both the approval gate and MFA. Called from /auth/oauth-complete, which every
 * OAuth login is routed through.
 */
export async function ensureUserProfile(userId: string): Promise<void> {
  await sql`
    INSERT INTO user_profiles (user_id, status)
    VALUES (
      ${userId},
      COALESCE(
        (SELECT CASE WHEN value = 'true' THEN 'inactive' ELSE 'active' END
         FROM app_settings WHERE key = 'require_user_approval' LIMIT 1),
        'active'
      )
    )
    ON CONFLICT (user_id) DO NOTHING
  `;
}

/**
 * Read the status for a user. Returns 'active' if no row exists
 * (matches isUserInactive's "no row = active" posture in requireSession).
 */
export async function getUserStatus(
  userId: string
): Promise<"active" | "inactive"> {
  try {
    const rows = await sql`
      SELECT status FROM user_profiles WHERE user_id = ${userId}
    `;
    const raw = rows[0]?.status;
    return raw === "inactive" ? "inactive" : "active";
  } catch {
    return "active";
  }
}
