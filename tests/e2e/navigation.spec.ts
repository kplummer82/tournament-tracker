import { test, expect } from '@playwright/test';

test.describe('Tournament navigation', () => {
  test('can navigate to a tournament and view all tabs', async ({ page }) => {
    await page.goto('/tournaments');
    await expect(page.locator('h1, h2').first()).toContainText(/Tournaments/i);

    // Click into a tournament
    await page.getByRole('link', { name: /1-Day Test/ }).click();

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
  test('can browse leagues → division → season → all tabs', async ({ page }) => {
    await page.goto('/leagues');
    await expect(page.locator('h1, h2').first()).toContainText(/Leagues/i);

    // Click into a league
    await page.getByRole('link', { name: /SMYB/ }).click();

    // Click into a division
    await page.getByRole('link', { name: /Mustang/ }).click();

    // Click into a season
    await page.getByRole('link', { name: /Spring 2026/ }).click();

    // Verify each season tab loads without error
    const tabs = ['Schedule', 'Standings', 'Playoffs', 'Tiebreakers'];
    for (const tab of tabs) {
      await page.getByRole('link', { name: tab }).click();
      await expect(page).not.toHaveTitle(/500|Error/i);
    }
  });
});
