import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { loginAs, authedFetch } from "./helpers/auth";
import {
  createTeamViaApi,
  deleteTeamViaApi,
  createTournamentViaApi,
  deleteTournamentViaApi,
} from "./helpers/seed";

/**
 * IDOR regression tests.
 *
 * Locks in the P0 fix that gated the game-lineup, scrimmage, and tournament
 * team-swap write endpoints with server-side scoped auth. Before the fix, any
 * authenticated user could mutate another team's/tournament's data by changing
 * the id in the request. These endpoints must reject a non-owner with 403.
 *
 * A non-admin (regularUser) is required — system admins intentionally bypass all
 * scoped guards, so an admin session would return 200 and prove nothing.
 */

const unique = Date.now();
// A nonexistent game id — the ownership guard runs before any game lookup, so
// these probes never touch real game data.
const GAME = "season/999999";

const data: { adminTeamId: number | null; adminTournamentId: number | null; userTeamId: number | null } = {
  adminTeamId: null,
  adminTournamentId: null,
  userTeamId: null,
};

test.describe("RBAC: IDOR guards on lineup / scrimmage / swap", () => {
  let adminPage: Page;
  let userPage: Page;
  let adminContext: BrowserContext;
  let userContext: BrowserContext;

  test.beforeAll(async ({ browser }) => {
    adminContext = await browser.newContext();
    userContext = await browser.newContext();
    adminPage = await adminContext.newPage();
    userPage = await userContext.newPage();
    await loginAs(adminPage, "admin");
    await loginAs(userPage, "regularUser");

    // Admin owns these; regularUser must NOT be able to touch them.
    data.adminTeamId = await createTeamViaApi(adminPage, `IDOR Admin Team ${unique}`);
    data.adminTournamentId = (await createTournamentViaApi(adminPage, `IDOR Admin Tournament ${unique}`)).id;
    // regularUser owns this (auto team_manager) — the positive control.
    data.userTeamId = await createTeamViaApi(userPage, `IDOR User Team ${unique}`);
  });

  test.afterAll(async () => {
    // Admin can delete anything created here.
    if (data.adminTournamentId) await deleteTournamentViaApi(adminPage, data.adminTournamentId);
    if (data.adminTeamId) await deleteTeamViaApi(adminPage, data.adminTeamId);
    if (data.userTeamId) await deleteTeamViaApi(adminPage, data.userTeamId);
    await adminPage.close();
    await userPage.close();
    await adminContext.close();
    await userContext.close();
  });

  // ── Non-owner is blocked (403) ────────────────────────────────────────────
  test("regular user gets 403 writing another team's batting order", async () => {
    const { status } = await authedFetch(userPage, "PUT", `/api/games/${GAME}/batting-order`, {
      team_id: data.adminTeamId,
      order: [],
    });
    expect(status).toBe(403);
  });

  test("regular user gets 403 writing another team's defensive lineup", async () => {
    const { status } = await authedFetch(userPage, "PUT", `/api/games/${GAME}/defensive-lineup`, {
      team_id: data.adminTeamId,
      lineup: [],
    });
    expect(status).toBe(403);
  });

  test("regular user gets 403 writing another team's confirmations", async () => {
    const { status } = await authedFetch(userPage, "PUT", `/api/games/${GAME}/confirmations`, {
      team_id: data.adminTeamId,
      confirmations: [],
    });
    expect(status).toBe(403);
  });

  test("regular user gets 403 writing another team's lineup rules", async () => {
    const { status } = await authedFetch(userPage, "PUT", `/api/games/${GAME}/lineup-rules`, {
      team_id: data.adminTeamId,
      rules: {},
    });
    expect(status).toBe(403);
  });

  test("regular user gets 403 creating a scrimmage for another team", async () => {
    const { status } = await authedFetch(userPage, "POST", `/api/teams/${data.adminTeamId}/scrimmages`, {
      opponent_name: "IDOR probe",
    });
    expect(status).toBe(403);
  });

  test("regular user gets 403 editing another team's scrimmage", async () => {
    const { status } = await authedFetch(
      userPage,
      "PATCH",
      `/api/teams/${data.adminTeamId}/scrimmages/1`,
      { opponent_name: "IDOR probe" }
    );
    expect(status).toBe(403);
  });

  test("regular user gets 403 deleting another team's scrimmage", async () => {
    const { status } = await authedFetch(
      userPage,
      "DELETE",
      `/api/teams/${data.adminTeamId}/scrimmages/1`
    );
    expect(status).toBe(403);
  });

  test("regular user gets 403 swapping teams in another's tournament", async () => {
    const { status } = await authedFetch(
      userPage,
      "POST",
      `/api/tournaments/${data.adminTournamentId}/teams/999/swap`,
      { newTeamId: 998 }
    );
    expect(status).toBe(403);
  });

  // ── Owner is still allowed (not 403/401) — proves the guard isn't blanket-deny ──
  test("team manager CAN write their own team's batting order", async () => {
    const { status } = await authedFetch(userPage, "PUT", `/api/games/${GAME}/batting-order`, {
      team_id: data.userTeamId,
      order: [],
    });
    expect(status).toBe(200);
  });
});
