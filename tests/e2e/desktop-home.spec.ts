import { test, expect } from '@playwright/test';

test.describe('Desktop: Home Page', () => {
  test('hero section renders its heading', async ({ page }) => {
    await page.goto('/');

    // Hero is the three-line "Leagues. / Tournaments. / Stacked." lockup.
    await expect(page.getByRole('heading', { name: 'Leagues.', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Tournaments.', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Stacked.', exact: true })).toBeVisible();
    await expect(page.getByText(/Youth Sports Management Platform/i)).toBeVisible();
  });

  test('hero CTAs show only to signed-out visitors', async ({ page, browser }) => {
    // The default project carries an authenticated storageState; signed-in users
    // get no sign-up CTA.
    await page.goto('/');
    await expect(page.getByRole('link', { name: /Get started/i })).toHaveCount(0);

    const anon = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const anonPage = await anon.newPage();
    await anonPage.goto('/');
    await expect(anonPage.getByRole('link', { name: /Get started/i })).toBeVisible();
    await expect(anonPage.getByRole('link', { name: /Browse the guides/i })).toBeVisible();
    await anon.close();
  });

  test('how it works section shows 3 columns', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByText('Leagues & Seasons', { exact: true })).toBeVisible();
    await expect(page.getByText('Standings', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Brackets', { exact: true }).first()).toBeVisible();
  });

  test('page loads without errors', async ({ page }) => {
    await page.goto('/');

    // Page should load without server errors
    await expect(page).not.toHaveTitle(/500|Error/i);
  });
});
