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

  /**
   * Serve the proxy from a fixture instead of Apple.
   *
   * Only the one test below that is specifically about the proxy talks to the
   * real iTunes API — Apple rate-limits after a couple of dozen searches, and a
   * suite that hammers it goes red for reasons that have nothing to do with
   * this code.
   */
  async function stubItunes(target: Page) {
    await target.route("**/api/itunes/search*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          results: [
            { trackId: 1109104095, trackName: "Thunder", artistName: "Imagine Dragons" },
            { trackId: 1440834092, trackName: "Enter Sandman", artistName: "Metallica" },
            { trackId: 1440833098, trackName: "Thunderstruck", artistName: "AC/DC" },
          ],
        }),
      })
    );
  }

  test.beforeEach(async () => {
    directItunesCalls = [];
    page.on("request", (r) => {
      if (r.url().includes("itunes.apple.com")) directItunesCalls.push(r.url());
    });
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await page.goto(`/teams/${teamId}/roster/${rosterId}`);
    const editBtn = page.getByRole("button", { name: /edit/i }).first();
    await expect(editBtn).toBeVisible({ timeout: 15000 });
    await editBtn.click();
  });

  // The one test that exercises the real proxy end to end: our server, Apple,
  // and back. Everything below it runs against the stub.
  test("search goes through our server and returns real results", async () => {
    const input = page.getByPlaceholder("Search or type a song");
    await expect(input).toBeVisible({ timeout: 15000 });

    const proxied = page.waitForResponse(
      (r) => r.url().includes("/api/itunes/search") && r.status() === 200,
      { timeout: 20000 }
    );
    await input.click();
    await input.pressSequentially("thunder", { delay: 60 });
    const body = await (await proxied).json();

    expect(
      directItunesCalls,
      "the browser must not hit itunes.apple.com directly — iOS blocks the musics:// redirect"
    ).toEqual([]);
    expect(Array.isArray(body.results), "proxy did not return a results array").toBe(true);
    expect(body.results.length, "proxy returned no songs for 'thunder'").toBeGreaterThan(0);
  });

  test("the results panel stays inside the visible viewport", async () => {
    await stubItunes(page);
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

  test("a start time saves and comes back in seconds", async () => {
    await stubItunes(page);
    const input = page.getByPlaceholder("Search or type a song");
    await expect(input).toBeVisible({ timeout: 15000 });
    await input.fill("Enter Sandman — Metallica");

    const start = page.getByLabel("Song start time in seconds");
    await expect(start).toBeVisible();
    await start.fill("95");
    await page.getByRole("button", { name: /^save$/i }).click();

    await expect
      .poll(async () => {
        const { data } = await authedFetch(page, "GET", `/api/teams/${teamId}/roster/${rosterId}`);
        return data?.walkup_song_start_seconds ?? null;
      }, { timeout: 15000 })
      .toBe(95);

    // And it renders back as mm:ss rather than raw seconds.
    await page.reload();
    await expect(page.getByText("@1:35")).toBeVisible({ timeout: 15000 });
  });

  test("a start time past the ceiling is clamped, not silently dropped", async () => {
    await stubItunes(page);
    const input = page.getByPlaceholder("Search or type a song");
    await expect(input).toBeVisible({ timeout: 15000 });
    await input.fill("Thunderstruck — AC/DC");

    const start = page.getByLabel("Song start time in seconds");
    await start.fill("99999");
    await start.blur();
    // Clamped in the box so what you see is what gets saved.
    await expect(start).toHaveValue("3600");
  });

  // The PATCH handler writes every walk-up column in one statement, guarded by
  // "was this key in the body?" flags. If a guard is wrong, an unrelated edit
  // silently blanks a field — so pin the partial-update behaviour directly.
  test("a partial PATCH leaves the fields it didn't mention alone", async () => {
    const url = `/api/teams/${teamId}/roster/${rosterId}`;
    await authedFetch(page, "PATCH", url, {
      hat_monogram: "SMITH",
      walkup_song: "Thunder — Imagine Dragons",
      walkup_song_itunes_id: 1109104095,
      walkup_song_start_seconds: 45,
    });

    // Touch only the monogram.
    const monogramOnly = await authedFetch(page, "PATCH", url, { hat_monogram: "JONES" });
    expect(monogramOnly.data.hat_monogram).toBe("JONES");
    expect(monogramOnly.data.walkup_song).toBe("Thunder — Imagine Dragons");
    expect(Number(monogramOnly.data.walkup_song_itunes_id)).toBe(1109104095);
    expect(monogramOnly.data.walkup_song_start_seconds).toBe(45);

    // Touch only the start time.
    const startOnly = await authedFetch(page, "PATCH", url, { walkup_song_start_seconds: 60 });
    expect(startOnly.data.walkup_song_start_seconds).toBe(60);
    expect(startOnly.data.hat_monogram).toBe("JONES");
    expect(startOnly.data.walkup_song).toBe("Thunder — Imagine Dragons");

    // An explicit null clears just that field.
    const cleared = await authedFetch(page, "PATCH", url, { walkup_song_start_seconds: null });
    expect(cleared.data.walkup_song_start_seconds).toBeNull();
    expect(cleared.data.walkup_song).toBe("Thunder — Imagine Dragons");
  });

  test("an out-of-range start time is rejected by the API", async () => {
    const url = `/api/teams/${teamId}/roster/${rosterId}`;
    for (const bad of [-5, 99999, "abc", 1.5]) {
      const res = await authedFetch(page, "PATCH", url, { walkup_song_start_seconds: bad });
      expect(res.status, `expected ${JSON.stringify(bad)} to be rejected`).toBe(400);
    }
  });

  test("picking a suggestion fills the field and saves", async () => {
    await stubItunes(page);
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
