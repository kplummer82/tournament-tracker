import { test, expect } from '@playwright/test';

test.describe('Desktop: Season Standings — SoS Toggle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/leagues');
    await page.getByRole('link', { name: /SMYB/ }).click();
    await page.getByRole('link', { name: /Mustang/ }).click();
    await page.getByRole('link', { name: /Spring 2026/ }).click();
    const tabNav = page.getByRole('complementary').first();
    await tabNav.getByRole('link', { name: 'Standings' }).click();
  });

  test('view switcher has Standings and SoS options', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Standings/i })).toBeVisible({ timeout: 10000 });
    // The segmented control should have both view options
    await expect(page.getByText('Standings', { exact: true })).toBeVisible();
    await expect(page.getByText('SoS', { exact: true })).toBeVisible();
  });

  test('clicking SoS switches to Strength of Schedule view', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Standings/i })).toBeVisible({ timeout: 10000 });

    // Click the SoS toggle
    await page.getByText('SoS', { exact: true }).click();

    // Heading should change
    await expect(page.getByRole('heading', { name: /Strength of Schedule/i })).toBeVisible({ timeout: 10000 });
  });

  test('SoS view shows Full Season / Remaining toggle', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Standings/i })).toBeVisible({ timeout: 10000 });
    await page.getByText('SoS', { exact: true }).click();
    await expect(page.getByRole('heading', { name: /Strength of Schedule/i })).toBeVisible({ timeout: 10000 });

    // SoS sub-mode toggle should appear
    await expect(page.getByText('Full Season', { exact: true })).toBeVisible();
    await expect(page.getByText('Remaining', { exact: true })).toBeVisible();
  });

  test('switching back to Standings restores table', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Standings/i })).toBeVisible({ timeout: 10000 });

    // Switch to SoS then back
    await page.getByText('SoS', { exact: true }).click();
    await expect(page.getByRole('heading', { name: /Strength of Schedule/i })).toBeVisible({ timeout: 10000 });

    await page.getByText('Standings', { exact: true }).click();
    await expect(page.getByRole('heading', { name: /Standings/i })).toBeVisible({ timeout: 10000 });

    // Table should be back
    const table = page.locator('table').first();
    await expect(table).toBeVisible({ timeout: 10000 });
  });

  test('include in progress checkbox only visible in standings mode', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Standings/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Include In Progress/i)).toBeVisible();

    // Switch to SoS — checkbox should disappear
    await page.getByText('SoS', { exact: true }).click();
    await expect(page.getByRole('heading', { name: /Strength of Schedule/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Include In Progress/i)).not.toBeVisible();
  });
});
