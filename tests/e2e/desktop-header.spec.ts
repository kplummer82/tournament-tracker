import { test, expect } from '@playwright/test';

test.describe('Desktop: Header', () => {
  test('brand and all nav links are visible on homepage', async ({ page }) => {
    await page.goto('/');
    const header = page.locator('header');

    // Brand link
    await expect(header.getByRole('link', { name: /Stacked Bench/i })).toBeVisible();

    // All 5 nav links visible
    await expect(header.getByRole('link', { name: 'Home' })).toBeVisible();
    await expect(header.getByRole('link', { name: 'Tournaments' })).toBeVisible();
    await expect(header.getByRole('link', { name: 'Leagues' })).toBeVisible();
    await expect(header.getByRole('link', { name: 'Teams' })).toBeVisible();
    await expect(header.getByRole('link', { name: 'Bracket Builder' })).toBeVisible();
  });

  test('active nav link is highlighted on tournaments page', async ({ page }) => {
    await page.goto('/tournaments');
    const header = page.locator('header');
    const tournamentsLink = header.getByRole('link', { name: 'Tournaments' });

    // Active link should have foreground text color (not muted)
    await expect(tournamentsLink).toHaveClass(/text-foreground/);
  });

  test('active nav link is highlighted on leagues page', async ({ page }) => {
    await page.goto('/leagues');
    const header = page.locator('header');
    const leaguesLink = header.getByRole('link', { name: 'Leagues' });

    await expect(leaguesLink).toHaveClass(/text-foreground/);
  });

  test('header is sticky at top of page', async ({ page }) => {
    await page.goto('/');
    const header = page.locator('header');

    // Header should be visible and sticky
    await expect(header).toBeVisible();
    await expect(header).toHaveClass(/sticky/);
    await expect(header).toHaveClass(/top-0/);
  });
});
