import { test, expect } from '@playwright/test';
import { gotoMustangSeason } from './helpers/navigate';

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

  // The hierarchy is league → season → division. League detail lists seasons;
  // the league's divisions live behind a "Manage divisions" disclosure.
  test('clicking a league shows its seasons', async ({ page }) => {
    await page.goto('/leagues');
    await page.getByRole('link', { name: /SMYB/ }).click();

    await expect(page.getByRole('link', { name: /2026 Spring/ })).toBeVisible({ timeout: 10000 });
  });

  test('league detail can reveal its divisions', async ({ page }) => {
    await page.goto('/leagues');
    await page.getByRole('link', { name: /SMYB/ }).click();

    // Divisions are collapsed until the disclosure is opened.
    await expect(page.getByText('Mustang')).toHaveCount(0);
    await page.getByRole('button', { name: /Manage divisions/i }).click();
    await expect(page.getByText('Mustang').first()).toBeVisible({ timeout: 10000 });
  });

  test('clicking a season shows its divisions', async ({ page }) => {
    await page.goto('/leagues');
    await page.getByRole('link', { name: /SMYB/ }).click();
    await page.getByRole('link', { name: /2026 Spring/ }).click();

    await expect(page.getByRole('link', { name: /Mustang/ })).toBeVisible({ timeout: 10000 });
  });

  test('clicking a division loads the season shell with tabs', async ({ page }) => {
    await gotoMustangSeason(page);

    // Season shell should load — sidebar visible on desktop
    await expect(page.getByRole('complementary').first()).toBeVisible({ timeout: 10000 });
  });
});
