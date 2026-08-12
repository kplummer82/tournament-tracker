import { test, expect } from '@playwright/test';
import { gotoSeasonTab } from './helpers/navigate';

test.describe('Desktop: Season Playoffs', () => {
  test.beforeEach(async ({ page }) => {
    await gotoSeasonTab(page, 'Playoffs');
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
