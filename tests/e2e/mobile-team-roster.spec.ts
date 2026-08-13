import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { apiLogin, authedFetch } from "./helpers/auth";
import { createTeamViaApi, deleteTeamViaApi } from "./helpers/seed";

/**
 * Mobile layout of the team Roster tab.
 *
 * The roster header carries four controls — the position source picker plus the
 * Team Parent View / Coach View / Add person buttons. They were laid out in a
 * single non-wrapping row, so at phone widths Coach View and Add person ran off
 * the right edge and were unreachable. These assert the page never scrolls
 * horizontally and every control stays inside the viewport.
 *
 * The viewport is pinned here rather than relying on the `mobile` project, so
 * the regression is caught under `--project=default` too.
 */

const PHONE = { width: 390, height: 844 }; // iPhone 14

test.use({ storageState: { cookies: [], origins: [] }, viewport: PHONE });
test.describe.configure({ mode: "serial" });

/**
 * Widths that must not exceed the device width.
 *
 * Comparing scrollWidth to `window.innerWidth` would be useless: when content
 * overflows, the layout viewport itself stretches (innerWidth measured 553 on a
 * 390px phone), so the two stay equal and the bug hides. Both are checked
 * against the fixed device width instead.
 */
async function widths(page: Page): Promise<{ innerWidth: number; scrollWidth: number }> {
  return page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
}

async function expectFitsPhone(page: Page) {
  const { innerWidth, scrollWidth } = await widths(page);
  expect(innerWidth, "layout viewport stretched past the device width").toBeLessThanOrEqual(PHONE.width);
  expect(scrollWidth, "page scrolls horizontally").toBeLessThanOrEqual(PHONE.width);
}

test.describe("Mobile: team roster layout", () => {
  let context: BrowserContext;
  let page: Page;
  let teamId: number;

  // One sign-in for the whole file. Logging in per test trips Better Auth's
  // per-IP rate limit (429) once a handful of specs run back to back.
  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({ viewport: PHONE });
    page = await context.newPage();
    await apiLogin(page, "admin");
    teamId = await createTeamViaApi(page, `Mobile Roster ${Date.now()}`);
    // A couple of players so the table renders rows, not just an empty state.
    for (const first of ["Mobile", "Layout"]) {
      await authedFetch(page, "POST", `/api/teams/${teamId}/roster`, {
        first_name: first, last_name: "Probe", role: "player", jersey_number: 7,
      });
    }
  });

  test.beforeEach(async () => {
    await page.goto(`/teams/${teamId}?tab=roster`);
    await expect(page.getByRole("button", { name: /^add$/i })).toBeVisible({ timeout: 15000 });
    // The picker is the fourth control and the reason the row overflowed. If it
    // isn't rendered these assertions would pass vacuously.
    await expect(page.locator("#position-source")).toBeVisible({ timeout: 15000 });
  });

  test.afterAll(async () => {
    await deleteTeamViaApi(page, teamId);
    await page.close();
    await context.close();
  });

  test("every header control is reachable inside the viewport", async () => {
    for (const name of [/^parent$/i, /^coach$/i, /^add$/i]) {
      const button = page.getByRole("button", { name });
      await expect(button).toBeVisible();
      const box = await button.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      // The bug: these sat past the right edge with no way to scroll to them.
      expect(box!.x + box!.width).toBeLessThanOrEqual(PHONE.width);
    }
  });

  test("the page does not scroll horizontally", async () => {
    await expectFitsPhone(page);
  });

  test("still fits with Team Parent View and Coach View both on", async () => {
    // Both toggles add table columns, the widest the roster ever gets.
    await page.getByRole("button", { name: /^parent$/i }).click();
    await page.getByRole("button", { name: /^coach$/i }).click();
    await page.waitForTimeout(500);
    await expectFitsPhone(page);
  });

  test("the add-person form fits", async () => {
    await page.getByRole("button", { name: /^add$/i }).click();
    await expect(page.getByPlaceholder(/first name/i)).toBeVisible();
    await expectFitsPhone(page);
  });
});
