// Temporary: regenerate tests/auth-state.json by logging in as the admin test user.
import { test } from "@playwright/test";
import { loginAs } from "./helpers/auth";

test.use({ storageState: { cookies: [], origins: [] } });

test("refresh auth state", async ({ page }) => {
  await loginAs(page, "admin");
  await page.context().storageState({ path: "tests/auth-state.json" });
});
