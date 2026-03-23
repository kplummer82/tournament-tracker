import { test, expect } from "@playwright/test";
import { loginAs, authedFetch, ensureLoggedIn } from "./helpers/auth";
import {
  getMyRoles,
  createLeagueViaApi,
  deleteLeagueViaApi,
  createTournamentViaApi,
  deleteTournamentViaApi,
} from "./helpers/seed";

/**
 * Tests for the creator-becomes-admin auto-assign pattern.
 * When a user creates a league or tournament, they should automatically
 * receive the corresponding admin role for that entity.
 */
test.describe("RBAC: Creator auto-assign", () => {
  let createdLeagueId: number | null = null;
  let createdTournamentId: number | null = null;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await loginAs(page, "regularUser");
    // Store state for subsequent tests
    await page.context().storageState({ path: "tests/e2e/.auth-regular.json" });
    await page.close();
  });

  test.afterAll(async ({ browser }) => {
    // Clean up created entities using admin account
    const page = await browser.newPage();
    await loginAs(page, "admin");

    if (createdLeagueId) {
      await deleteLeagueViaApi(page, createdLeagueId).catch(() => {});
    }
    if (createdTournamentId) {
      await deleteTournamentViaApi(page, createdTournamentId).catch(() => {});
    }

    await page.close();
  });

  test("creating a league auto-assigns league_admin role", async ({ page }) => {
    await loginAs(page, "regularUser");

    const uniqueName = `E2E Auto League ${Date.now()}`;
    const league = await createLeagueViaApi(page, uniqueName);
    createdLeagueId = league.id ?? league.league?.id ?? null;
    expect(createdLeagueId).toBeTruthy();

    // Verify the creator got league_admin role
    const { roles } = await getMyRoles(page);
    const leagueAdminRole = roles.find(
      (r: any) =>
        r.role === "league_admin" &&
        r.scope_type === "league" &&
        Number(r.scope_id) === createdLeagueId
    );
    expect(leagueAdminRole).toBeTruthy();
  });

  test("creating a tournament auto-assigns tournament_admin role", async ({
    page,
  }) => {
    await loginAs(page, "regularUser");

    const uniqueName = `E2E Auto Tournament ${Date.now()}`;
    const tournament = await createTournamentViaApi(page, uniqueName);
    createdTournamentId =
      tournament.id ?? tournament.tournament?.id ?? null;
    expect(createdTournamentId).toBeTruthy();

    // Verify the creator got tournament_admin role
    const { roles } = await getMyRoles(page);
    const tournamentAdminRole = roles.find(
      (r: any) =>
        r.role === "tournament_admin" &&
        r.scope_type === "tournament" &&
        Number(r.scope_id) === createdTournamentId
    );
    expect(tournamentAdminRole).toBeTruthy();
  });

  test("creator can PATCH their own league (not 403)", async ({ page }) => {
    test.skip(!createdLeagueId, "No league was created in a prior test");

    await loginAs(page, "regularUser");

    const { status } = await authedFetch(
      page,
      "PATCH",
      `/api/leagues/${createdLeagueId}`,
      { name: `E2E Auto League Updated ${Date.now()}` }
    );

    // Should succeed — not blocked by RBAC
    expect(status).not.toBe(403);
    expect(status).toBeLessThan(400);
  });

  test("creator can PATCH their own tournament (not 403)", async ({ page }) => {
    test.skip(!createdTournamentId, "No tournament was created in a prior test");

    await loginAs(page, "regularUser");

    const { status } = await authedFetch(
      page,
      "PATCH",
      `/api/tournaments/${createdTournamentId}`,
      { name: `E2E Auto Tournament Updated ${Date.now()}` }
    );

    // Should succeed — not blocked by RBAC
    expect(status).not.toBe(403);
    expect(status).toBeLessThan(400);
  });
});
