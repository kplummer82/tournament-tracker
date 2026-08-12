import { test, expect } from '@playwright/test';
import { gotoSeasonTab } from './helpers/navigate';

test.describe('Desktop: Season Standings — SoS Toggle', () => {
  test.beforeEach(async ({ page }) => {
    await gotoSeasonTab(page, 'Standings');
  });

  // The view switcher is a SegmentedControl of <button>s. Match it by role — a bare
  // getByText('Standings') also matches the season shell's mobile tab strip, which
  // is in the DOM but hidden at desktop widths.
  const viewButton = (page: import('@playwright/test').Page, name: string) =>
    page.getByRole('button', { name, exact: true });

  test('view switcher has Standings and SoS options', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Standings/i })).toBeVisible({ timeout: 10000 });
    await expect(viewButton(page, 'Standings')).toBeVisible();
    await expect(viewButton(page, 'SoS')).toBeVisible();
  });

  test('clicking SoS switches to Strength of Schedule view', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Standings/i })).toBeVisible({ timeout: 10000 });

    // Click the SoS toggle
    await page.getByText('SoS', { exact: true }).click();

    // Heading should change
    await expect(page.getByRole('heading', { name: /Strength of Schedule/i })).toBeVisible({ timeout: 10000 });
  });

  test('SoS view shows Full Season / Remaining toggle', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Standings/i })).toBeVisible({ timeout: 10000 });
    await page.getByText('SoS', { exact: true }).click();
    await expect(page.getByRole('heading', { name: /Strength of Schedule/i })).toBeVisible({ timeout: 10000 });

    // SoS sub-mode toggle should appear
    await expect(page.getByText('Full Season', { exact: true })).toBeVisible();
    await expect(page.getByText('Remaining', { exact: true })).toBeVisible();
  });

  test('switching back to Standings restores table', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Standings/i })).toBeVisible({ timeout: 10000 });

    // Switch to SoS then back
    await viewButton(page, 'SoS').click();
    await expect(page.getByRole('heading', { name: /Strength of Schedule/i })).toBeVisible({ timeout: 10000 });

    await viewButton(page, 'Standings').click();
    await expect(page.getByRole('heading', { name: /Standings/i })).toBeVisible({ timeout: 10000 });

    // Table should be back
    const table = page.locator('table').first();
    await expect(table).toBeVisible({ timeout: 10000 });
  });

  test('standings mode toggle only visible in standings mode', async ({ page }) => {
    // The old "Include In Progress" checkbox is now a Current/Live/As-of toggle.
    await expect(page.getByRole('heading', { name: /Standings/i })).toBeVisible({ timeout: 10000 });
    await expect(viewButton(page, 'Live')).toBeVisible();

    // Switch to SoS — the standings-only mode toggle should disappear
    await viewButton(page, 'SoS').click();
    await expect(page.getByRole('heading', { name: /Strength of Schedule/i })).toBeVisible({ timeout: 10000 });
    await expect(viewButton(page, 'Live')).toBeHidden();
  });
});
