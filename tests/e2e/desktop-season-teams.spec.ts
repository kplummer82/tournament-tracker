import { test, expect } from '@playwright/test';
import { gotoSeasonTab } from './helpers/navigate';

test.describe('Desktop: Season Teams', () => {
  test.beforeEach(async ({ page }) => {
    await gotoSeasonTab(page, 'Teams');
  });

  test('teams page loads without errors', async ({ page }) => {
    await expect(page).not.toHaveTitle(/500|Error/i);
    // Look for the teams heading or team count text
    await expect(page.getByText(/team/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('action buttons are visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: /New Team/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /Add Teams/i })).toBeVisible();
  });

  test('new team button shows create form', async ({ page }) => {
    await expect(page.getByRole('button', { name: /New Team/i })).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: /New Team/i }).click();

    // Create form should appear with a team name input
    await expect(page.getByPlaceholder(/Team name/i)).toBeVisible();
  });
});
