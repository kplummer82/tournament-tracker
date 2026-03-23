import { sql } from "@/lib/db";

// --------------- Types ---------------

export type AppRole =
  | "league_admin"
  | "division_admin"
  | "tournament_admin"
  | "team_manager"
  | "team_parent";

export type ScopeType = "league" | "division" | "tournament" | "team";

export interface UserRoleRow {
  id: number;
  role: AppRole;
  scope_type: ScopeType;
  scope_id: number;
}

/** Valid role-to-scope mappings */
const ROLE_SCOPE_MAP: Record<AppRole, ScopeType> = {
  league_admin: "league",
  division_admin: "division",
  tournament_admin: "tournament",
  team_manager: "team",
  team_parent: "team",
};

export const VALID_ROLES: AppRole[] = Object.keys(ROLE_SCOPE_MAP) as AppRole[];
export const VALID_SCOPES: ScopeType[] = ["league", "division", "tournament", "team"];

export function isValidRoleScopeMapping(role: string, scopeType: string): boolean {
  return ROLE_SCOPE_MAP[role as AppRole] === scopeType;
}

// --------------- Role Queries ---------------

export async function getUserRoles(userId: string): Promise<UserRoleRow[]> {
  const rows = await sql`
    SELECT id, role, scope_type, scope_id
    FROM user_roles
    WHERE user_id = ${userId}
  `;
  return rows as UserRoleRow[];
}

export async function assignRole(
  userId: string,
  role: AppRole,
  scopeType: ScopeType,
  scopeId: number,
  createdBy: string
): Promise<UserRoleRow> {
  const rows = await sql`
    INSERT INTO user_roles (user_id, role, scope_type, scope_id, created_by)
    VALUES (${userId}, ${role}, ${scopeType}, ${scopeId}, ${createdBy})
    ON CONFLICT (user_id, role, scope_type, scope_id) DO NOTHING
    RETURNING id, role, scope_type, scope_id
  `;
  return rows[0] as UserRoleRow;
}

export async function revokeRole(roleId: number): Promise<boolean> {
  const rows = await sql`
    DELETE FROM user_roles WHERE id = ${roleId}
    RETURNING id
  `;
  return rows.length > 0;
}

// --------------- Ancestry Resolution ---------------

export interface SeasonAncestry {
  league_id: number;
  division_id: number;
}

export async function getSeasonAncestry(seasonId: number): Promise<SeasonAncestry | null> {
  const rows = await sql`
    SELECT ld.league_id, s.league_division_id AS division_id
    FROM seasons s
    JOIN league_divisions ld ON ld.id = s.league_division_id
    WHERE s.id = ${seasonId}
  `;
  return (rows[0] as SeasonAncestry) ?? null;
}

export async function getDivisionAncestry(divisionId: number): Promise<{ league_id: number } | null> {
  const rows = await sql`
    SELECT league_id FROM league_divisions WHERE id = ${divisionId}
  `;
  return (rows[0] as { league_id: number }) ?? null;
}

export interface TeamAncestry {
  league_id: number | null;
  league_division_id: number | null;
  created_by: string | null;
}

export async function getTeamAncestry(teamId: number): Promise<TeamAncestry | null> {
  const rows = await sql`
    SELECT league_id, league_division_id, created_by
    FROM teams
    WHERE teamid = ${teamId}
  `;
  return (rows[0] as TeamAncestry) ?? null;
}

// --------------- Access Check Functions ---------------

export function hasLeagueAccess(roles: UserRoleRow[], leagueId: number): boolean {
  return roles.some(
    (r) => r.role === "league_admin" && r.scope_type === "league" && r.scope_id === leagueId
  );
}

export function hasDivisionAccess(
  roles: UserRoleRow[],
  divisionId: number,
  leagueId: number
): boolean {
  return roles.some(
    (r) =>
      (r.role === "league_admin" && r.scope_type === "league" && r.scope_id === leagueId) ||
      (r.role === "division_admin" && r.scope_type === "division" && r.scope_id === divisionId)
  );
}

export function hasSeasonAccess(
  roles: UserRoleRow[],
  divisionId: number,
  leagueId: number
): boolean {
  // Same as division access — no separate season-level role
  return hasDivisionAccess(roles, divisionId, leagueId);
}

export function hasTournamentAccess(roles: UserRoleRow[], tournamentId: number): boolean {
  return roles.some(
    (r) =>
      r.role === "tournament_admin" && r.scope_type === "tournament" && r.scope_id === tournamentId
  );
}

export function hasTeamAccess(
  roles: UserRoleRow[],
  teamId: number,
  leagueId: number | null,
  divisionId: number | null
): boolean {
  return roles.some(
    (r) =>
      (r.role === "team_manager" && r.scope_type === "team" && r.scope_id === teamId) ||
      (leagueId != null &&
        r.role === "league_admin" &&
        r.scope_type === "league" &&
        r.scope_id === leagueId) ||
      (divisionId != null &&
        r.role === "division_admin" &&
        r.scope_type === "division" &&
        r.scope_id === divisionId)
  );
}

// --------------- Role Assignment Authorization ---------------

/**
 * Can a user with `assignerRoles` assign `targetRole` scoped to `targetScopeType:targetScopeId`?
 *
 * Rules:
 * - League admin can assign division_admin or team_manager within their league
 * - Division admin can assign team_manager within their division
 * - Tournament admin can assign tournament_admin to their tournament
 * - Team manager cannot assign roles
 */
export async function canAssignRole(
  assignerRoles: UserRoleRow[],
  targetRole: AppRole,
  targetScopeType: ScopeType,
  targetScopeId: number
): Promise<boolean> {
  if (targetRole === "division_admin" && targetScopeType === "division") {
    // Need league_admin on the parent league
    const ancestry = await getDivisionAncestry(targetScopeId);
    if (!ancestry) return false;
    return hasLeagueAccess(assignerRoles, ancestry.league_id);
  }

  if (targetRole === "team_manager" && targetScopeType === "team") {
    // Need league_admin on team's league OR division_admin on team's division
    const teamAncestry = await getTeamAncestry(targetScopeId);
    if (!teamAncestry) return false;
    if (teamAncestry.league_id && hasLeagueAccess(assignerRoles, teamAncestry.league_id)) return true;
    if (teamAncestry.league_division_id) {
      const divAncestry = await getDivisionAncestry(teamAncestry.league_division_id);
      if (divAncestry && hasDivisionAccess(assignerRoles, teamAncestry.league_division_id, divAncestry.league_id)) return true;
    }
    // Also allow if they're team_manager on this team (can delegate)
    return hasTeamAccess(assignerRoles, targetScopeId, teamAncestry.league_id, teamAncestry.league_division_id);
  }

  if (targetRole === "tournament_admin" && targetScopeType === "tournament") {
    // Need tournament_admin on the same tournament
    return hasTournamentAccess(assignerRoles, targetScopeId);
  }

  if (targetRole === "league_admin" && targetScopeType === "league") {
    // Only system admins can assign league_admin — handled at the API layer
    return false;
  }

  return false;
}
