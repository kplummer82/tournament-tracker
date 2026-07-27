import { test, expect, request as playwrightRequest, type APIRequestContext } from "@playwright/test";
import { TEST_USERS } from "./helpers/auth";
import { signUpWithIntent, cleanupTestUser } from "./helpers/signup";

/**
 * Hardened-enrollment coverage (approval mode). Verifies the three guarantees
 * the enrollment work added:
 *   1. A pending user sees the SAME "Pending Approval" screen right after signup
 *      (/welcome/pending) and on navigate-back (AuthGate on any page).
 *   2. Admin approval flips the user to active and opens access.
 *   3. An invite addressed to a still-pending user is auto-accepted on approval
 *      (role granted, invite no longer pending) — the invitee never has to
 *      revisit the link.
 *
 * One signup total, so it stays clear of Better Auth's per-IP signup rate limit.
 */

// Fresh, unauthenticated context — the default storageState is a logged-in user.
test.use({ storageState: { cookies: [], origins: [] } });

// Local-only: relies on the dev auth proxy + admin fixture + a mutable global
// approval setting. Not for the deployed ldqa project.
test.beforeEach(({}, testInfo) => {
  test.skip(
    testInfo.project.name !== "default",
    "enrollment-approval runs only in the default (local) project"
  );
});

test.describe.configure({ mode: "serial" });

async function newAdminRequestContext(baseURL: string | undefined): Promise<APIRequestContext> {
  const ctx = await playwrightRequest.newContext({ baseURL });
  const res = await ctx.post("/api/auth/sign-in/email", {
    data: { email: TEST_USERS.admin.email, password: TEST_USERS.admin.password },
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok()) {
    const body = await res.text().catch(() => "");
    throw new Error(`[enrollment-approval] admin sign-in failed: ${res.status()} ${body}`);
  }
  return ctx;
}

test("pending screen is consistent, approval activates, and a pending invite is auto-accepted", async ({
  page,
  baseURL,
}) => {
  const admin = await newAdminRequestContext(baseURL);
  let userId: string | null = null;
  let leagueId: number | null = null;

  try {
    // Approval mode ON.
    expect(
      (await admin.put("/api/admin/settings", {
        data: { require_user_approval: true },
        headers: { "Content-Type": "application/json" },
      })).ok(),
      "enable approval mode"
    ).toBeTruthy();

    // A scope to invite into (creator is auto-granted league_admin).
    const leagueRes = await admin.post("/api/leagues", {
      data: { name: `E2E Approval League ${Date.now()}` },
      headers: { "Content-Type": "application/json" },
    });
    expect(leagueRes.ok(), "create league").toBeTruthy();
    leagueId = (await leagueRes.json()).id;
    expect(leagueId, "league id").toBeTruthy();

    // --- Sign up under approval mode ---
    const signup = await signUpWithIntent(page, "league_operator");
    userId = signup.userId;
    const { email } = signup;
    expect(userId, "userId after signup").toBeTruthy();

    // (1a) Right after signup: canonical pending screen.
    await expect(page).toHaveURL(/\/welcome\/pending$/);
    await expect(page.getByRole("heading", { name: /Pending Approval/i })).toBeVisible();
    await expect(page.locator("body")).toContainText(/awaiting administrator approval/i);
    await expect(page.locator("body")).toContainText(email); // "We'll email you at <email>"

    // (1b) Navigate back to another page → the identical screen (AuthGate).
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Pending Approval/i })).toBeVisible();
    await expect(page.locator("body")).toContainText(/awaiting administrator approval/i);

    // A gated page shows the same screen too.
    await page.goto("/leagues");
    await expect(page.getByRole("heading", { name: /Pending Approval/i })).toBeVisible();

    // --- Invite the still-pending user into the league ---
    const inviteRes = await admin.post("/api/invites", {
      data: { email, role: "league_admin", scopeType: "league", scopeId: leagueId },
      headers: { "Content-Type": "application/json" },
    });
    expect(inviteRes.ok(), "create invite").toBeTruthy();

    // Invite is pending before approval.
    const pendingBefore = await (
      await admin.get(`/api/invites?scope_type=league&scope_id=${leagueId}`)
    ).json();
    expect(
      (pendingBefore.invites ?? []).some((i: { email: string }) => i.email.toLowerCase() === email.toLowerCase()),
      "invite pending before approval"
    ).toBeTruthy();

    // --- Approve ---
    const approveRes = await admin.post(`/api/admin/users/${encodeURIComponent(userId!)}/status`, {
      data: { status: "active", email },
      headers: { "Content-Type": "application/json" },
    });
    expect(approveRes.ok(), "approve user").toBeTruthy();

    // (2) User is active — the pending screen is gone.
    await page.goto("/");
    await expect(page.locator("body")).not.toContainText(/Pending Approval/i);

    // (3) Invite auto-accepted: no longer pending, and the role was granted.
    const pendingAfter = await (
      await admin.get(`/api/invites?scope_type=league&scope_id=${leagueId}`)
    ).json();
    expect(
      (pendingAfter.invites ?? []).some((i: { email: string }) => i.email.toLowerCase() === email.toLowerCase()),
      "invite no longer pending after approval"
    ).toBeFalsy();

    const roles = await (
      await admin.get(`/api/admin/roles?scope_type=league&scope_id=${leagueId}`)
    ).json();
    expect(
      (roles.roles ?? []).some((r: { user_id?: string }) => r.user_id === userId),
      "league_admin role granted to the approved invitee"
    ).toBeTruthy();
  } finally {
    // Restore global setting + tear down test data no matter what.
    await admin
      .put("/api/admin/settings", {
        data: { require_user_approval: false },
        headers: { "Content-Type": "application/json" },
      })
      .catch(() => {});
    if (userId) await cleanupTestUser(admin, userId).catch(() => {});
    if (leagueId) await admin.delete(`/api/leagues/${leagueId}`).catch(() => {});
    await admin.dispose();
  }
});
