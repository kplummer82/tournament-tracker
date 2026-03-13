import { test, expect } from '@playwright/test';

test.describe('Desktop: Tournament Standings', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tournaments');
    await page.getByRole('link', { name: /1-Day Test/i }).click();
    const tabNav = page.getByRole('complementary').first();
    await tabNav.getByRole('link', { name: 'Standings' }).click();
  });

  test('standings heading and controls are visible', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Standings/i })).toBeVisible();
    await expect(page.getByRole('checkbox')).toBeVisible(); // Include In Progress
    await expect(page.getByText(/Include In Progress/i)).toBeVisible();
  });

  test('standings table renders with correct column headers', async ({ page }) => {
    const table = page.locator('table').first();
    await expect(table).toBeVisible({ timeout: 10000 });

    await expect(table.getByRole('columnheader', { name: 'Rank' })).toBeVisible();
    await expect(table.getByRole('columnheader', { name: 'Team' })).toBeVisible();
    await expect(table.getByRole('columnheader', { name: 'W', exact: true })).toBeVisible();
    await expect(table.getByRole('columnheader', { name: 'G', exact: true })).toBeVisible();
    await expect(table.getByRole('columnheader', { name: 'Pct' })).toBeVisible();
    await expect(table.getByRole('columnheader', { name: 'RS', exact: true })).toBeVisible();
    await expect(table.getByRole('columnheader', { name: 'RA', exact: true })).toBeVisible();
    await expect(table.getByRole('columnheader', { name: 'Diff' })).toBeVisible();
  });

  test('standings table has data rows', async ({ page }) => {
    const table = page.locator('table').first();
    await expect(table).toBeVisible({ timeout: 10000 });

    const rows = table.locator('tbody tr');
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThan(0);
  });
});
