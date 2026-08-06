// tests/e2e/helpers/auth.ts
// Shared auth utilities for RBAC E2E tests
import { type Page, type APIRequestContext, expect } from "@playwright/test";

/**
 * Test user credentials.
 * These should exist in the dev database.
 * Set via environment variables or use defaults for local dev.
 */
export const TEST_USERS = {
  admin: {
    email: process.env.TEST_ADMIN_EMAIL || "admin@test.stackedbench.com",
    password: process.env.TEST_ADMIN_PASSWORD || "TestAdmin123!",
  },
  regularUser: {
    email: process.env.TEST_USER_EMAIL || "user@test.stackedbench.com",
    password: process.env.TEST_USER_PASSWORD || "TestUser123!",
  },
} as const;

export type TestUserKey = keyof typeof TEST_USERS;

/**
 * Login as a specific test user via the UI login form.
 * Waits for successful redirect (session established).
 */
export async function loginAs(page: Page, userKey: TestUserKey): Promise<void> {
  const user = TEST_USERS[userKey];
  await page.goto("/login");
  await page.fill('input[type="email"]', user.email);
  await page.fill('input[type="password"]', user.password);
  await page.click('button[type="submit"]');
  // Wait for navigation away from login page
  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 15000,
  });
}

/**
 * Log in via the Better Auth API instead of driving the UI form. More robust
 * than loginAs for API-only specs: it sets the session cookie directly in the
 * browser context (page.request shares the context cookie jar), avoiding the
 * login page's client-side redirect race. Then primes the page on the app
 * origin so in-page fetch() calls send the session cookie.
 */
export async function apiLogin(page: Page, userKey: TestUserKey): Promise<void> {
  const user = TEST_USERS[userKey];
  const res = await page.request.post("/api/auth/sign-in/email", {
    data: { email: user.email, password: user.password },
  });
  if (!res.ok()) {
    throw new Error(`API login failed for ${userKey}: HTTP ${res.status()}`);
  }
  await page.goto("/");
}

/**
 * Make an authenticated API request using the page's cookies.
 */
export async function authedFetch(
  page: Page,
  method: string,
  url: string,
  body?: Record<string, unknown>
): Promise<{ status: number; data: any }> {
  const result = await page.evaluate(
    async ({ method, url, body }) => {
      const opts: RequestInit = {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      };
      if (body) opts.body = JSON.stringify(body);
      const res = await fetch(url, opts);
      const data = await res.json().catch(() => ({}));
      return { status: res.status, data };
    },
    { method, url, body }
  );
  return result;
}

/**
 * Ensure the user is logged in by checking if we get redirected to login.
 * If already logged in, this is a no-op. If not, performs login.
 */
export async function ensureLoggedIn(page: Page, userKey: TestUserKey): Promise<void> {
  await page.goto("/");
  const url = page.url();
  if (url.includes("/login") || url.includes("/sign-up")) {
    await loginAs(page, userKey);
  }
}
