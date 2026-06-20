import { randomBytes } from "crypto";
import type { AppRole, ScopeType, SignupIntent } from "@/lib/auth/permissions";
import { getDivisionAncestry } from "@/lib/auth/permissions";

/**
 * Server-only invite helpers. Imported by the invite API routes only — do NOT
 * import this from a client component (it pulls in `crypto`).
 */

/** URL-safe, hard-to-guess invite token (~32 chars). */
export function generateInviteToken(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * The signup-picker intent to pre-fill for a given role being granted. Intent is
 * just a UX hint on the signup form; the actual grant is driven by the role.
 */
export function intentForRole(role: AppRole): SignupIntent {
  switch (role) {
    case "league_admin":
    case "division_admin":
      return "league_operator";
    case "tournament_admin":
      return "tournament_organizer";
    case "team_manager":
      return "coach";
    case "team_parent":
      return "follower";
  }
}

/**
 * Where to land a user after they accept an invite — the page for the scope they
 * were just granted access to.
 */
export async function scopeRedirectPath(
  scopeType: ScopeType,
  scopeId: number
): Promise<string> {
  switch (scopeType) {
    case "team":
      return `/teams/${scopeId}`;
    case "league":
      return `/leagues/${scopeId}`;
    case "tournament":
      return `/tournaments/${scopeId}/overview`;
    case "division": {
      const ancestry = await getDivisionAncestry(scopeId);
      return ancestry
        ? `/leagues/${ancestry.league_id}/divisions/${scopeId}`
        : "/leagues";
    }
    default:
      return "/";
  }
}
