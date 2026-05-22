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
 *   follower | /find or /tournaments         | /login?registered=1
 *   coach    | /welcome/coach                | /welcome/coach (banner)
 *   league_operator       | /leagues/new      | /welcome/pending
 *   tournament_organizer  | /tournaments/new  | /welcome/pending
 *   null    | /                              | /login?registered=1
 */
export function postSignupRedirect(
  intent: SignupIntent | null,
  status: "active" | "inactive",
  options: PostSignupRedirectOptions = {}
): string {
  const { findPageExists = false } = options;

  if (intent === "follower") {
    if (status === "inactive") return "/login?registered=1";
    return findPageExists ? "/find" : "/tournaments";
  }

  if (intent === "coach") {
    // Coach welcome page handles both active and inactive cases internally
    return "/welcome/coach";
  }

  if (intent === "league_operator") {
    return status === "inactive" ? "/welcome/pending" : "/leagues/new";
  }

  if (intent === "tournament_organizer") {
    return status === "inactive" ? "/welcome/pending" : "/tournaments/new";
  }

  // Unknown intent (null / older signup / write failed) — fall back
  return status === "inactive" ? "/login?registered=1" : "/";
}
