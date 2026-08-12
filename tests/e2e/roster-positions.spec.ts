import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { apiLogin, authedFetch } from "./helpers/auth";
import {
  assignRoleViaApi,
  createTeamViaApi,
  deleteTeamViaApi,
  getRolesForScope,
  revokeRoleViaApi,
} from "./helpers/seed";

/**
 * Per-coach roster position ratings.
 *
 * Three things are locked in here:
 *
 * 1. Access. Position ratings are coaching evaluations — staff only, on read as
 *    well as write. Before this feature the PUT had no auth guard at all, so any
 *    authenticated user could rewrite any team's ratings. Both the team-wide and
 *    per-player routes must 403 a non-owner.
 * 2. Read and write are different bars. Every kind of admin may read, but only a
 *    `team_manager` of the team may author — a system admin with no role on the
 *    team gets 200 on GET and 403 on PUT. This is the one place in the app where
 *    a system admin is deliberately NOT a superuser, so it needs a test.
 * 3. Authorship + consensus. Each coach's set is independent; the consensus view
 *    resolves by majority and flags ties rather than silently picking a winner.
 *
 * A non-admin (regularUser) is required for the non-staff cases — system admins
 * bypass the scoped read guard, so an admin session proves nothing there.
 */

const unique = Date.now();

const data: {
  adminTeamId: number | null;
  adminRosterId: number | null;
  userId: string | null;
  grantedRoleId: number | null;
} = { adminTeamId: null, adminRosterId: null, userId: null, grantedRoleId: null };

// Don't load the saved storageState (tests/auth-state.json) — this spec signs in
// fresh via apiLogin in its own contexts, and the file isn't present in CI.
test.use({ storageState: { cookies: [], origins: [] } });

// Serial: the suite shares fixtures created once in beforeAll, later tests build
// on earlier writes, and concurrent sign-ins trip Better Auth's per-IP rate limit.
test.describe.configure({ mode: "serial" });

async function currentUserId(page: Page): Promise<string> {
  const { data: session } = await authedFetch(page, "GET", "/api/auth/get-session");
  const id = session?.user?.id;
  if (!id) throw new Error("Could not read the signed-in user id");
  return String(id);
}

async function putPositions(
  page: Page,
  teamId: number,
  rosterId: number,
  positions: { position: string; priority: string }[]
) {
  return authedFetch(page, "PUT", `/api/teams/${teamId}/roster/${rosterId}/positions`, { positions });
}

/** position → priority, for one player, from a team-wide or per-player payload. */
function priorityOf(payload: { positions: { position: string; priority: string }[] }, position: string) {
  return payload.positions.find((p) => p.position === position)?.priority ?? null;
}

