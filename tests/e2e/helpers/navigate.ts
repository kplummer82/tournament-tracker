// tests/e2e/helpers/navigate.ts
// Shared navigation for the seeded SMYB fixture season.
//
// The league hierarchy is league → season → division:
//   /leagues → SMYB → "2026 Spring" → "Mustang" → /seasons/1/overview
//
// It used to be league → division → season, and a dozen specs hard-coded that
// older order in their beforeEach. Centralize it here so the next IA change is
// one edit rather than thirteen.
import { expect, type Page } from "@playwright/test";

/**
 * The seeded "1-Day Test" tournament. A "1-Day Test Scheduling Copy" was seeded
 * later, so a bare /1-Day Test/ matches two links and trips Playwright's strict
 * mode. The lookahead pins it to the original.
 */
export const TOURNAMENT_1DAY = /^1-Day Test(?! Scheduling)/i;

/**
 * Walk /leagues down to the Mustang division's season shell (/seasons/1/overview).
 *
 * Each hop waits for its link before clicking. A cold `next dev` compiles each
 * route on first request, so the bare click-click-click chain races the compile
 * and fails on whichever page happens to be cold.
 */
export async function gotoMustangSeason(page: Page): Promise<void> {
  await page.goto("/leagues");
  for (const name of [/SMYB/, /2026 Spring/, /Mustang/]) {
    const link = page.getByRole("link", { name }).first();
    await expect(link).toBeVisible({ timeout: 20000 });
    await link.click();
  }
  await expect(page).toHaveURL(/\/seasons\/\d+\//, { timeout: 20000 });
}

/**
 * Click a tab link and wait for its own href to become the URL. Waiting on the
 * href rather than on the tab name keeps this correct if the two ever differ,
 * and stops tests asserting against the previous tab's DOM when the dev server
 * is slow under parallel load.
 */
async function clickTabAndSettle(page: Page, link: ReturnType<Page["getByRole"]>): Promise<void> {
  await expect(link).toBeVisible({ timeout: 15000 });
  const href = await link.getAttribute("href");
  await link.click();
  if (href) await expect(page).toHaveURL(new RegExp(`${href}(\\?|#|$)`), { timeout: 15000 });
}

/**
 * Reach a season tab via the desktop sidebar. Use the sidebar rather than a bare
 * link lookup — several tab names ("Teams", "Home") also appear in the header nav.
 */
export async function gotoSeasonTab(page: Page, tabName: string): Promise<void> {
  await gotoMustangSeason(page);
  const sidebar = page.getByRole("complementary").first();
  await expect(sidebar).toBeVisible({ timeout: 15000 });
  await clickTabAndSettle(page, sidebar.getByRole("link", { name: tabName, exact: true }));
}

/**
 * Mobile equivalent: the season shell renders a horizontal tab strip instead of
 * a sidebar, so the tab is a plain link.
 */
export async function gotoSeasonTabMobile(page: Page, tabName: string): Promise<void> {
  await gotoMustangSeason(page);
  await clickTabAndSettle(page, page.getByRole("link", { name: tabName, exact: true }));
}
