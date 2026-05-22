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
 * creates it on signup).
 */
export async function setUserSignupIntent(
  userId: string,
  intent: SignupIntent
): Promise<void> {
  await sql`
    INSERT INTO user_profiles (user_id, signup_intent, updated_at)
    VALUES (${userId}, ${intent}, NOW())
    ON CONFLICT (user_id) DO UPDATE
      SET signup_intent = ${intent}, updated_at = NOW()
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
