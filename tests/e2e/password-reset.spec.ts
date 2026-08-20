import { test, expect, request as playwrightRequest, type Page } from "@playwright/test";
import { Client } from "pg";
import { readFileSync } from "fs";
import path from "path";

/**
 * Forgot/reset password end-to-end: request a reset link → consume the token →
 * sign in with the new password → dead-token states.
 *
 * Uses a DEDICATED test user. The reset token is read straight from the dev DB
 * (neon_auth.verification) instead of email, so the Neon-Auth redirect hop is
 * skipped — the page only consumes ?token, which is what the redirect delivers.
 *
 * The user's password alternates between two known values so reruns always
 * find a working one.
 */

// Fresh, logged-out context per test — this is a pre-login flow.
test.use({ storageState: { cookies: [], origins: [] } });

// Local-only: reads the dev DATABASE_URL directly.
test.beforeEach(({}, testInfo) => {
  test.skip(
    testInfo.project.name !== "default",
    "password-reset specs run only in the default (local) project"
  );
});

// Serial: the negative tests reuse the token the first test consumed.
test.describe.configure({ mode: "serial" });

const RESET_USER = {
  name: "Reset Test",
  email: process.env.TEST_RESET_EMAIL || "reset-test@test.stackedbench.com",
};
const PASSWORD_A = "ResetTestA123!";
const PASSWORD_B = "ResetTestB123!";

let userId: string;
let currentPassword: string;
let newPassword: string;
let consumedToken: string;

// ── DB access (tokens) ───────────────────────────────────────────────────────

function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envFile = readFileSync(path.join(__dirname, "../../.env.local"), "utf8");
  const m = envFile.match(/^DATABASE_URL=(.+)$/m);
  if (!m) throw new Error("DATABASE_URL not found in env or .env.local");
  return m[1].trim().replace(/^["']|["']$/g, "");
}

async function dbQuery<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const client = new Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    const res = await client.query(sql, params);
    return res.rows as T[];
  } finally {
    await client.end();
  }
}

async function clearResetTokens(): Promise<void> {
  await dbQuery(
    `DELETE FROM neon_auth.verification
     WHERE identifier LIKE 'reset-password:%' AND value LIKE '%' || $1 || '%'`,
    [userId]
  );
}

/** Latest reset token for the user; polls because the insert races the UI. */
async function latestResetToken(): Promise<string> {
  let token: string | undefined;
  await expect
    .poll(
      async () => {
        const rows = await dbQuery<{ identifier: string }>(
          `SELECT identifier FROM neon_auth.verification
           WHERE identifier LIKE 'reset-password:%' AND value LIKE '%' || $1 || '%'
           ORDER BY "createdAt" DESC LIMIT 1`,
          [userId]
        );
        token = rows[0]?.identifier?.replace(/^reset-password:/, "");
        return token ?? null;
      },
      { timeout: 10_000 }
    )
    .not.toBeNull();
  return token!;
}

// ── Setup: ensure the dedicated user exists; learn which password works ──────

test.beforeAll(async ({}, testInfo) => {
  if (testInfo.project.name !== "default") return;
  const baseURL = testInfo.project.use.baseURL as string | undefined;
  const ctx = await playwrightRequest.newContext({ baseURL });

  let body: { data?: { user?: { id?: string } }; user?: { id?: string } } = {};
  for (const password of [PASSWORD_A, PASSWORD_B]) {
    const signIn = await ctx.post("/api/auth/sign-in/email", {
      data: { email: RESET_USER.email, password },
      headers: { "Content-Type": "application/json" },
    });
    if (signIn.ok()) {
      currentPassword = password;
      body = await signIn.json().catch(() => ({}));
      break;
    }
  }
  if (!currentPassword) {
    const signUp = await ctx.post("/api/auth/sign-up/email", {
      data: { ...RESET_USER, password: PASSWORD_A },
      headers: { "Content-Type": "application/json" },
    });
    if (!signUp.ok()) {
      throw new Error(
        `[password-reset.spec] could not sign in or sign up ${RESET_USER.email}: ${signUp.status()} ${await signUp.text()}`
      );
    }
    currentPassword = PASSWORD_A;
    body = await signUp.json().catch(() => ({}));
  }
  newPassword = currentPassword === PASSWORD_A ? PASSWORD_B : PASSWORD_A;
  userId = body?.data?.user?.id ?? body?.user?.id ?? "";
  if (!userId) throw new Error("[password-reset.spec] no user id in auth response");
  await ctx.dispose();

  await clearResetTokens();
});

