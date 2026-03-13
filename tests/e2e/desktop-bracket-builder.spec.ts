import { test, expect } from '@playwright/test';

test.describe('Desktop: Bracket Builder', () => {
  test('bracket builder page loads with heading', async ({ page }) => {
    await page.goto('/bracket-builder');
    await expect(page.getByRole('heading', { name: /Bracket Builder/i })).toBeVisible();
  });

  test('source toggle buttons are visible', async ({ page }) => {
    await page.goto('/bracket-builder');

    await expect(page.getByRole('button', { name: /Build from scratch/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Start from library/i })).toBeVisible();
  });

  test('bracket type buttons are visible in scratch mode', async ({ page }) => {
    await page.goto('/bracket-builder');

    // Click "Build from scratch" if not already active
    await page.getByRole('button', { name: /Build from scratch/i }).click();

    // Should see bracket type options
    await expect(page.getByRole('button', { name: /Single Elimination/i })).toBeVisible();
  });

  test('bracket workspace panel is visible', async ({ page }) => {
    await page.goto('/bracket-builder');

    await expect(page.getByText(/Bracket Workspace/i)).toBeVisible();
  });
});
