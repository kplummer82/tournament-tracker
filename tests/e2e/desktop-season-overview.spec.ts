import { test, expect } from '@playwright/test';

test.describe('Desktop: Season Overview', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/leagues');
    await page.getByRole('link', { name: /SMYB/ }).click();
    await page.getByRole('link', { name: /Mustang/ }).click();
    await page.getByRole('link', { name: /Spring 2026/ }).click();
    const tabNav = page.getByRole('complementary').first();
    await tabNav.getByRole('link', { name: 'Overview' }).click();
  });

  test('overview form loads with season name', async ({ page }) => {
    // The overview form should show the season name field
    const nameInput = page.locator('input').first();
    await expect(nameInput).toBeVisible({ timeout: 10000 });
    await expect(nameInput).not.toHaveValue('');
  });

  test('basic information section is visible', async ({ page }) => {
    await expect(page.getByText(/Basic Information/i)).toBeVisible({ timeout: 10000 });
  });

  test('year field is present', async ({ page }) => {
    await expect(page.getByText(/Year/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('season type selector is present', async ({ page }) => {
    await expect(page.getByText(/Season type/i)).toBeVisible({ timeout: 10000 });
  });

  test('status selector is present', async ({ page }) => {
    await expect(page.getByText(/Status/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('page loads without errors', async ({ page }) => {
    await expect(page).not.toHaveTitle(/500|Error/i);
    await expect(page.getByText(/Basic Information/i)).toBeVisible({ timeout: 10000 });
  });
});
