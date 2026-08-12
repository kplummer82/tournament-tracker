import { test, expect } from '@playwright/test';
import { gotoSeasonTab } from './helpers/navigate';

test.describe('Desktop: Season Scenarios', () => {
  test.beforeEach(async ({ page }) => {
    await gotoSeasonTab(page, 'Scenarios');
  });

  test('scenarios heading is visible', async ({ page }) => {
    // Match the heading, not bare text — getByText(/Scenarios/i) also matches the
    // season shell's mobile tab strip, which is hidden at desktop widths.
    await expect(page.getByRole('heading', { name: 'Scenarios', exact: true })).toBeVisible({ timeout: 10000 });
  });

  test('new scenario form renders with all fields', async ({ page }) => {
    await expect(page.getByText(/New Scenario/i)).toBeVisible({ timeout: 10000 });

    // Team select
    const teamSelect = page.locator('label', { hasText: 'Team' }).locator('select');
    await expect(teamSelect).toBeVisible();

    // Seed select (should be a dropdown, not number input)
    const seedLabel = page.locator('label', { hasText: 'Seed' }).first();
    await expect(seedLabel.locator('select')).toBeVisible();
    await expect(seedLabel.locator('input[type="number"]')).toHaveCount(0);

    // Mode select
    const modeSelect = page.locator('label', { hasText: 'Mode' }).locator('select');
    await expect(modeSelect).toBeVisible();

    // Analyze button
    await expect(page.getByRole('button', { name: /Analyze Scenario/i })).toBeVisible();
  });

  test('team select is populated with teams', async ({ page }) => {
    await expect(page.getByText(/New Scenario/i)).toBeVisible({ timeout: 10000 });
    const teamSelect = page.locator('label', { hasText: 'Team' }).locator('select');
    const options = teamSelect.locator('option');
    expect(await options.count()).toBeGreaterThan(0);
  });

  test('mode select has or_better and exact options', async ({ page }) => {
    await expect(page.getByText(/New Scenario/i)).toBeVisible({ timeout: 10000 });
    const modeSelect = page.locator('label', { hasText: 'Mode' }).locator('select');
    // <option>s inside a closed <select> are never "visible" to Playwright —
    // assert on their text instead.
    const options = (await modeSelect.locator('option').allTextContents()).join(' | ');
    expect(options).toMatch(/or better/i);
    expect(options).toMatch(/exactly/i);
  });

  test('page loads without errors', async ({ page }) => {
    await expect(page).not.toHaveTitle(/500|Error/i);
    await expect(page.getByText(/New Scenario/i)).toBeVisible({ timeout: 10000 });
  });
});
