import { test, expect, request as playwrightRequest, type Page } from "@playwright/test";
import { Client } from "pg";
import { readFileSync } from "fs";
import path from "path";

/**
 * Email-OTP MFA end-to-end: enable → challenged login → wrong/right code →
 * trusted device skip → revoke → re-challenge → disable.
 *
 * Uses a DEDICATED test user — never the shared fixture users in
 * tests/auth-state.json (enabling MFA on those would break every other spec).
 * Codes are read straight from the dev DB (mfa_challenges) instead of email.
 */

// Fresh, logged-out context per test — MFA state is per-user server-side.
test.use({ storageState: { cookies: [], origins: [] } });

// Local-only: reads the dev DATABASE_URL and drives the local auth proxy.
test.beforeEach(({}, testInfo) => {
  test.skip(
    testInfo.project.name !== "default",
    "mfa specs run only in the default (local) project"
  );
});

// Serial: later tests depend on the MFA state earlier tests created.
test.describe.configure({ mode: "serial" });

const MFA_USER = {
  name: "MFA Test",
  email: process.env.TEST_MFA_EMAIL || "mfa-test@test.stackedbench.com",
  password: process.env.TEST_MFA_PASSWORD || "MfaTest123!",
};

let userId: string;

// ── DB access (codes + state reset) ──────────────────────────────────────────

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

/** Latest active code for the user; polls because the insert races the UI. */
async function latestCode(purpose: "login" | "enable"): Promise<string> {
  let code: string | undefined;
  await expect
    .poll(
      async () => {
        const rows = await dbQuery<{ code: string }>(
          `SELECT code FROM mfa_challenges
           WHERE user_id = $1 AND purpose = $2 AND consumed_at IS NULL
           ORDER BY created_at DESC LIMIT 1`,
          [userId, purpose]
        );
        code = rows[0]?.code;
        return code ?? null;
      },
      { timeout: 10_000 }
    )
    .not.toBeNull();
  return code!;
}

/** Reset the user to a clean no-MFA state (also resets the hourly send cap). */
async function resetMfaState(): Promise<void> {
  await dbQuery(
    `UPDATE user_profiles SET mfa_enabled = FALSE WHERE user_id = $1`,
    [userId]
  );
  await dbQuery(`DELETE FROM mfa_challenges WHERE user_id = $1`, [userId]);
  await dbQuery(`DELETE FROM mfa_trusted_devices WHERE user_id = $1`, [userId]);
  await dbQuery(`DELETE FROM mfa_verified_sessions WHERE user_id = $1`, [userId]);
}

// ── UI helpers ────────────────────────────────────────────────────────────────

async function uiLogin(page: Page): Promise<void> {
  await page.goto("/login");
  await page.fill('input[type="email"]', MFA_USER.email);
  await page.fill('input[type="password"]', MFA_USER.password);
  await page.click('button[type="submit"]');
}

async function uiSignOut(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL(/\/login/, { timeout: 15_000 });
}

// ── Setup: ensure the dedicated user exists, then wipe its MFA state ─────────

test.beforeAll(async ({ }, testInfo) => {
  if (testInfo.project.name !== "default") return;
  const baseURL = testInfo.project.use.baseURL as string | undefined;
  const ctx = await playwrightRequest.newContext({ baseURL });

  const signIn = await ctx.post("/api/auth/sign-in/email", {
    data: { email: MFA_USER.email, password: MFA_USER.password },
    headers: { "Content-Type": "application/json" },
  });
  let body = await signIn.json().catch(() => ({}));
  if (!signIn.ok()) {
    const signUp = await ctx.post("/api/auth/sign-up/email", {
      data: MFA_USER,
      headers: { "Content-Type": "application/json" },
    });
    if (!signUp.ok()) {
      throw new Error(
        `[mfa.spec] could not sign in or sign up ${MFA_USER.email}: ${signUp.status()} ${await signUp.text()}`
      );
    }
    body = await signUp.json().catch(() => ({}));
  }
  userId = body?.data?.user?.id ?? body?.user?.id;
  if (!userId) throw new Error("[mfa.spec] no user id in auth response");
  await ctx.dispose();

  await resetMfaState();
});

