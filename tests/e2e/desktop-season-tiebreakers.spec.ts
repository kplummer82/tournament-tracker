import { test, expect } from '@playwright/test';
import { gotoSeasonTab } from './helpers/navigate';

test.describe('Desktop: Season Tiebreakers', () => {
  test.beforeEach(async ({ page }) => {
    await gotoSeasonTab(page, 'Tiebreakers');
  });

  test('tiebreakers heading is visible', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Tiebreakers/i })).toBeVisible({ timeout: 10000 });
  });

  test('page describes tiebreaker purpose', async ({ page }) => {
    await expect(page.getByText(/when teams are tied/i)).toBeVisible({ timeout: 10000 });
  });

  test('available tiebreakers list is shown', async ({ page }) => {
    // Assert on the configured rules themselves. A bare getByText(/Tiebreakers/i)
    // matches the season shell's mobile tab strip, which is hidden at this width.
    await expect(page.getByText('Win-Loss Percentage')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: 'Drag to reorder' }).first()).toBeVisible();
    await expect(page).not.toHaveTitle(/500|Error/i);
  });

  test('page loads without errors', async ({ page }) => {
    await expect(page).not.toHaveTitle(/500|Error/i);
    await expect(page.getByRole('heading', { name: /Tiebreakers/i })).toBeVisible({ timeout: 10000 });
  });
});
