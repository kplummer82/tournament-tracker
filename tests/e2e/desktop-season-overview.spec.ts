import { test, expect } from '@playwright/test';
import { gotoSeasonTab } from './helpers/navigate';

test.describe('Desktop: Season Overview', () => {
  test.beforeEach(async ({ page }) => {
    await gotoSeasonTab(page, 'Overview');
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
