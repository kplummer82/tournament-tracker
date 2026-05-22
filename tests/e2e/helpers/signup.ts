import type { Page, APIRequestContext } from "@playwright/test";
import { expect } from "@playwright/test";

export type SignupIntent =
  | "follower"
  | "coach"
  | "league_operator"
  | "tournament_organizer";

const DEFAULT_PASSWORD = "TestSignup123!";

export function generateTestEmail(intent: SignupIntent): string {
  const stamp = Date.now();
  const suffix = Math.random().toString(36).slice(2, 8);
  return `e2e-${intent}-${stamp}-${suffix}@test.stackedbench.com`;
}

/**
 * Drive the real sign-up UI for the given intent. Starts from a clean
 * (unauthenticated) state — caller is responsible for using a fresh
 * browser context. Resolves after the post-signup redirect completes.
 *
 * Returns the credentials and the resulting user id (read from
 * /api/auth/get-session after redirect).
 */
export async function signUpWithIntent(
  page: Page,
  intent: SignupIntent
): Promise<{ email: string; password: string; userId: string | null }> {
  const email = generateTestEmail(intent);
  const password = DEFAULT_PASSWORD;
  const name = `E2E ${intent} ${Date.now()}`;

  await page.goto("/sign-up");
  await page.getByTestId(`intent-${intent}`).click();
  await page.fill('input[type="text"]', name);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.getByTestId("submit-credentials").click();

  // Wait until we leave /sign-up — could land on /tournaments, /leagues/new,
  // /tournaments/new, /welcome/coach, /welcome/pending, or /login?registered=1.
  await page.waitForURL(
    (url) => !url.pathname.startsWith("/sign-up"),
    { timeout: 20000 }
  );

  // In approval mode without auto-login, the redirect lands on /login and
  // the user has no live session — don't assert userId in that case.
  const onLoginPage = new URL(page.url()).pathname.startsWith("/login");
  let userId: string | null = null;
  if (!onLoginPage) {
    userId = await page.evaluate(async () => {
      const res = await fetch("/api/auth/get-session", { credentials: "include" });
      if (!res.ok) return null;
      const data = await res.json();
      return data?.user?.id ?? data?.data?.user?.id ?? null;
    });
    expect(userId, "expected a user id after signup").toBeTruthy();
  }

  return { email, password, userId };
}

/**
 * Delete a user created during a test. Uses an admin-authenticated request
 * context so we don't disturb the page's own auth state.
 */
export async function cleanupTestUser(
  request: APIRequestContext,
  userId: string
): Promise<void> {
  const res = await request.delete(`/api/admin/users/${encodeURIComponent(userId)}`);
  if (!res.ok()) {
    console.warn(
      `[e2e cleanup] delete user ${userId} returned ${res.status()} — leaving row behind`
    );
  }
}
