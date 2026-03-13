import { test, expect } from '@playwright/test';

test.describe('Desktop: Season Standings', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to Spring 2026 season standings via leagues
    await page.goto('/leagues');
    await page.getByRole('link', { name: /SMYB/ }).click();
    await page.getByRole('link', { name: /Mustang/ }).click();
    await page.getByRole('link', { name: /Spring 2026/ }).click();
    const tabNav = page.getByRole('complementary').first();
    await tabNav.getByRole('link', { name: 'Standings' }).click();
  });

  test('standings heading and controls are visible', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Standings/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Include In Progress/i)).toBeVisible();
  });

  test('standings table has core column headers', async ({ page }) => {
    const table = page.locator('table').first();
    await expect(table).toBeVisible({ timeout: 10000 });

    // Core columns that should always be present
    await expect(table.getByRole('columnheader', { name: 'Rank' })).toBeVisible();
    await expect(table.getByRole('columnheader', { name: 'Team' })).toBeVisible();
    await expect(table.getByRole('columnheader', { name: 'W', exact: true })).toBeVisible();
    await expect(table.getByRole('columnheader', { name: 'L', exact: true })).toBeVisible();
    await expect(table.getByRole('columnheader', { name: 'T', exact: true })).toBeVisible();
    await expect(table.getByRole('columnheader', { name: 'G', exact: true })).toBeVisible();
    await expect(table.getByRole('columnheader', { name: 'Pct' })).toBeVisible();
    await expect(table.getByRole('columnheader', { name: 'RS', exact: true })).toBeVisible();
    await expect(table.getByRole('columnheader', { name: 'RA', exact: true })).toBeVisible();
    await expect(table.getByRole('columnheader', { name: 'Diff' })).toBeVisible();
  });

  test('standings table has data rows with team names', async ({ page }) => {
    const table = page.locator('table').first();
    await expect(table).toBeVisible({ timeout: 10000 });

    const rows = table.locator('tbody tr');
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThan(0);

    // First row should have a team name (non-empty text in second column)
    const firstTeamCell = rows.first().locator('td').nth(1);
    await expect(firstTeamCell).not.toBeEmpty();
  });
});
