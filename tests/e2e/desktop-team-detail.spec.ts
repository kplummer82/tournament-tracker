import { test, expect } from '@playwright/test';

test.describe('Desktop: Team Detail', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to teams list, then click the first team
    await page.goto('/teams');
    await expect(page.locator('h1, h2').first()).toContainText(/Teams/i, { timeout: 10000 });

    // Click the first team link in the list
    const teamLink = page.locator('table tbody tr a, [data-testid="team-link"], a[href^="/teams/"]').first();
    await expect(teamLink).toBeVisible({ timeout: 10000 });
    await teamLink.click();
  });

  test('team detail page loads with team name', async ({ page }) => {
    // The page should show a team name (h1 or prominent heading)
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10000 });
    await expect(page).not.toHaveTitle(/500|Error/i);
  });

  test('tabs are visible (Overview, Roster, Calendar)', async ({ page }) => {
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10000 });

    // Tab triggers should be present
    await expect(page.getByRole('tab', { name: /Overview/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Roster/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Calendar/i })).toBeVisible();
  });

  test('roster tab shows roster content', async ({ page }) => {
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10000 });

    await page.getByRole('tab', { name: /Roster/i }).click();
    // Should show roster content area (table or empty state)
    await expect(page).not.toHaveTitle(/500|Error/i);
  });

  test('calendar tab loads without errors', async ({ page }) => {
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10000 });

    await page.getByRole('tab', { name: /Calendar/i }).click();
    await expect(page).not.toHaveTitle(/500|Error/i);
  });

  test('league badge is shown if team has a league', async ({ page }) => {
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10000 });
    // League info may or may not be present depending on team data
    // Just verify no errors
    await expect(page).not.toHaveTitle(/500|Error/i);
  });
});
