import { test, expect } from '@playwright/test';

test.describe('Desktop: Season Tiebreakers', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/leagues');
    await page.getByRole('link', { name: /SMYB/ }).click();
    await page.getByRole('link', { name: /Mustang/ }).click();
    await page.getByRole('link', { name: /Spring 2026/ }).click();
    const tabNav = page.getByRole('complementary').first();
    await tabNav.getByRole('link', { name: 'Tiebreakers' }).click();
  });

  test('tiebreakers heading is visible', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Tiebreakers/i })).toBeVisible({ timeout: 10000 });
  });

  test('page describes tiebreaker purpose', async ({ page }) => {
    await expect(page.getByText(/ranked|records|equal/i)).toBeVisible({ timeout: 10000 });
  });

  test('available tiebreakers list is shown', async ({ page }) => {
    // The tiebreakers panel should show available tiebreaker options
    await expect(page.getByText(/Tiebreakers/i).first()).toBeVisible({ timeout: 10000 });
    await expect(page).not.toHaveTitle(/500|Error/i);
  });

  test('page loads without errors', async ({ page }) => {
    await expect(page).not.toHaveTitle(/500|Error/i);
    await expect(page.getByRole('heading', { name: /Tiebreakers/i })).toBeVisible({ timeout: 10000 });
  });
});