// ── UI helpers ───────────────────────────────────────────────────────────────

async function uiLogin(page: Page, password: string): Promise<void> {
  await page.goto("/login");
  await page.fill('input[type="email"]', RESET_USER.email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
}

// ── Tests ────────────────────────────────────────────────────────────────────

test("request a reset link, set a new password, sign in with it", async ({ page }) => {
  // /login links to the forgot page.
  await page.goto("/login");
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await page.waitForURL(/\/forgot-password/);

  await page.fill('input[type="email"]', RESET_USER.email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(
    page.getByText("If an account exists for that email, we sent a password reset link.", { exact: false })
  ).toBeVisible({ timeout: 15_000 });

  // Read the token from the DB (skips email delivery).
  const token = await latestResetToken();
  consumedToken = token;

  await page.goto(`/reset-password?token=${encodeURIComponent(token)}`);

  // Client-side validation: too short, then mismatch.
  await page.fill('input[autocomplete="new-password"] >> nth=0', "short");
  await page.fill('input[autocomplete="new-password"] >> nth=1', "short");
  await page.getByRole("button", { name: "Set new password" }).click();
  await expect(page.getByText("Password must be at least 8 characters.")).toBeVisible();

  await page.fill('input[autocomplete="new-password"] >> nth=0', newPassword);
  await page.fill('input[autocomplete="new-password"] >> nth=1', newPassword + "x");
  await page.getByRole("button", { name: "Set new password" }).click();
  await expect(page.getByText("Passwords don't match.")).toBeVisible();

  // Valid submit → login page with the success notice.
  await page.fill('input[autocomplete="new-password"] >> nth=1', newPassword);
  await page.getByRole("button", { name: "Set new password" }).click();
  await page.waitForURL(/\/login\?reset=1/, { timeout: 15_000 });
  await expect(page.getByText("Password updated. Sign in with your new password.")).toBeVisible();

  // Old password no longer works.
  await uiLogin(page, currentPassword);
  await expect(
    page.locator("p.text-destructive")
  ).toBeVisible({ timeout: 15_000 });

  // New password signs in.
  await uiLogin(page, newPassword);
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15_000 });
});

test("a consumed token cannot be reused", async ({ page }) => {
  await page.goto(`/reset-password?token=${encodeURIComponent(consumedToken)}`);
  await page.fill('input[autocomplete="new-password"] >> nth=0', "AnotherPass123!");
  await page.fill('input[autocomplete="new-password"] >> nth=1', "AnotherPass123!");
  await page.getByRole("button", { name: "Set new password" }).click();

  await expect(page.getByText("This reset link is invalid or has expired.")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("link", { name: "Request a new link" })).toBeVisible();
});

test("invalid-link states render without a form", async ({ page }) => {
  // The page renders a spinner until router.isReady flips, so these wait
  // explicitly rather than on the 5s default — a cold dev route can exceed it.
  const INVALID = "This reset link is invalid or has expired.";

  // Neon Auth redirects expired/used links with ?error=INVALID_TOKEN.
  await page.goto("/reset-password?error=INVALID_TOKEN");
  await expect(page.getByText(INVALID)).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('input[type="password"]')).toHaveCount(0);

  // No token at all.
  await page.goto("/reset-password");
  await expect(page.getByText(INVALID)).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
});

test("unknown email gets the same generic notice", async ({ page }) => {
  await page.goto("/forgot-password");
  await page.fill('input[type="email"]', "does-not-exist@test.stackedbench.com");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(
    page.getByText("If an account exists for that email, we sent a password reset link.", { exact: false })
  ).toBeVisible({ timeout: 15_000 });
});
