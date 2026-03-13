import { test, expect } from '@playwright/test';

test.describe('Desktop: Leagues List', () => {
  test('leagues page renders with heading', async ({ page }) => {
    await page.goto('/leagues');
    await expect(page.locator('h1, h2').first()).toContainText(/Leagues/i);
  });

  test('league cards are visible with name', async ({ page }) => {
    await page.goto('/leagues');
    // SMYB league should be visible
    await expect(page.getByText('SMYB').first()).toBeVisible({ timeout: 10000 });
  });

  test('clicking a league shows divisions', async ({ page }) => {
    await page.goto('/leagues');
    await page.getByRole('link', { name: /SMYB/ }).click();

    // Should see Divisions heading
    await expect(page.getByText(/Divisions/i)).toBeVisible({ timeout: 10000 });

    // Mustang division should be visible
    await expect(page.getByText('Mustang').first()).toBeVisible();
  });

  test('clicking a division shows seasons', async ({ page }) => {
    await page.goto('/leagues');
    await page.getByRole('link', { name: /SMYB/ }).click();
    await page.getByRole('link', { name: /Mustang/ }).click();

    // Should see season(s) listed
    await expect(page.getByText(/Spring 2026/i)).toBeVisible({ timeout: 10000 });
  });

  test('clicking a season loads season shell with tabs', async ({ page }) => {
    await page.goto('/leagues');
    await page.getByRole('link', { name: /SMYB/ }).click();
    await page.getByRole('link', { name: /Mustang/ }).click();
    await page.getByRole('link', { name: /Spring 2026/ }).click();

    // Season shell should load — sidebar visible on desktop
    await expect(page.getByRole('complementary').first()).toBeVisible({ timeout: 10000 });
  });
});
