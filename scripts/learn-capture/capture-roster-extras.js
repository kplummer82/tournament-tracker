/* Captures the three extra roster-guide screenshots (both themes: dark = base
   name, light = -light suffix), reusing the same seeded demo world and styling
   as capture-learn.js:
     - roster-empty:       an empty team's Roster tab (the blank slate)
     - roster-parent-view: the Thunderhawks roster with Team Parent View on
     - roster-danger:      a player's Danger Zone card (edit or remove)
   Requires the dev server on :3000 and the demo world seeded (demo-ids.json). */
const fs = require("fs");
const path = require("path");
const { chromium } = require("@playwright/test");

const BASE = "http://localhost:3000";
const OUT = path.resolve(__dirname, "../../public/learn");
const IDS = JSON.parse(fs.readFileSync(path.join(__dirname, "demo-ids.json"), "utf8"));
const AUTH_TMP = path.join(__dirname, "capture-auth.json");

const EMPTY_TEAM = IDS.teamIds["River Otters"]; // seeded with no roster
const PLAYER_RID = IDS.rosterIds["5"];          // Ziggy R — same player as positions.png

const settle = async (page, ms = 900) => {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(ms);
  await page.evaluate(() => document.querySelectorAll("nextjs-portal").forEach((e) => e.remove()));
};

const shoot = (page, name, theme, target) => {
  const file = `${OUT}/${name}${theme === "light" ? "-light" : ""}.png`;
  return target
    ? page.locator(target).screenshot({ path: file })
    : page.screenshot({ path: file });
};

(async () => {
  const browser = await chromium.launch();

  // Login once, reuse the session in themed contexts
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/login`);
    await page.fill('input[type="email"]', "admin@test.stackedbench.com");
    await page.fill('input[type="password"]', "TestAdmin123!");
    await page.click('button[type="submit"]');
    await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20000 });

    // Sanity-check the demo world is present before shooting.
    const counts = await page.evaluate(
      async ({ hawks, empty }) => {
        const a = await fetch(`/api/teams/${hawks}/roster`, { credentials: "include" }).then((r) => r.json());
        const b = await fetch(`/api/teams/${empty}/roster`, { credentials: "include" }).then((r) => r.json());
        return { hawks: (a.roster ?? []).length, empty: (b.roster ?? []).length };
      },
      { hawks: IDS.hawks, empty: EMPTY_TEAM }
    );
    console.log("roster counts:", counts);
    if (counts.hawks === 0) throw new Error("Thunderhawks roster is empty — demo world not seeded?");
    if (counts.empty !== 0) console.warn(`WARNING: 'empty' team ${EMPTY_TEAM} has ${counts.empty} people`);

    await ctx.storageState({ path: AUTH_TMP });
    await ctx.close();
  }

  const themedContext = async (theme) => {
    const ctx = await browser.newContext({
      viewport: { width: 1600, height: 900 },
      deviceScaleFactor: 1.5,
      storageState: AUTH_TMP,
    });
    await ctx.addInitScript((t) => window.localStorage.setItem("theme", t), theme);
    await ctx.addInitScript(() => {
      const hide = () => {
        if (document.getElementById("__hide-devtools")) return;
        const s = document.createElement("style");
        s.id = "__hide-devtools";
        s.textContent = "nextjs-portal{display:none!important}";
        document.documentElement.appendChild(s);
      };
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", hide);
      else hide();
    });
    return ctx;
  };

  for (const theme of ["dark", "light"]) {
    const ctx = await themedContext(theme);
    const page = await ctx.newPage();

    // 1. Blank roster — an empty team's Roster tab (full page, matches roster.png framing)
    await page.goto(`${BASE}/teams/${EMPTY_TEAM}`);
    await settle(page);
    await page.getByRole("tab", { name: "Roster" }).click();
    await settle(page, 600);
    await shoot(page, "roster-empty", theme);

    // 2. Team Parent View — Thunderhawks roster with the toggle on
    await page.goto(`${BASE}/teams/${IDS.hawks}`);
    await settle(page);
    await page.getByRole("tab", { name: "Roster" }).click();
    await settle(page, 600);
    await page.getByRole("button", { name: "Team Parent View" }).click();
    await settle(page, 500);
    await shoot(page, "roster-parent-view", theme);

    // 3. Danger Zone — a player's page (targeted card, it sits below the fold)
    await page.goto(`${BASE}/teams/${IDS.hawks}/roster/${PLAYER_RID}`);
    await settle(page);
    await shoot(page, "roster-danger", theme, 'div[data-slot="card"]:has(h2:has-text("Danger Zone"))');

    await ctx.close();
    console.log(`roster extras (${theme}) done`);
  }

  fs.unlinkSync(AUTH_TMP);
  await browser.close();
  console.log("roster extras capture complete");
})();
