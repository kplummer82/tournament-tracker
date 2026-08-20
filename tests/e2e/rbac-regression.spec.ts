import { test, expect } from "@playwright/test";
import { loginAs, ensureLoggedIn, authedFetch } from "./helpers/auth";
import { gotoSeasonTab, TOURNAMENT_1DAY } from "./helpers/navigate";

/**
 * Regression tests ensuring existing functionality still works
 * after RBAC changes. These verify read access and page rendering,
 * not RBAC-specific behavior.
 */
test.describe("RBAC Regression: Pages load correctly", () => {
  test("login page loads and admin can log in", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();

    // Admin can log in successfully
    await loginAs(page, "admin");
    expect(page.url()).not.toContain("/login");
  });

  test("homepage loads after auth", async ({ page }) => {
    await loginAs(page, "admin");
    await page.goto("/");
    const response = await page.goto("/");
    expect(response?.status()).toBeLessThan(400);
    // Page should not show an error
    await expect(page).not.toHaveTitle(/500|Error/i);
  });

  test("leagues list page loads and shows leagues", async ({ page }) => {
    await loginAs(page, "admin");
    await page.goto("/leagues");
    await expect(page.locator("h1, h2").first()).toContainText(/Leagues/i);
    // At least one league should be visible
    await expect(page.getByText("SMYB").first()).toBeVisible({ timeout: 10000 });
  });

  test("tournaments list page loads", async ({ page }) => {
    await loginAs(page, "admin");
    await page.goto("/tournaments");
    await expect(page.locator("h1, h2").first()).toContainText(/Tournaments/i);
    // At least one tournament link should appear
    await expect(
      page.getByRole("link", { name: TOURNAMENT_1DAY })
    ).toBeVisible({ timeout: 10000 });
  });

  test("tournament detail page loads (pool, standings)", async ({ page }) => {
    await loginAs(page, "admin");
    await page.goto("/tournaments");
    await page.getByRole("link", { name: TOURNAMENT_1DAY }).click();

    // Should render the tournament shell
    await expect(page).not.toHaveTitle(/500|Error/i);
    await expect(page.getByRole("complementary").first()).toBeVisible({
      timeout: 10000,
    });

    // Navigate to Pool Play tab
    const sidebar = page.getByRole("complementary").first();
    await sidebar.getByRole("link", { name: "Pool Play" }).click();
    await expect(page).not.toHaveTitle(/500|Error/i);

    // Navigate to Standings tab
    await sidebar.getByRole("link", { name: "Standings" }).click();
    await expect(page).not.toHaveTitle(/500|Error/i);
  });

  test("teams list page loads", async ({ page }) => {
    await loginAs(page, "admin");
    await page.goto("/teams");
    await expect(page.locator("h1, h2").first()).toContainText(/Teams/i);
  });
});

test.describe("RBAC Regression: Season pages load", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "admin");
  });

  for (const tab of ["Schedule", "Standings", "Teams", "Playoffs"]) {
    test(`season ${tab.toLowerCase()} page loads`, async ({ page }) => {
      await gotoSeasonTab(page, tab);
      await expect(page).not.toHaveTitle(/500|Error/i);
    });
  }
});

test.describe("RBAC Regression: Read access is open", () => {
  test("regularUser can view all public pages", async ({ page }) => {
    await loginAs(page, "regularUser");

    // Leagues
    await page.goto("/leagues");
    await expect(page.locator("h1, h2").first()).toContainText(/Leagues/i);

    // Tournaments
    await page.goto("/tournaments");
    await expect(page.locator("h1, h2").first()).toContainText(/Tournaments/i);

    // Teams
    await page.goto("/teams");
    await expect(page.locator("h1, h2").first()).toContainText(/Teams/i);

    // Homepage
    const response = await page.goto("/");
    expect(response?.status()).toBeLessThan(400);
  });
});

test.describe("RBAC Regression: Admin pages", () => {
  test("admin can access /admin pages", async ({ page }) => {
    await loginAs(page, "admin");
    const response = await page.goto("/admin");
    // Should load without redirect to login or 403
    expect(response?.status()).toBeLessThan(400);
    await expect(page).not.toHaveTitle(/500|Error/i);
  });
});
