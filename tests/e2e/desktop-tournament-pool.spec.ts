import { test, expect } from '@playwright/test';
import { TOURNAMENT_1DAY } from './helpers/navigate';

test.describe('Desktop: Tournament Pool Play', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tournaments');
    await page.getByRole('link', { name: TOURNAMENT_1DAY }).click();
    const tabNav = page.getByRole('complementary').first();
    await tabNav.getByRole('link', { name: 'Pool Play' }).click();
    // Settle on the tab before asserting — the default 5s expect timeout is not
    // enough for the shell + pool data on a cold dev server.
    await expect(page.getByRole('heading', { name: /Pool Play/i })).toBeVisible({ timeout: 15000 });
  });

  test('pool play heading is visible', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Pool Play/i })).toBeVisible();
  });

  test('game table renders with correct columns', async ({ page }) => {
    const table = page.locator('table').first();
    await expect(table).toBeVisible({ timeout: 10000 });

    const headers = table.locator('thead th');
    await expect(headers.filter({ hasText: 'Date' })).toBeVisible();
    await expect(headers.filter({ hasText: 'Time' })).toBeVisible();
    await expect(headers.filter({ hasText: 'Home' })).toBeVisible();
    await expect(headers.filter({ hasText: 'Away' })).toBeVisible();
    await expect(headers.filter({ hasText: 'Score' })).toBeVisible();
  });

  test('game rows have data', async ({ page }) => {
    const table = page.locator('table').first();
    await expect(table).toBeVisible({ timeout: 10000 });

    const rows = table.locator('tbody tr');
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThan(0);
  });
});
