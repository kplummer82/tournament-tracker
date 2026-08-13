import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { apiLogin, authedFetch } from "./helpers/auth";
import { createTeamViaApi, deleteTeamViaApi } from "./helpers/seed";

/**
 * Walk-up song typeahead on the player edit page, at phone size.
 *
 * Two mobile-only regressions are guarded here:
 *
 * 1. The search used to call https://itunes.apple.com/search straight from the
 *    browser. Apple redirects requests coming from Apple devices to the
 *    `musics://` app scheme, and fetch() refuses to follow a cross-origin
 *    redirect into a non-CORS scheme — so on every iOS/WebKit browser the
 *    promise rejected and the field just accepted raw text with no suggestions.
 *    It now goes through /api/itunes/search. The "no direct call" assertion is
 *    what catches this under Chromium, where the direct call would have worked.
 *
 * 2. The field is the last one in the form, so the results panel rendered below
 *    the fold / under the on-screen keyboard. It now flips above the input when
 *    there isn't room beneath it.
 *
 * The viewport is pinned rather than relying on the `mobile` project so this
 * runs under `--project=default` too.
 */

const PHONE = { width: 390, height: 844 }; // iPhone 14

test.use({ storageState: { cookies: [], origins: [] }, viewport: PHONE });
test.describe.configure({ mode: "serial" });

test.describe("Mobile: walk-up song typeahead", () => {
  let context: BrowserContext;
  let page: Page;
  let teamId: number;
  let rosterId: number;
  let directItunesCalls: string[];

  // One sign-in for the whole file — logging in per test trips Better Auth's
  // per-IP rate limit once several specs run back to back.
  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({ viewport: PHONE });
    page = await context.newPage();
    await apiLogin(page, "admin");
    teamId = await createTeamViaApi(page, `Walkup Song ${Date.now()}`);
    const { status, data } = await authedFetch(page, "POST", `/api/teams/${teamId}/roster`, {
      first_name: "Walkup", last_name: "Probe", role: "player", jersey_number: 7,
    });
    expect(status, "failed to seed a roster player").toBe(201);
    rosterId = data.id;
  });

  test.afterAll(async () => {
    if (teamId) await deleteTeamViaApi(page, teamId);
    await context?.close();
  });

  test.beforeEach(async () => {
    directItunesCalls = [];
    page.on("request", (r) => {
      if (r.url().includes("itunes.apple.com")) directItunesCalls.push(r.url());
    });
    await page.goto(`/teams/${teamId}/roster/${rosterId}`);
    const editBtn = page.getByRole("button", { name: /edit/i }).first();
    await expect(editBtn).toBeVisible({ timeout: 15000 });
    await editBtn.click();
  });

  test("typing suggests songs, without calling Apple from the browser", async () => {
    const input = page.getByPlaceholder("Search or type a song");
    await expect(input).toBeVisible({ timeout: 15000 });

    const proxied = page.waitForResponse(
      (r) => r.url().includes("/api/itunes/search") && r.status() === 200,
      { timeout: 15000 }
    );
    await input.click();
    await input.pressSequentially("thunder", { delay: 60 });
    await proxied;

    const panel = page.locator("div.absolute.z-50").first();
    await expect(panel).toBeVisible({ timeout: 10000 });
    await expect(panel.getByRole("button").first()).toBeVisible();

    expect(
      directItunesCalls,
      "the browser must not hit itunes.apple.com directly — iOS blocks the musics:// redirect"
    ).toEqual([]);
  });

  test("the results panel stays inside the visible viewport", async () => {
    const input = page.getByPlaceholder("Search or type a song");
    await input.click();
    await input.pressSequentially("thunder", { delay: 60 });

    const panel = page.locator("div.absolute.z-50").first();
    await expect(panel).toBeVisible({ timeout: 15000 });
    await expect(panel.getByRole("button").first()).toBeVisible();

    const box = await panel.boundingBox();
    const viewportHeight = await page.evaluate(
      () => window.visualViewport?.height ?? window.innerHeight
    );
    expect(box, "results panel has no layout box").not.toBeNull();
    expect(box!.y, "results panel is cut off above the viewport").toBeGreaterThanOrEqual(0);
    expect(
      box!.y + box!.height,
      "results panel renders below the fold — it should flip above the input"
    ).toBeLessThanOrEqual(viewportHeight);
  });

  test("picking a suggestion fills the field and saves", async () => {
    const input = page.getByPlaceholder("Search or type a song");
    await input.click();
    await input.pressSequentially("thunder", { delay: 60 });

    const panel = page.locator("div.absolute.z-50").first();
    await expect(panel).toBeVisible({ timeout: 15000 });
    await panel.getByRole("button").first().click();

    await expect(input).toHaveValue(/\s—\s/, { timeout: 5000 });

    await page.getByRole("button", { name: /^save$/i }).click();

    // The saved song comes back on the player record with an iTunes id attached.
    await expect
      .poll(async () => {
        const { data } = await authedFetch(page, "GET", `/api/teams/${teamId}/roster/${rosterId}`);
        return data?.walkup_song_itunes_id ?? null;
      }, { timeout: 15000 })
      .not.toBeNull();
  });
});
