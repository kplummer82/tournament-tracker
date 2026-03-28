import { test, expect } from '@playwright/test';

test.describe('Mobile: Season Scenarios', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/leagues');
    await page.getByRole('link', { name: /SMYB/ }).click();
    await page.getByRole('link', { name: /Mustang/ }).click();
    await page.getByRole('link', { name: /Spring 2026/ }).click();
    // Mobile uses horizontal tab strip, not sidebar
    await page.getByRole('link', { name: 'Scenarios' }).click();
  });

  test('scenarios page loads with heading', async ({ page }) => {
    await expect(page.getByText(/Scenarios/i).first()).toBeVisible({ timeout: 10000 });
    await expect(page).not.toHaveTitle(/500|Error/i);
  });

  test('seed field is a select dropdown (not a number input)', async ({ page }) => {
    // Wait for the "New Scenario" form to render
    await expect(page.getByText(/New Scenario/i)).toBeVisible({ timeout: 10000 });

    // The seed field should be a <select>, not an <input type="number">
    const seedLabel = page.locator('label', { hasText: 'Seed' }).first();
    const seedSelect = seedLabel.locator('select');
    await expect(seedSelect).toBeVisible();

    // Should NOT have a number input
    const seedInput = seedLabel.locator('input[type="number"]');
    await expect(seedInput).toHaveCount(0);
  });

  test('seed dropdown has options matching team count', async ({ page }) => {
    await expect(page.getByText(/New Scenario/i)).toBeVisible({ timeout: 10000 });

    const seedLabel = page.locator('label', { hasText: 'Seed' }).first();
    const seedSelect = seedLabel.locator('select');

    // Get the number of options in the seed select
    const seedOptions = seedSelect.locator('option');
    const seedCount = await seedOptions.count();
    expect(seedCount).toBeGreaterThan(0);

    // Get the team select and compare option counts
    const teamLabel = page.locator('label', { hasText: 'Team' }).first();
    const teamOptions = teamLabel.locator('select option');
    const teamCount = await teamOptions.count();

    expect(seedCount).toBe(teamCount);
  });

  test('seed dropdown values are sequential integers', async ({ page }) => {
    await expect(page.getByText(/New Scenario/i)).toBeVisible({ timeout: 10000 });

    const seedLabel = page.locator('label', { hasText: 'Seed' }).first();
    const seedSelect = seedLabel.locator('select');
    const options = seedSelect.locator('option');
    const count = await options.count();

    for (let i = 0; i < count; i++) {
      await expect(options.nth(i)).toHaveText(String(i + 1));
    }
  });

  test('all three form selects are visible and tappable', async ({ page }) => {
    await expect(page.getByText(/New Scenario/i)).toBeVisible({ timeout: 10000 });

    // Team select
    const teamSelect = page.locator('label', { hasText: 'Team' }).locator('select');
    await expect(teamSelect).toBeVisible();

    // Seed select
    const seedSelect = page.locator('label', { hasText: 'Seed' }).first().locator('select');
    await expect(seedSelect).toBeVisible();

    // Mode select
    const modeSelect = page.locator('label', { hasText: 'Mode' }).locator('select');
    await expect(modeSelect).toBeVisible();
  });

  test('analyze button is visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Analyze Scenario/i })).toBeVisible({ timeout: 10000 });
  });
});