test.describe("Roster positions: access + per-coach consensus", () => {
  let adminPage: Page;
  let userPage: Page;
  let adminContext: BrowserContext;
  let userContext: BrowserContext;

  test.beforeAll(async ({ browser }) => {
    adminContext = await browser.newContext();
    userContext = await browser.newContext();
    adminPage = await adminContext.newPage();
    userPage = await userContext.newPage();
    await apiLogin(adminPage, "admin");
    await apiLogin(userPage, "regularUser");

    data.userId = await currentUserId(userPage);

    // Admin owns this team; regularUser has no role on it (yet).
    data.adminTeamId = await createTeamViaApi(adminPage, `Positions Team ${unique}`);
    const { status, data: player } = await authedFetch(
      adminPage,
      "POST",
      `/api/teams/${data.adminTeamId}/roster`,
      { first_name: "Pos", last_name: `Probe ${unique}`, role: "player" }
    );
    expect(status).toBe(201);
    data.adminRosterId = player.id;
  });

  test.afterAll(async () => {
    if (data.grantedRoleId) await revokeRoleViaApi(adminPage, data.grantedRoleId).catch(() => {});
    if (data.adminTeamId) await deleteTeamViaApi(adminPage, data.adminTeamId);
    await adminPage.close();
    await userPage.close();
    await adminContext.close();
    await userContext.close();
  });

  // ── Non-staff is blocked (403) ────────────────────────────────────────────
  test("non-staff gets 403 reading a team's position ratings", async () => {
    const { status } = await authedFetch(
      userPage,
      "GET",
      `/api/teams/${data.adminTeamId}/roster/positions`
    );
    expect(status).toBe(403);
  });

  test("non-staff gets 403 reading one player's position ratings", async () => {
    const { status } = await authedFetch(
      userPage,
      "GET",
      `/api/teams/${data.adminTeamId}/roster/${data.adminRosterId}/positions`
    );
    expect(status).toBe(403);
  });

  test("non-staff gets 403 writing a player's position ratings", async () => {
    const { status } = await putPositions(userPage, data.adminTeamId!, data.adminRosterId!, [
      { position: "1B", priority: "primary" },
    ]);
    expect(status).toBe(403);
  });

  // ── Staff can read and write ──────────────────────────────────────────────
  test("granting team_manager opens up read and write", async () => {
    const role = await assignRoleViaApi(adminPage, data.userId!, "team_manager", "team", data.adminTeamId!);
    data.grantedRoleId = role?.id ?? null;

    const read = await authedFetch(userPage, "GET", `/api/teams/${data.adminTeamId}/roster/positions`);
    expect(read.status).toBe(200);
    expect(read.data.canAuthor).toBe(true);

    const write = await putPositions(userPage, data.adminTeamId!, data.adminRosterId!, [
      { position: "C", priority: "secondary" },
      { position: "SS", priority: "primary" },
    ]);
    expect(write.status).toBe(200);
  });

  // ── Admins read, coaches write ────────────────────────────────────────────
  test("a system admin without team_manager can read but not author", async () => {
    // The admin got team_manager automatically by creating the team. Strip it
    // so only the system-admin role remains — the exact shape of an org admin
    // looking at a team they don't coach.
    const adminId = await currentUserId(adminPage);
    const roles = await getRolesForScope(adminPage, "team", data.adminTeamId!);
    const own = roles.find((r) => r.user_id === adminId && r.role === "team_manager");
    expect(own, "admin should have been auto-assigned team_manager on create").toBeTruthy();
    await revokeRoleViaApi(adminPage, own.id);

    try {
      const read = await authedFetch(
        adminPage,
        "GET",
        `/api/teams/${data.adminTeamId}/roster/positions?view=consensus`
      );
      expect(read.status).toBe(200);
      expect(read.data.canAuthor).toBe(false);
      // No phantom "me" author — the picker must not offer "My assignments".
      expect(read.data.authors.some((a: { is_me: boolean }) => a.is_me)).toBe(false);

      const write = await putPositions(adminPage, data.adminTeamId!, data.adminRosterId!, [
        { position: "RF", priority: "primary" },
      ]);
      expect(write.status).toBe(403);

      // Reading one player, including another coach's set, still works.
      const player = await authedFetch(
        adminPage,
        "GET",
        `/api/teams/${data.adminTeamId}/roster/${data.adminRosterId}/positions?view=all`
      );
      expect(player.status).toBe(200);
      expect(player.data.canAuthor).toBe(false);
      expect(player.data.authors.length).toBeGreaterThan(0);
    } finally {
      await assignRoleViaApi(adminPage, adminId, "team_manager", "team", data.adminTeamId!);
    }
  });

  test("rejects an unknown position instead of silently dropping it", async () => {
    const { status } = await putPositions(adminPage, data.adminTeamId!, data.adminRosterId!, [
      { position: "QB", priority: "primary" },
    ]);
    expect(status).toBe(400);
  });

  // ── Each coach keeps their own set ────────────────────────────────────────
  test("a second coach's ratings don't overwrite the first's", async () => {
    // Admin (coach 2) disagrees: C is primary, not secondary, and no SS.
    const write = await putPositions(adminPage, data.adminTeamId!, data.adminRosterId!, [
      { position: "C", priority: "primary" },
      { position: "1B", priority: "primary" },
    ]);
    expect(write.status).toBe(200);

    const mine = await authedFetch(
      userPage,
      "GET",
      `/api/teams/${data.adminTeamId}/roster/${data.adminRosterId}/positions?view=mine`
    );
    expect(mine.status).toBe(200);
    expect(priorityOf(mine.data, "C")).toBe("secondary");
    expect(priorityOf(mine.data, "SS")).toBe("primary");
    expect(priorityOf(mine.data, "1B")).toBeNull();
  });

  test("a coach can read another coach's set by author", async () => {
    const adminId = await currentUserId(adminPage);
    const theirs = await authedFetch(
      userPage,
      "GET",
      `/api/teams/${data.adminTeamId}/roster/${data.adminRosterId}/positions?view=author&authorId=${adminId}`
    );
    expect(theirs.status).toBe(200);
    expect(priorityOf(theirs.data, "C")).toBe("primary");
    expect(priorityOf(theirs.data, "1B")).toBe("primary");
    expect(priorityOf(theirs.data, "SS")).toBeNull();
  });

  test("view=author requires an authorId", async () => {
    const { status } = await authedFetch(
      userPage,
      "GET",
      `/api/teams/${data.adminTeamId}/roster/positions?view=author`
    );
    expect(status).toBe(400);
  });

  // ── Consensus: majority wins, ties flagged ────────────────────────────────
  test("consensus flags a priority tie as split and an even inclusion split too", async () => {
    // Two raters. C: one primary + one secondary → tie on priority → split.
    // SS and 1B: one rater each of two → assigned === none → split.
    const { status, data: payload } = await authedFetch(
      userPage,
      "GET",
      `/api/teams/${data.adminTeamId}/roster/${data.adminRosterId}/positions?view=consensus`
    );
    expect(status).toBe(200);
    expect(payload.raters).toBe(2);
    expect(priorityOf(payload, "C")).toBe("split");
    expect(priorityOf(payload, "SS")).toBe("split");
    expect(priorityOf(payload, "1B")).toBe("split");
    expect(payload.tallies.C).toEqual({ primary: 1, secondary: 1, none: 0 });
    expect(payload.tallies.SS).toEqual({ primary: 1, secondary: 0, none: 1 });
  });

  test("consensus resolves to the majority priority once one is ahead", async () => {
    // regularUser switches C to primary: 2 primary, 0 secondary → primary.
    // Dropping SS leaves it 0 of 2 → gone entirely.
    const write = await putPositions(userPage, data.adminTeamId!, data.adminRosterId!, [
      { position: "C", priority: "primary" },
    ]);
    expect(write.status).toBe(200);

    const { data: payload } = await authedFetch(
      userPage,
      "GET",
      `/api/teams/${data.adminTeamId}/roster/${data.adminRosterId}/positions?view=consensus`
    );
    expect(payload.raters).toBe(2);
    expect(priorityOf(payload, "C")).toBe("primary");
    expect(priorityOf(payload, "SS")).toBeNull();
    // 1B is still 1-of-2 → an even split, so it stays flagged rather than hidden.
    expect(priorityOf(payload, "1B")).toBe("split");
  });

  test("view=all returns every author's set plus the roll-up", async () => {
    const adminId = await currentUserId(adminPage);
    const { status, data: payload } = await authedFetch(
      userPage,
      "GET",
      `/api/teams/${data.adminTeamId}/roster/${data.adminRosterId}/positions?view=all`
    );
    expect(status).toBe(200);
    expect(payload.authors.length).toBe(2);
    expect(payload.authors.find((a: { is_me: boolean }) => a.is_me).user_id).toBe(data.userId);
    expect(payload.byAuthor[adminId].map((e: { position: string }) => e.position).sort()).toEqual(["1B", "C"]);
    expect(payload.consensus.raters).toBe(2);
  });

  test("the team-wide route honours the same views", async () => {
    const mine = await authedFetch(
      userPage,
      "GET",
      `/api/teams/${data.adminTeamId}/roster/positions?view=mine`
    );
    expect(mine.status).toBe(200);
    expect(mine.data.positions).toEqual([
      { roster_id: data.adminRosterId, position: "C", priority: "primary" },
    ]);
    // "My assignments" is always selectable, so I'm always in the author list.
    expect(mine.data.authors.some((a: { is_me: boolean }) => a.is_me)).toBe(true);

    const consensus = await authedFetch(
      userPage,
      "GET",
      `/api/teams/${data.adminTeamId}/roster/positions?view=consensus`
    );
    expect(consensus.data.raters[data.adminRosterId!]).toBe(2);
  });

  test("only current coaches of THIS team are voices in the views", async () => {
    // Both coaches have ratings at this point. Revoke regularUser's
    // team_manager and their set must drop out of the picker, the per-author
    // view, and the consensus — the rows survive, they just stop counting,
    // which keeps what's displayed consistent with who can author today.
    expect(data.grantedRoleId).toBeTruthy();
    await revokeRoleViaApi(adminPage, data.grantedRoleId!);

    try {
      const { status, data: payload } = await authedFetch(
        adminPage,
        "GET",
        `/api/teams/${data.adminTeamId}/roster/${data.adminRosterId}/positions?view=all`
      );
      expect(status).toBe(200);
      expect(payload.authors.some((a: { user_id: string }) => a.user_id === data.userId)).toBe(false);
      expect(payload.byAuthor[data.userId!]).toBeUndefined();
      // Was 2 raters with both coaches; the revoked one no longer votes.
      expect(payload.consensus.raters).toBe(1);

      // ...and they can no longer write, which is the point of the rule.
      const write = await putPositions(userPage, data.adminTeamId!, data.adminRosterId!, [
        { position: "LF", priority: "primary" },
      ]);
      expect(write.status).toBe(403);
    } finally {
      const role = await assignRoleViaApi(
        adminPage, data.userId!, "team_manager", "team", data.adminTeamId!
      );
      data.grantedRoleId = role?.id ?? data.grantedRoleId;
    }
  });

  test("re-granting the role brings the coach's existing set back", async () => {
    const { data: payload } = await authedFetch(
      adminPage,
      "GET",
      `/api/teams/${data.adminTeamId}/roster/${data.adminRosterId}/positions?view=all`
    );
    expect(payload.authors.some((a: { user_id: string }) => a.user_id === data.userId)).toBe(true);
    expect(payload.consensus.raters).toBe(2);
  });

  test("clearing a coach's set removes them as a rater", async () => {
    const write = await putPositions(userPage, data.adminTeamId!, data.adminRosterId!, []);
    expect(write.status).toBe(200);
    expect(write.data.positions).toEqual([]);

    const { data: payload } = await authedFetch(
      userPage,
      "GET",
      `/api/teams/${data.adminTeamId}/roster/${data.adminRosterId}/positions?view=consensus`
    );
    // Only the admin still rates this player, so their set IS the consensus.
    expect(payload.raters).toBe(1);
    expect(priorityOf(payload, "C")).toBe("primary");
    expect(priorityOf(payload, "1B")).toBe("primary");
  });
});
