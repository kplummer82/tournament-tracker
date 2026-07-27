import { test, expect } from "@playwright/test";

/**
 * Google OAuth entry points + the completion router. The full Google roundtrip
 * needs the provider enabled in Neon Console, so this covers what's verifiable
 * locally: the buttons render in the right places, and /auth/oauth-complete
 * seeds+routes an authenticated session instead of erroring.
 */
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "default", "local-only (dev auth proxy + fixtures)");
});

test.describe("Google button — logged out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("login page offers Continue with Google", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByTestId("google-signin")).toBeVisible();
  });

  test("signup offers Google once a persona is chosen", async ({ page }) => {
    await page.goto("/sign-up");
    // No Google button on the persona picker itself…
    await expect(page.getByTestId("google-signin")).toHaveCount(0);
    // …but it appears on the credentials step, carrying the chosen persona.
    await page.getByTestId("intent-coach").click();
    await expect(page.getByTestId("google-signin")).toBeVisible();
  });
});

test.describe("oauth-complete router — logged in", () => {
  // Uses the default (authenticated) storageState from playwright.config.ts.
  test("redirects an authenticated user off /auth/oauth-complete", async ({ page }) => {
    await page.goto("/auth/oauth-complete");
    // getServerSideProps must resolve the session, seed the profile, and route
    // away — never render the (null) page or 500.
    await expect(page).not.toHaveURL(/\/auth\/oauth-complete/);
  });
});
