import { test, expect } from '@playwright/test';

test.describe('Smoke tests', () => {
  test('homepage loads', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBeLessThan(400);
  });

  test('tournaments page loads and shows list', async ({ page }) => {
    await page.goto('/tournaments');
    await expect(page.locator('h1, h2').first()).toContainText(/Tournaments/i);
  });

  test('leagues page loads', async ({ page }) => {
    await page.goto('/leagues');
    await expect(page.locator('h1, h2').first()).toContainText(/Leagues/i);
  });

  test('teams page loads', async ({ page }) => {
    await page.goto('/teams');
    await expect(page.locator('h1, h2').first()).toContainText(/Teams/i);
  });
});
