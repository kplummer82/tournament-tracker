/**
 * Theme toggle tests.
 *
 * NOTE: The theme toggle button lives inside the <Header>, which is only rendered
 * on authenticated pages (AuthGate redirects unauthenticated visitors to /login).
 * These tests therefore verify the theming MECHANISM (CSS variables, localStorage,
 * anti-FOUC script) against the public /login page, which is accessible without auth.
 * Button-click UX is covered by manual QA or future auth-fixture tests.
 */
import { test, expect } from '@playwright/test';

test.describe('Theme Toggle', () => {
  test.beforeEach(async ({ page }) => {
    // Start from a clean slate on the public login page (no auth required)
    await page.goto('/login');
    await page.evaluate(() => localStorage.clear());
  });

  test('default theme is dark when localStorage has no value', async ({ page }) => {
    await page.goto('/login');
    const hasDark = await page.evaluate(() =>
      document.documentElement.classList.contains('dark')
    );
    expect(hasDark).toBe(true);
  });

  test('anti-FOUC script applies dark class before React hydrates', async ({ page }) => {
    // The inline script in _document.tsx runs before any JS bundle.
    // We verify it fires on a fresh load with no stored preference.
    await page.goto('/login');
    // By the time this check runs, the script has already executed
    const hasDark = await page.evaluate(() =>
      document.documentElement.classList.contains('dark')
    );
    expect(hasDark).toBe(true);
  });

  test('storing "light" in localStorage causes light theme on reload', async ({ page }) => {
    // Simulate what the toggle does: write to localStorage, then reload
    await page.evaluate(() => localStorage.setItem('theme', 'light'));
    await page.goto('/login'); // fresh load reads localStorage via anti-FOUC script

    const hasDark = await page.evaluate(() =>
      document.documentElement.classList.contains('dark')
    );
    expect(hasDark).toBe(false);
  });

  test('light theme: --background is warm off-white, not near-black', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('theme', 'light'));
    await page.goto('/login');

    const bg = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--background').trim()
    );
    expect(bg).toBe('#f7f7f5');
  });

  test('dark theme: --background is near-black', async ({ page }) => {
    // No localStorage entry → defaults to dark
    await page.goto('/login');

    const bg = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--background').trim()
    );
    expect(bg).toBe('#0c0c0c');
  });

  test('light theme: --badge-completed-text is dark amber (not yellow)', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('theme', 'light'));
    await page.goto('/login');

    const color = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--badge-completed-text').trim()
    );
    // Should be dark amber #7a6000, NOT the yellow #ffe500
    expect(color).not.toBe('#ffe500');
    expect(color).toBe('#7a6000');
  });

  test('dark theme: --badge-completed-text is yellow', async ({ page }) => {
    await page.goto('/login');

    const color = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--badge-completed-text').trim()
    );
    expect(color).toBe('#ffe500');
  });

  test('light theme: --primary is #ff4b00 (consistent across themes)', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('theme', 'light'));
    await page.goto('/login');

    const primary = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()
    );
    expect(primary).toBe('#ff4b00');
  });

  test('dark theme persists across page reload', async ({ page }) => {
    // Default is dark, reload should stay dark
    await page.goto('/login');
    await page.reload();
    const hasDark = await page.evaluate(() =>
      document.documentElement.classList.contains('dark')
    );
    expect(hasDark).toBe(true);
  });

  test('light theme persists across page reload', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('theme', 'light'));
    await page.goto('/login');
    await page.reload();
    const hasDark = await page.evaluate(() =>
      document.documentElement.classList.contains('dark')
    );
    expect(hasDark).toBe(false);
  });

  test('toggling theme class manually switches CSS variables', async ({ page }) => {
    await page.goto('/login');

    // Remove dark class → should pick up light vars
    await page.evaluate(() => document.documentElement.classList.remove('dark'));

    const lightBg = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--background').trim()
    );
    expect(lightBg).toBe('#f7f7f5');

    // Re-add dark class → should pick up dark vars
    await page.evaluate(() => document.documentElement.classList.add('dark'));

    const darkBg = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--background').trim()
    );
    expect(darkBg).toBe('#0c0c0c');
  });
});
