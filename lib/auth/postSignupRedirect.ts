import type { SignupIntent } from "./permissions";

export interface PostSignupRedirectOptions {
  /**
   * Set to true once the unified "find what to follow" page (gap F3) ships.
   * Until then, Follower lands on /tournaments which is the closest existing
   * surface.
   */
  findPageExists?: boolean;
}

/**
 * Decide where to send a user immediately after their signup completes.
 *
 *   intent  | status='active'                | status='inactive'
 *  ---------|--------------------------------|---------------------------
 *   follower | /find or /tournaments         | /welcome/pending
 *   coach    | /welcome/coach                | /welcome/pending
 *   league_operator       | /leagues/new      | /welcome/pending
 *   tournament_organizer  | /tournaments/new  | /welcome/pending
 *   null    | /                              | /welcome/pending
 *
 * Any inactive (awaiting-approval) user — regardless of persona — lands on the
 * single canonical /welcome/pending screen, which renders the exact same
 * component AuthGate shows on later visits. This is what keeps the message
 * consistent between "right after signup" and "navigate back before approval".
 */
export function postSignupRedirect(
  intent: SignupIntent | null,
  status: "active" | "inactive",
  options: PostSignupRedirectOptions = {}
): string {
  const { findPageExists = false } = options;

  // Awaiting approval — one screen for everyone.
  if (status === "inactive") return "/welcome/pending";

  if (intent === "follower") {
    return findPageExists ? "/find" : "/tournaments";
  }

  if (intent === "coach") {
    return "/welcome/coach";
  }

  if (intent === "league_operator") {
    return "/leagues/new";
  }

  if (intent === "tournament_organizer") {
    return "/tournaments/new";
  }

  // Unknown intent (null / older signup / write failed) — fall back
  return "/";
}
