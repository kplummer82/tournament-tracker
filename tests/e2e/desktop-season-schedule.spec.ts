import { test, expect } from '@playwright/test';

test.describe('Desktop: Season Schedule', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/leagues');
    await page.getByRole('link', { name: /SMYB/ }).click();
    await page.getByRole('link', { name: /Mustang/ }).click();
    await page.getByRole('link', { name: /Spring 2026/ }).click();
    const tabNav = page.getByRole('complementary').first();
    await tabNav.getByRole('link', { name: 'Schedule' }).click();
  });

  test('schedule heading and add game button are visible', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Schedule/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /Add Game/i })).toBeVisible();
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

  test('game table has data rows', async ({ page }) => {
    const table = page.locator('table').first();
    await expect(table).toBeVisible({ timeout: 10000 });

    const rows = table.locator('tbody tr');
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThan(0);
  });

  test('add game button opens form panel', async ({ page }) => {
    await page.getByRole('button', { name: /Add Game/i }).click();

    // Form should appear with date and team selects
    await expect(page.locator('input[type="date"]')).toBeVisible();
    await expect(page.locator('select').first()).toBeVisible();
  });
});
