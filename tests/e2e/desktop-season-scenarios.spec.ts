import { test, expect } from '@playwright/test';

test.describe('Desktop: Season Scenarios', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/leagues');
    await page.getByRole('link', { name: /SMYB/ }).click();
    await page.getByRole('link', { name: /Mustang/ }).click();
    await page.getByRole('link', { name: /Spring 2026/ }).click();
    const tabNav = page.getByRole('complementary').first();
    await tabNav.getByRole('link', { name: 'Scenarios' }).click();
  });

  test('scenarios heading is visible', async ({ page }) => {
    await expect(page.getByText(/Scenarios/i).first()).toBeVisible({ timeout: 10000 });
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
    await expect(modeSelect.locator('option', { hasText: /or better/i })).toBeVisible();
    await expect(modeSelect.locator('option', { hasText: /Exactly/i })).toBeVisible();
  });

  test('page loads without errors', async ({ page }) => {
    await expect(page).not.toHaveTitle(/500|Error/i);
    await expect(page.getByText(/New Scenario/i)).toBeVisible({ timeout: 10000 });
  });
});
