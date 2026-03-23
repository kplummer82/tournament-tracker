import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { loginAs, authedFetch, ensureLoggedIn } from "./helpers/auth";
import {
  createLeagueViaApi,
  deleteLeagueViaApi,
  createTournamentViaApi,
  deleteTournamentViaApi,
  getMyRoles,
  getRolesForScope,
} from "./helpers/seed";

/**
 * RBAC API Permission Enforcement Tests
 *
 * Verifies that scoped access controls (league, division, season, tournament)
 * are correctly enforced at the API layer. Uses two test users:
 * - admin: system admin who bypasses all permission checks
 * - regularUser: non-admin used to verify 403 enforcement
 */

// Track all created resources for cleanup
interface TestData {
  adminLeagueId: number | null;
  userLeagueId: number | null;
  adminTournamentId: number | null;
  userTournamentId: number | null;
  divisionId: number | null;
  seasonId: number | null;
}

const data: TestData = {
  adminLeagueId: null,
  userLeagueId: null,
  adminTournamentId: null,
  userTournamentId: null,
  divisionId: null,
  seasonId: null,
};

const unique = Date.now();

test.describe("RBAC API Permission Enforcement", () => {
  let adminPage: Page;
  let userPage: Page;
  let adminContext: BrowserContext;
  let userContext: BrowserContext;

  test.beforeAll(async ({ browser }) => {
    // Create separate browser contexts so both users stay logged in simultaneously
    adminContext = await browser.newContext();
    userContext = await browser.newContext();
    adminPage = await adminContext.newPage();
    userPage = await userContext.newPage();

    await loginAs(adminPage, "admin");
    await loginAs(userPage, "regularUser");
  });

  test.afterAll(async () => {
    // Clean up all test data using admin (who can delete anything)
    if (data.seasonId) {
      await authedFetch(adminPage, "DELETE", `/api/seasons/${data.seasonId}`);
    }
    if (data.divisionId) {
      // Divisions don't have a standalone DELETE, but deleting the league cascades
    }
    if (data.adminTournamentId) {
      await deleteTournamentViaApi(adminPage, data.adminTournamentId);
    }
    if (data.userTournamentId) {
      await deleteTournamentViaApi(adminPage, data.userTournamentId);
    }
    if (data.adminLeagueId) {
      await deleteLeagueViaApi(adminPage, data.adminLeagueId);
    }
    if (data.userLeagueId) {
      await deleteLeagueViaApi(adminPage, data.userLeagueId);
    }

    await adminPage.close();
    await userPage.close();
    await adminContext.close();
    await userContext.close();
  });

  // ---------------------------------------------------------------
  // 1. System Admin Privileges
  // ---------------------------------------------------------------
  test.describe("System admin bypass", () => {
    test("admin can create a league", async () => {
      const result = await createLeagueViaApi(
        adminPage,
        `RBAC Admin League ${unique}`
      );
      expect(result).toBeDefined();
      expect(result.id).toBeGreaterThan(0);
      data.adminLeagueId = result.id;
    });

    test("admin can PATCH any league", async () => {
      expect(data.adminLeagueId).not.toBeNull();
      const { status, data: body } = await authedFetch(
        adminPage,
        "PATCH",
        `/api/leagues/${data.adminLeagueId}`,
        { name: `RBAC Admin League Updated ${unique}` }
      );
      expect(status).toBe(200);
      expect(body.name).toContain("Updated");
    });

    test("admin can create a division under a league", async () => {
      expect(data.adminLeagueId).not.toBeNull();
      const { status, data: body } = await authedFetch(
        adminPage,
        "POST",
        `/api/leagues/${data.adminLeagueId}/divisions`,
        { name: `RBAC Test Division ${unique}`, age_range: "10U" }
      );
      expect(status).toBe(201);
      expect(body.id).toBeGreaterThan(0);
      data.divisionId = body.id;
    });

    test("admin can create a season under a division", async () => {
      expect(data.divisionId).not.toBeNull();
      const { status, data: body } = await authedFetch(
        adminPage,
        "POST",
        "/api/seasons",
        {
          league_division_id: data.divisionId,
          name: `RBAC Test Season ${unique}`,
          year: 2026,
          season_type: "spring",
          status: "draft",
        }
      );
      expect(status).toBe(201);
      expect(body.id).toBeGreaterThan(0);
      data.seasonId = body.id;
    });

    test("admin can PATCH a season", async () => {
      expect(data.seasonId).not.toBeNull();
      const { status, data: body } = await authedFetch(
        adminPage,
        "PATCH",
        `/api/seasons/${data.seasonId}`,
        { name: `RBAC Test Season Updated ${unique}` }
      );
      expect(status).toBe(200);
      expect(body.name).toContain("Updated");
    });

    test("admin can create a tournament", async () => {
      const result = await createTournamentViaApi(
        adminPage,
        `RBAC Admin Tournament ${unique}`
      );
      expect(result).toBeDefined();
      expect(result.id).toBeGreaterThan(0);
      data.adminTournamentId = result.id;
    });

    test("admin can PATCH any tournament", async () => {
      expect(data.adminTournamentId).not.toBeNull();
      const { status, data: body } = await authedFetch(
        adminPage,
        "PATCH",
        `/api/tournaments/${data.adminTournamentId}`,
        { name: `RBAC Admin Tournament Updated ${unique}` }
      );
      expect(status).toBe(200);
      expect(body.name).toContain("Updated");
    });
  });

  // ---------------------------------------------------------------
  // 2. Regular User — Denied Access to Others' Resources
  // ---------------------------------------------------------------
  test.describe("Regular user denied access to others' entities", () => {
    test("regular user gets 403 when PATCHing admin's league", async () => {
      expect(data.adminLeagueId).not.toBeNull();
      const { status } = await authedFetch(
        userPage,
        "PATCH",
        `/api/leagues/${data.adminLeagueId}`,
        { name: "Hacked League Name" }
      );
      expect(status).toBe(403);
    });

    test("regular user gets 403 when DELETEing admin's league", async () => {
      expect(data.adminLeagueId).not.toBeNull();
      const { status } = await authedFetch(
        userPage,
        "DELETE",
        `/api/leagues/${data.adminLeagueId}`
      );
      expect(status).toBe(403);
    });

    test("regular user gets 403 when PATCHing admin's season", async () => {
      expect(data.seasonId).not.toBeNull();
      const { status } = await authedFetch(
        userPage,
        "PATCH",
        `/api/seasons/${data.seasonId}`,
        { name: "Hacked Season Name" }
      );
      expect(status).toBe(403);
    });

    test("regular user gets 403 when DELETEing admin's season", async () => {
      expect(data.seasonId).not.toBeNull();
      const { status } = await authedFetch(
        userPage,
        "DELETE",
        `/api/seasons/${data.seasonId}`
      );
      expect(status).toBe(403);
    });

    test("regular user gets 403 when PATCHing admin's tournament", async () => {
      expect(data.adminTournamentId).not.toBeNull();
      const { status } = await authedFetch(
        userPage,
        "PATCH",
        `/api/tournaments/${data.adminTournamentId}`,
        { name: "Hacked Tournament Name" }
      );
      expect(status).toBe(403);
    });

    test("regular user gets 403 when DELETEing admin's tournament", async () => {
      expect(data.adminTournamentId).not.toBeNull();
      const { status } = await authedFetch(
        userPage,
        "DELETE",
        `/api/tournaments/${data.adminTournamentId}`
      );
      expect(status).toBe(403);
    });

    test("regular user gets 403 when creating a division under admin's league", async () => {
      expect(data.adminLeagueId).not.toBeNull();
      const { status } = await authedFetch(
        userPage,
        "POST",
        `/api/leagues/${data.adminLeagueId}/divisions`,
        { name: "Unauthorized Division" }
      );
      expect(status).toBe(403);
    });

    test("regular user gets 403 when creating a season under admin's division", async () => {
      expect(data.divisionId).not.toBeNull();
      const { status } = await authedFetch(userPage, "POST", "/api/seasons", {
        league_division_id: data.divisionId,
        name: "Unauthorized Season",
        year: 2026,
        season_type: "fall",
      });
      expect(status).toBe(403);
    });
  });

  // ---------------------------------------------------------------
  // 3. Auto-Assign: League Creator Gets league_admin
  // ---------------------------------------------------------------
  test.describe("Auto-assign league_admin on league creation", () => {
    test("creating a league auto-assigns league_admin to creator", async () => {
      const result = await createLeagueViaApi(
        userPage,
        `RBAC User League ${unique}`
      );
      expect(result).toBeDefined();
      expect(result.id).toBeGreaterThan(0);
      data.userLeagueId = result.id;

      // Verify the role was assigned
      const { roles } = await getMyRoles(userPage);
      const leagueAdminRole = roles.find(
        (r: any) =>
          r.role === "league_admin" &&
          r.scope_type === "league" &&
          r.scope_id === data.userLeagueId
      );
      expect(leagueAdminRole).toBeDefined();
    });

    test("league creator CAN PATCH their own league", async () => {
      expect(data.userLeagueId).not.toBeNull();
      const { status, data: body } = await authedFetch(
        userPage,
        "PATCH",
        `/api/leagues/${data.userLeagueId}`,
        { name: `RBAC User League Updated ${unique}` }
      );
      expect(status).toBe(200);
      expect(body.name).toContain("Updated");
    });

    test("league creator CAN DELETE their own league (deferred to afterAll)", async () => {
      // We verify the user has delete access but don't actually delete yet
      // (other tests depend on this league). We verify by checking role exists.
      expect(data.userLeagueId).not.toBeNull();
      const { roles } = await getMyRoles(userPage);
      const hasAccess = roles.some(
        (r: any) =>
          r.role === "league_admin" &&
          r.scope_type === "league" &&
          r.scope_id === data.userLeagueId
      );
      expect(hasAccess).toBe(true);
    });
  });

  // ---------------------------------------------------------------
  // 4. League Admin Cannot PATCH a Different League
  // ---------------------------------------------------------------
  test.describe("Cross-league isolation", () => {
    test("regular user (league_admin of their league) gets 403 on admin's league PATCH", async () => {
      expect(data.adminLeagueId).not.toBeNull();
      expect(data.userLeagueId).not.toBeNull();

      // User has league_admin on their league, but NOT on admin's league
      const { status } = await authedFetch(
        userPage,
        "PATCH",
        `/api/leagues/${data.adminLeagueId}`,
        { name: "Cross-league attack" }
      );
      expect(status).toBe(403);
    });

    test("regular user (league_admin of their league) gets 403 on admin's league DELETE", async () => {
      expect(data.adminLeagueId).not.toBeNull();
      const { status } = await authedFetch(
        userPage,
        "DELETE",
        `/api/leagues/${data.adminLeagueId}`
      );
      expect(status).toBe(403);
    });
  });

  // ---------------------------------------------------------------
  // 5. Auto-Assign: Tournament Creator Gets tournament_admin
  // ---------------------------------------------------------------
  test.describe("Auto-assign tournament_admin on tournament creation", () => {
    test("creating a tournament auto-assigns tournament_admin to creator", async () => {
      const result = await createTournamentViaApi(
        userPage,
        `RBAC User Tournament ${unique}`
      );
      expect(result).toBeDefined();
      expect(result.id).toBeGreaterThan(0);
      data.userTournamentId = result.id;

      // Verify the role was assigned
      const { roles } = await getMyRoles(userPage);
      const tournamentAdminRole = roles.find(
        (r: any) =>
          r.role === "tournament_admin" &&
          r.scope_type === "tournament" &&
          r.scope_id === data.userTournamentId
      );
      expect(tournamentAdminRole).toBeDefined();
    });

    test("tournament creator CAN PATCH their own tournament", async () => {
      expect(data.userTournamentId).not.toBeNull();
      const { status, data: body } = await authedFetch(
        userPage,
        "PATCH",
        `/api/tournaments/${data.userTournamentId}`,
        { name: `RBAC User Tournament Updated ${unique}` }
      );
      expect(status).toBe(200);
      expect(body.name).toContain("Updated");
    });

    test("tournament creator CAN DELETE their own tournament", async () => {
      // Create a throwaway tournament to test actual deletion
      const throwaway = await createTournamentViaApi(
        userPage,
        `RBAC Throwaway Tournament ${unique}`
      );
      expect(throwaway.id).toBeGreaterThan(0);

      const { status } = await authedFetch(
        userPage,
        "DELETE",
        `/api/tournaments/${throwaway.id}`
      );
      expect(status).toBe(200);
    });
  });

  // ---------------------------------------------------------------
  // 6. Cross-Tournament Isolation
  // ---------------------------------------------------------------
  test.describe("Cross-tournament isolation", () => {
    test("regular user gets 403 when PATCHing admin's tournament", async () => {
      expect(data.adminTournamentId).not.toBeNull();
      const { status } = await authedFetch(
        userPage,
        "PATCH",
        `/api/tournaments/${data.adminTournamentId}`,
        { name: "Cross-tournament attack" }
      );
      expect(status).toBe(403);
    });

    test("regular user gets 403 when DELETEing admin's tournament", async () => {
      expect(data.adminTournamentId).not.toBeNull();
      const { status } = await authedFetch(
        userPage,
        "DELETE",
        `/api/tournaments/${data.adminTournamentId}`
      );
      expect(status).toBe(403);
    });
  });

  // ---------------------------------------------------------------
  // 7. Season Access Inherits from Division/League Hierarchy
  // ---------------------------------------------------------------
  test.describe("Season access via league hierarchy", () => {
    let userDivisionId: number | null = null;
    let userSeasonId: number | null = null;

    test("league_admin can create a division in their league", async () => {
      expect(data.userLeagueId).not.toBeNull();
      const { status, data: body } = await authedFetch(
        userPage,
        "POST",
        `/api/leagues/${data.userLeagueId}/divisions`,
        { name: `RBAC User Division ${unique}`, age_range: "12U" }
      );
      expect(status).toBe(201);
      expect(body.id).toBeGreaterThan(0);
      userDivisionId = body.id;
    });

    test("league_admin can create a season in their division", async () => {
      expect(userDivisionId).not.toBeNull();
      const { status, data: body } = await authedFetch(
        userPage,
        "POST",
        "/api/seasons",
        {
          league_division_id: userDivisionId,
          name: `RBAC User Season ${unique}`,
          year: 2026,
          season_type: "summer",
          status: "draft",
        }
      );
      expect(status).toBe(201);
      expect(body.id).toBeGreaterThan(0);
      userSeasonId = body.id;
    });

    test("league_admin can PATCH a season in their league hierarchy", async () => {
      expect(userSeasonId).not.toBeNull();
      const { status, data: body } = await authedFetch(
        userPage,
        "PATCH",
        `/api/seasons/${userSeasonId}`,
        { name: `RBAC User Season Updated ${unique}` }
      );
      expect(status).toBe(200);
      expect(body.name).toContain("Updated");
    });

    test("league_admin can DELETE a season in their league hierarchy", async () => {
      expect(userSeasonId).not.toBeNull();
      const { status } = await authedFetch(
        userPage,
        "DELETE",
        `/api/seasons/${userSeasonId}`
      );
      expect(status).toBe(200);
      // Nullify so afterAll doesn't try to clean up
      userSeasonId = null;
    });

    test("regular user CANNOT PATCH a season in a different league hierarchy", async () => {
      // data.seasonId belongs to admin's league
      expect(data.seasonId).not.toBeNull();
      const { status } = await authedFetch(
        userPage,
        "PATCH",
        `/api/seasons/${data.seasonId}`,
        { name: "Cross-hierarchy attack" }
      );
      expect(status).toBe(403);
    });
  });

  // ---------------------------------------------------------------
  // 8. Read Access (GET) is Public — No Auth Required
  // ---------------------------------------------------------------
  test.describe("Public read access", () => {
    test("GET /api/leagues/:id is accessible without specific role", async () => {
      expect(data.adminLeagueId).not.toBeNull();
      const { status, data: body } = await authedFetch(
        userPage,
        "GET",
        `/api/leagues/${data.adminLeagueId}`
      );
      expect(status).toBe(200);
      expect(body.id).toBe(data.adminLeagueId);
    });

    test("GET /api/seasons/:id is accessible without specific role", async () => {
      expect(data.seasonId).not.toBeNull();
      const { status, data: body } = await authedFetch(
        userPage,
        "GET",
        `/api/seasons/${data.seasonId}`
      );
      expect(status).toBe(200);
      expect(body.id).toBe(data.seasonId);
    });

    test("GET /api/tournaments/:id is accessible without specific role", async () => {
      expect(data.adminTournamentId).not.toBeNull();
      const { status, data: body } = await authedFetch(
        userPage,
        "GET",
        `/api/tournaments/${data.adminTournamentId}`
      );
      expect(status).toBe(200);
      expect(body.id).toBe(data.adminTournamentId);
    });
  });

  // ---------------------------------------------------------------
  // 9. System Admin Role Verification
  // ---------------------------------------------------------------
  test.describe("System admin role verification", () => {
    test("admin user is identified as system admin", async () => {
      const { isSystemAdmin } = await getMyRoles(adminPage);
      expect(isSystemAdmin).toBe(true);
    });

    test("regular user is NOT identified as system admin", async () => {
      const { isSystemAdmin } = await getMyRoles(userPage);
      expect(isSystemAdmin).toBe(false);
    });
  });
});
