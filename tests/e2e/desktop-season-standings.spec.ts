import { test, expect } from '@playwright/test';
import { gotoSeasonTab } from './helpers/navigate';

test.describe('Desktop: Season Standings', () => {
  test.beforeEach(async ({ page }) => {
    await gotoSeasonTab(page, 'Standings');
  });

  test('standings heading and controls are visible', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Standings/i })).toBeVisible({ timeout: 10000 });
    // The old "Include In Progress" checkbox is now a Current/Live/As-of mode toggle.
    await expect(page.getByRole('button', { name: 'Current', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Live', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'As-of', exact: true })).toBeVisible();
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
