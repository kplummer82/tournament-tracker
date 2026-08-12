import { test, expect } from '@playwright/test';
import { TOURNAMENT_1DAY } from './helpers/navigate';

test.describe('Tournament navigation', () => {
  test('can navigate to a tournament and view all tabs', async ({ page }) => {
    await page.goto('/tournaments');
    await expect(page.locator('h1, h2').first()).toContainText(/Tournaments/i);

    // Click into a tournament
    await page.getByRole('link', { name: TOURNAMENT_1DAY }).click();

    // Verify each tab loads without error (use sidebar/complementary nav to avoid ambiguity)
    const tabNav = page.getByRole('complementary').first();
    const tabs = ['Teams', 'Pool Play', 'Standings', 'Bracket', 'Tiebreakers'];
    for (const tab of tabs) {
      await tabNav.getByRole('link', { name: tab, exact: tab === 'Bracket' }).click();
      await expect(page).not.toHaveTitle(/500|Error/i);
    }
  });
});

test.describe('League → Season navigation', () => {
  test('can browse leagues → season → division → all tabs', async ({ page }) => {
    await page.goto('/leagues');
    await expect(page.locator('h1, h2').first()).toContainText(/Leagues/i);

    // Click into a league
    await page.getByRole('link', { name: /SMYB/ }).click();

    // Click into a season
    await page.getByRole('link', { name: /2026 Spring/ }).click();

    // Click into a division — this loads the season shell
    await page.getByRole('link', { name: /Mustang/ }).click();

    // Verify each season tab loads without error. Use the sidebar: several tab
    // names also appear in the header nav. ("Results" is the schedule tab.)
    const sidebar = page.getByRole('complementary').first();
    await expect(sidebar).toBeVisible({ timeout: 15000 });
    const tabs = ['Results', 'Standings', 'Playoffs', 'Tiebreakers'];
    for (const tab of tabs) {
      await sidebar.getByRole('link', { name: tab, exact: true }).click();
      await expect(page).not.toHaveTitle(/500|Error/i);
    }
  });
});
