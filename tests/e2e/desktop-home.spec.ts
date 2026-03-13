import { test, expect } from '@playwright/test';

test.describe('Desktop: Home Page', () => {
  test('hero section renders with heading and CTAs', async ({ page }) => {
    await page.goto('/');

    // Hero heading
    await expect(page.getByText('Track Every')).toBeVisible();
    await expect(page.getByText('Tournament.')).toBeVisible();

    // CTA buttons
    await expect(page.getByRole('link', { name: /Browse Tournaments/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Manage Teams/i })).toBeVisible();
  });

  test('how it works section shows 3 columns', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByText('Pool Play', { exact: true })).toBeVisible();
    await expect(page.getByText('Standings', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Bracket Play', { exact: true })).toBeVisible();
  });

  test('page loads without errors', async ({ page }) => {
    await page.goto('/');

    // Page should load without server errors
    await expect(page).not.toHaveTitle(/500|Error/i);
  });
});
