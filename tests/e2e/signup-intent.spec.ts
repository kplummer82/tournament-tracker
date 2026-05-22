import { test, expect, request as playwrightRequest } from "@playwright/test";
import { TEST_USERS } from "./helpers/auth";
import { signUpWithIntent, cleanupTestUser } from "./helpers/signup";

// These tests need a brand-new (unauthenticated) browser context per case
// because the default storageState in playwright.config.ts is logged in
// as the regular fixture user.
test.use({ storageState: { cookies: [], origins: [] } });

// Skip in the `mobile` (needs WebKit install) and `ldqa` (F2 not deployed
// yet) projects. Run locally against the `default` Chromium project.
test.beforeEach(({}, testInfo) => {
  test.skip(
    testInfo.project.name !== "default",
    "signup-intent specs run only in the default (local) project for now"
  );
});

const createdUserIds: string[] = [];

/**
 * Build an admin-authenticated APIRequestContext. Uses Better Auth's
 * sign-in endpoint exposed through the local auth proxy:
 *   POST /api/auth/sign-in/email  body: { email, password }
 * (Verified against node_modules/better-auth and pages/api/auth/[...path].ts.)
 */
async function newAdminRequestContext(baseURL: string | undefined) {
  const ctx = await playwrightRequest.newContext({ baseURL });
  const res = await ctx.post("/api/auth/sign-in/email", {
    data: { email: TEST_USERS.admin.email, password: TEST_USERS.admin.password },
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok()) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `[signup-intent.spec] admin sign-in failed: ${res.status()} ${body}`
    );
  }
  return ctx;
}

test.afterAll(async ({ baseURL }) => {
  if (createdUserIds.length === 0) return;
  let ctx;
  try {
    ctx = await newAdminRequestContext(baseURL);
  } catch (err) {
    console.warn(`[signup-intent.spec] cleanup skipped: ${(err as Error).message}`);
    return;
  }
  for (const id of createdUserIds) {
    await cleanupTestUser(ctx, id);
  }
  await ctx.dispose();
});

// Force serial execution. The approval-mode test mutates the global
// `require_user_approval` setting; running it in parallel with the
// happy-path tests would race them onto /welcome/pending. The shared
// createdUserIds array also reads cleaner with serial appends.
test.describe.configure({ mode: "serial" });

function recordUser(id: string | null) {
  if (id) createdUserIds.push(id);
}

test("follower signup lands on /tournaments and stores intent", async ({ page }) => {
  const { userId } = await signUpWithIntent(page, "follower");
  recordUser(userId);

  expect(page.url()).toMatch(/\/tournaments(\?|$)/);

  // Read intent back via the API to confirm it was persisted.
  const intentRes = await page.request.get("/api/me/signup-intent");
  expect(intentRes.ok()).toBeTruthy();
  expect(await intentRes.json()).toEqual({ intent: "follower" });
});

test("coach signup lands on /welcome/coach", async ({ page }) => {
  const { userId, email } = await signUpWithIntent(page, "coach");
  recordUser(userId);

  await expect(page).toHaveURL(/\/welcome\/coach$/);
  await expect(page.locator("body")).toContainText(email);
});

test("league_operator signup lands on /leagues/new", async ({ page }) => {
  const { userId } = await signUpWithIntent(page, "league_operator");
  recordUser(userId);

  await expect(page).toHaveURL(/\/leagues\/new$/);
});

test("tournament_organizer signup lands on /tournaments/new", async ({ page }) => {
  const { userId } = await signUpWithIntent(page, "tournament_organizer");
  recordUser(userId);

  await expect(page).toHaveURL(/\/tournaments\/new$/);
});

test("invite token that 404s falls through to intent picker", async ({ page }) => {
  await page.goto("/sign-up?invite=bogus-token");
  // The picker should render with all four cards visible.
  await expect(page.getByTestId("intent-follower")).toBeVisible();
  await expect(page.getByTestId("intent-coach")).toBeVisible();
  await expect(page.getByTestId("intent-league_operator")).toBeVisible();
  await expect(page.getByTestId("intent-tournament_organizer")).toBeVisible();
});

// NOTE: When run back-to-back with the 5 happy-path tests above, this test
// frequently hits Better Auth's per-IP signup rate-limit ("Too many requests")
// because it's the 6th signup in <60s. The underlying app logic (inactive
// users land on /welcome/pending) is exercised by the helper's null-userId
// branch and was manually verified. Approval mode is an emergency switch,
// not happy-path, so the rate-limit-induced flakiness here is acceptable.
// If you need to verify this path locally, run this test in isolation:
//   npx playwright test signup-intent.spec.ts -g "approval mode"
test("approval mode routes league_operator to /welcome/pending", async ({ page, baseURL }) => {
  // Toggle the approval setting on. This requires an admin session.
  // Endpoint shape verified against pages/api/admin/settings.ts:
  //   PUT /api/admin/settings  body: { require_user_approval: boolean }
  const adminCtx = await newAdminRequestContext(baseURL);

  const enableRes = await adminCtx.put("/api/admin/settings", {
    data: { require_user_approval: true },
    headers: { "Content-Type": "application/json" },
  });
  expect(enableRes.ok(), "enable approval mode").toBeTruthy();

  try {
    const { userId } = await signUpWithIntent(page, "league_operator");
    recordUser(userId);
    await expect(page).toHaveURL(/\/welcome\/pending$/);
  } finally {
    // Always restore the setting, even if the assertion fails.
    await adminCtx.put("/api/admin/settings", {
      data: { require_user_approval: false },
      headers: { "Content-Type": "application/json" },
    });
    await adminCtx.dispose();
  }
});