test.afterAll(async ({}, testInfo) => {
  if (testInfo.project.name !== "default" || !userId) return;
  // Leave the user MFA-off so reruns and other tooling start clean.
  await resetMfaState();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

test("enable MFA from the account page", async ({ page }) => {
  await uiLogin(page);
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15_000 });

  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "Two-Step Verification" })).toBeVisible();
  await page.getByRole("button", { name: "Turn on" }).click();
  await expect(page.getByText("Code sent — check your email.")).toBeVisible({ timeout: 15_000 });

  const code = await latestCode("enable");
  await page.getByPlaceholder("000000").fill(code);
  await page.getByRole("button", { name: "Verify & turn on" }).click();

  await expect(page.getByText("On", { exact: true })).toBeVisible({ timeout: 15_000 });
  const rows = await dbQuery<{ mfa_enabled: boolean }>(
    `SELECT mfa_enabled FROM user_profiles WHERE user_id = $1`,
    [userId]
  );
  expect(rows[0]?.mfa_enabled).toBe(true);
});

test("login challenges, rejects a wrong code, accepts the right one, trusts the device", async ({ page }) => {
  await uiLogin(page);
  await page.waitForURL(/\/mfa\/verify/, { timeout: 15_000 });
  await expect(page.getByText("Code sent — check your email.")).toBeVisible({ timeout: 15_000 });

  // While MFA-pending, data APIs must 401 with the mfa_required code.
  const gated = await page.request.get("/api/me/roles");
  expect(gated.status()).toBe(401);
  expect((await gated.json()).code).toBe("mfa_required");

  // Wrong code → attempts-remaining error.
  const realCode = await latestCode("login");
  const wrongCode = realCode === "111111" ? "222222" : "111111";
  await page.getByPlaceholder("000000").fill(wrongCode);
  await page.getByRole("button", { name: "Verify", exact: true }).click();
  await expect(page.getByText(/That code isn't right\. \d attempts? remaining\./)).toBeVisible();

  // Right code + remember device → callback, APIs open up.
  await page.getByRole("checkbox", { name: /Remember this device/ }).check();
  await page.getByPlaceholder("000000").fill(realCode);
  await page.getByRole("button", { name: "Verify", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.includes("/mfa/verify"), { timeout: 15_000 });

  const open = await page.request.get("/api/me/roles");
  expect(open.status()).toBe(200);

  // Trusted device: a fresh sign-in from this browser skips the challenge.
  await uiSignOut(page);
  await uiLogin(page);
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15_000 });
  expect(page.url()).not.toMatch(/\/mfa\/verify/);

  // Revoke the device → next sign-in is challenged again.
  await page.goto("/account");
  await expect(page.getByText("This device")).toBeVisible();
  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText("No trusted devices.")).toBeVisible({ timeout: 15_000 });

  await uiSignOut(page);
  await uiLogin(page);
  await page.waitForURL(/\/mfa\/verify/, { timeout: 15_000 });
});

test("disable MFA restores password-only sign-in", async ({ page }) => {
  await uiLogin(page);
  await page.waitForURL(/\/mfa\/verify/, { timeout: 15_000 });
  await expect(page.getByText("Code sent — check your email.")).toBeVisible({ timeout: 15_000 });

  const code = await latestCode("login");
  await page.getByPlaceholder("000000").fill(code);
  await page.getByRole("button", { name: "Verify", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.includes("/mfa/verify"), { timeout: 15_000 });

  await page.goto("/account");
  await page.getByRole("button", { name: "Turn off" }).click();
  // Confirm in the alert dialog.
  await page.getByRole("alertdialog").getByRole("button", { name: "Turn off" }).click();
  await expect(page.getByText("Off", { exact: true })).toBeVisible({ timeout: 15_000 });

  await uiSignOut(page);
  await uiLogin(page);
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15_000 });
  expect(page.url()).not.toMatch(/\/mfa\/verify/);
});
