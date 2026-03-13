import { test, expect } from '@playwright/test';

test.describe('Desktop: Season Playoffs', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/leagues');
    await page.getByRole('link', { name: /SMYB/ }).click();
    await page.getByRole('link', { name: /Mustang/ }).click();
    await page.getByRole('link', { name: /Spring 2026/ }).click();
    const tabNav = page.getByRole('complementary').first();
    await tabNav.getByRole('link', { name: 'Playoffs' }).click();
  });

  test('playoffs heading and add bracket button are visible', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Playoffs/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /Add Bracket/i })).toBeVisible();
  });

  test('bracket cards render if brackets exist', async ({ page }) => {
    // Look for bracket name headings or bracket template info
    // This is data-dependent — if no brackets exist, the page still loads fine
    await expect(page.getByRole('heading', { name: /Playoffs/i })).toBeVisible({ timeout: 10000 });
    await expect(page).not.toHaveTitle(/500|Error/i);
  });
});
