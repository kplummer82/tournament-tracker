import type { GetServerSideProps } from "next";
import { getSessionForRequest } from "@/lib/auth/server";
import {
  ensureUserProfile,
  getUserStatus,
  getUserSignupIntent,
  setUserSignupIntent,
} from "@/lib/auth/profile";
import { isValidSignupIntent } from "@/lib/auth/permissions";
import { postSignupRedirect } from "@/lib/auth/postSignupRedirect";

/**
 * Landing point after a Google/social sign-in (set as the OAuth `callbackURL`).
 * Runs entirely in getServerSideProps and always redirects — never renders — so
 * it behaves like the tail end of the email signup flow:
 *   - seeds an approval-aware user_profiles row (OAuth skips the email sign-up
 *     path that normally creates it, so without this the approval gate + MFA
 *     would be bypassed via the "no row = active" posture);
 *   - persists the persona the user picked before the Google handoff;
 *   - routes by status/intent the same way postSignupRedirect does for email.
 */

function safeNext(value: unknown): string | null {
  const next = Array.isArray(value) ? value[0] : value;
  if (typeof next !== "string") return null;
  // Same-origin absolute paths only (mirrors login.tsx's callbackUrl guard).
  if (!next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

export const getServerSideProps: GetServerSideProps = async ({ req, query }) => {
  const session = await getSessionForRequest(req as never);
  if (!session?.user) {
    // OAuth didn't establish a session — back to login.
    return { redirect: { destination: "/login?error=oauth", permanent: false } };
  }
  const userId = session.user.id;

  // Seed the profile row (approval-aware) for brand-new OAuth users.
  try {
    await ensureUserProfile(userId);
  } catch {
    /* best-effort — getUserStatus falls back to "active" if the row is missing */
  }

  // Persist the pre-Google persona pick, but never clobber a returning user's.
  const rawIntent = Array.isArray(query.intent) ? query.intent[0] : query.intent;
  const existingIntent = await getUserSignupIntent(userId);
  if (!existingIntent && isValidSignupIntent(rawIntent)) {
    try {
      await setUserSignupIntent(userId, rawIntent);
    } catch {
      /* non-fatal */
    }
  }
  const effectiveIntent = existingIntent ?? (isValidSignupIntent(rawIntent) ? rawIntent : null);

  const status = await getUserStatus(userId);

  // Awaiting approval → the single canonical pending screen (same as email).
  if (status === "inactive") {
    return { redirect: { destination: "/welcome/pending", permanent: false } };
  }

  // Active → an explicit post-login target if given (returning users from
  // /login), otherwise route by persona like the email signup flow.
  const next = safeNext(query.next);
  const destination = next ?? postSignupRedirect(effectiveIntent, "active");
  return { redirect: { destination, permanent: false } };
};

// Never reached — getServerSideProps always redirects.
export default function OAuthComplete() {
  return null;
}
