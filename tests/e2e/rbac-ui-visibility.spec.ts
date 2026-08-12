import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';
import { gotoMustangSeason, gotoSeasonTab, TOURNAMENT_1DAY } from './helpers/navigate';

/**
 * RBAC UI Visibility Tests
 *
 * Verifies that edit/admin controls are conditionally rendered based on
 * the logged-in user's roles, while read-only content remains visible
 * for all authenticated users.
 */

// Shared navigation helpers
async function navigateToSeason(page: import('@playwright/test').Page) {
  await gotoMustangSeason(page);
  // Wait for the season shell to load
  await expect(page.getByRole('complementary').first()).toBeVisible({ timeout: 15000 });
}

async function navigateToSeasonTab(page: import('@playwright/test').Page, tabName: string) {
  await gotoSeasonTab(page, tabName);
}

async function navigateToLeagueDetail(page: import('@playwright/test').Page) {
  await page.goto('/leagues');
  await page.getByRole('link', { name: /SMYB/ }).click();
  // League detail lists seasons; divisions sit behind a "Manage divisions" disclosure.
  await expect(page.getByRole('link', { name: /2026 Spring/ })).toBeVisible({ timeout: 15000 });
}

async function navigateToTournament(page: import('@playwright/test').Page) {
  await page.goto('/tournaments');
  await page.getByRole('link', { name: TOURNAMENT_1DAY }).click();
  await expect(page.getByRole('complementary').first()).toBeVisible({ timeout: 15000 });
}

// ─── Admin: edit controls ARE visible ───────────────────────────────────────

test.describe('RBAC: Admin user sees edit controls', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin');
  });

  test('season schedule page shows "Add Game" button', async ({ page }) => {
    await navigateToSeasonTab(page, 'Results');
    await expect(page.getByRole('button', { name: /Add Game/i })).toBeVisible({ timeout: 10000 });
  });

  test('season teams page shows "New Team" and "Add Teams" buttons', async ({ page }) => {
    await navigateToSeasonTab(page, 'Teams');
    await expect(page.getByRole('button', { name: /New Team/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /Add Teams/i })).toBeVisible();
  });

  test('season playoffs page shows "Add Bracket" button', async ({ page }) => {
    await navigateToSeasonTab(page, 'Playoffs');
    await expect(page.getByRole('button', { name: /Add Bracket/i })).toBeVisible({ timeout: 10000 });
  });

  test('league detail page shows "New Season" button', async ({ page }) => {
    await navigateToLeagueDetail(page);
    await expect(page.getByRole('button', { name: /New Season/i })).toBeVisible({ timeout: 10000 });
  });

  test('league detail page shows "Add Division" button', async ({ page }) => {
    await navigateToLeagueDetail(page);
    // Division management lives behind the "Manage divisions" disclosure.
    await page.getByRole('button', { name: /Manage divisions/i }).click();
    await expect(page.getByRole('button', { name: /Add Division/i })).toBeVisible({ timeout: 10000 });
  });

  test('tournament overview shows top bar Save and Delete buttons', async ({ page }) => {
    await navigateToTournament(page);
    await expect(page.getByRole('button', { name: /Save/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /Delete/i })).toBeVisible();
  });
});

// ─── Regular user: edit controls are HIDDEN ─────────────────────────────────

test.describe('RBAC: Regular user cannot see edit controls', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'regularUser');
  });

  test('season schedule page hides "Add Game" button', async ({ page }) => {
    await navigateToSeasonTab(page, 'Results');
    // Wait for schedule content to load first
    await expect(page.getByRole('heading', { name: /Results|Schedule/i }).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /Add Game/i })).toHaveCount(0);
  });

  test('season teams page hides "New Team" and "Add Teams" buttons', async ({ page }) => {
    await navigateToSeasonTab(page, 'Teams');
    // Wait for teams content to load
    await expect(page.getByText(/team/i).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /New Team/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Add Teams/i })).toHaveCount(0);
  });

  test('season playoffs page hides "Add Bracket" button', async ({ page }) => {
    await navigateToSeasonTab(page, 'Playoffs');
    // Wait for the page to load
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: /Add Bracket/i })).toHaveCount(0);
  });

  test('league detail page hides "New Season" button', async ({ page }) => {
    await navigateToLeagueDetail(page);
    await expect(page.getByRole('button', { name: /New Season/i })).toHaveCount(0);
  });

  test('league detail page hides "Add Division" button', async ({ page }) => {
    await navigateToLeagueDetail(page);
    await expect(page.getByRole('button', { name: /Add Division/i })).toHaveCount(0);
  });

  test('tournament overview hides top bar Save and Delete buttons', async ({ page }) => {
    await navigateToTournament(page);
    // Wait for the tournament to load
    await expect(page.getByRole('complementary').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /Save/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Delete/i })).toHaveCount(0);
  });

  test('tournament overview hides Clone button', async ({ page }) => {
    await navigateToTournament(page);
    await expect(page.getByRole('complementary').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /Clone/i })).toHaveCount(0);
  });
});

// ─── Regular user: READ content is still visible ────────────────────────────

test.describe('RBAC: Regular user sees all read-only content', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'regularUser');
  });

  test('season schedule shows game table', async ({ page }) => {
    await navigateToSeasonTab(page, 'Results');
    await expect(page.getByRole('heading', { name: /Results|Schedule/i }).first()).toBeVisible({ timeout: 10000 });
    const table = page.locator('table').first();
    await expect(table).toBeVisible();
    // Verify data rows exist
    const rows = table.locator('tbody tr');
    expect(await rows.count()).toBeGreaterThan(0);
  });

  test('season standings are visible', async ({ page }) => {
    await navigateToSeasonTab(page, 'Standings');
    // Match the heading — getByText(/Standings/i) also hits the season shell's
    // mobile tab strip, which is in the DOM but hidden at desktop widths.
    await expect(page.getByRole('heading', { name: /Standings/i })).toBeVisible({ timeout: 10000 });
    // Standings table should have team data
    const table = page.locator('table').first();
    await expect(table).toBeVisible();
  });

  test('season teams list is visible', async ({ page }) => {
    await navigateToSeasonTab(page, 'Teams');
    await expect(page.getByText(/team/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('league detail shows seasons and can reveal divisions', async ({ page }) => {
    await navigateToLeagueDetail(page);
    await expect(page.getByRole('link', { name: /2026 Spring/ })).toBeVisible();
    await page.getByRole('button', { name: /Manage divisions/i }).click();
    await expect(page.getByText('Mustang').first()).toBeVisible();
  });

  test('tournament list is visible and navigable', async ({ page }) => {
    await page.goto('/tournaments');
    await expect(page.getByRole('link', { name: TOURNAMENT_1DAY })).toBeVisible({ timeout: 10000 });
  });
});
