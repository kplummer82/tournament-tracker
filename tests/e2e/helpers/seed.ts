// tests/e2e/helpers/seed.ts
// Test data setup and teardown for RBAC E2E tests.
// Uses the page's authenticated session to create/clean test data via API.
import { type Page } from "@playwright/test";
import { authedFetch } from "./auth";

/**
 * Assign a role to a user via the API.
 */
export async function assignRoleViaApi(
  page: Page,
  userId: string,
  role: string,
  scopeType: string,
  scopeId: number
): Promise<{ id: number } | null> {
  const { status, data } = await authedFetch(page, "POST", "/api/admin/roles", {
    userId,
    role,
    scopeType,
    scopeId,
  });
  if (status === 201) return data.role;
  if (status === 409) return null; // already assigned
  throw new Error(`Failed to assign role: ${data.error || status}`);
}

/**
 * Revoke a role assignment by its ID.
 */
export async function revokeRoleViaApi(
  page: Page,
  roleId: number
): Promise<void> {
  const { status, data } = await authedFetch(page, "DELETE", `/api/admin/roles/${roleId}`);
  if (status !== 200) {
    throw new Error(`Failed to revoke role ${roleId}: ${data.error || status}`);
  }
}

/**
 * Get all roles for a specific scope.
 */
export async function getRolesForScope(
  page: Page,
  scopeType: string,
  scopeId: number
): Promise<any[]> {
  const { status, data } = await authedFetch(
    page,
    "GET",
    `/api/admin/roles?scope_type=${scopeType}&scope_id=${scopeId}`
  );
  if (status !== 200) return [];
  return data.roles ?? [];
}

/**
 * Get the current user's roles.
 */
export async function getMyRoles(page: Page): Promise<{
  isSystemAdmin: boolean;
  roles: any[];
}> {
  const { status, data } = await authedFetch(page, "GET", "/api/me/roles");
  if (status !== 200) return { isSystemAdmin: false, roles: [] };
  return { isSystemAdmin: data.isSystemAdmin ?? false, roles: data.roles ?? [] };
}

/**
 * Create a league via API. Returns the league object.
 */
export async function createLeagueViaApi(
  page: Page,
  name: string
): Promise<any> {
  const { status, data } = await authedFetch(page, "POST", "/api/leagues", { name });
  if (status !== 201 && status !== 200) {
    throw new Error(`Failed to create league: ${data.error || status}`);
  }
  return data;
}

/**
 * Delete a league via API.
 */
export async function deleteLeagueViaApi(
  page: Page,
  leagueId: number
): Promise<void> {
  await authedFetch(page, "DELETE", `/api/leagues/${leagueId}`);
}

/**
 * Create a tournament via API. Returns the tournament object.
 */
export async function createTournamentViaApi(
  page: Page,
  name: string,
  year: number = 2026
): Promise<any> {
  const { status, data } = await authedFetch(page, "POST", "/api/tournaments", {
    name,
    year,
    divisionid: 1, // assumes a default division exists
    statusid: 1,
    visibilityid: 1,
  });
  if (status !== 201 && status !== 200) {
    throw new Error(`Failed to create tournament: ${data.error || status}`);
  }
  return data;
}

/**
 * Delete a tournament via API.
 */
export async function deleteTournamentViaApi(
  page: Page,
  tournamentId: number
): Promise<void> {
  await authedFetch(page, "DELETE", `/api/tournaments/${tournamentId}`);
}
