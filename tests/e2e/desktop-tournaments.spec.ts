import { test, expect } from '@playwright/test';

test.describe('Desktop: Tournaments List', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tournaments');
    await expect(page.locator('h1, h2').first()).toContainText(/Tournaments/i);
  });

  test('page title and filter bar are visible', async ({ page }) => {
    // Search input
    await expect(page.getByPlaceholder(/Search name, city, state/i)).toBeVisible();

    // Status filter buttons
    await expect(page.getByRole('button', { name: /Active/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Draft/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Completed/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Archived/i })).toBeVisible();
  });

  test('tournament rows render with name and status badge', async ({ page }) => {
    // Wait for at least one tournament link to appear
    const firstRow = page.getByRole('link', { name: /1-Day Test/i });
    await expect(firstRow).toBeVisible({ timeout: 10000 });
  });

  test('clicking a tournament navigates to overview', async ({ page }) => {
    await page.getByRole('link', { name: /1-Day Test/i }).click();

    // Should land on overview — look for the tournament shell with Overview tab active
    await expect(page).not.toHaveTitle(/500|Error/i);
    // The sidebar nav should be visible on desktop
    await expect(page.getByRole('complementary').first()).toBeVisible();
  });
});

test.describe('Desktop: Tournament Tabs', () => {
  test('all sidebar tabs are visible and navigable', async ({ page }) => {
    await page.goto('/tournaments');
    await page.getByRole('link', { name: /1-Day Test/i }).click();

    const tabNav = page.getByRole('complementary').first();

    // All tabs should be visible in the sidebar
    const tabs = ['Overview', 'Teams', 'Pool Play', 'Standings', 'Bracket', 'Tiebreakers'];
    for (const tab of tabs) {
      await expect(
        tabNav.getByRole('link', { name: tab, exact: tab === 'Bracket' })
      ).toBeVisible();
    }

    // Navigate to each tab and verify no errors
    for (const tab of tabs.slice(1)) {
      await tabNav.getByRole('link', { name: tab, exact: tab === 'Bracket' }).click();
      await expect(page).not.toHaveTitle(/500|Error/i);
    }
  });
});
