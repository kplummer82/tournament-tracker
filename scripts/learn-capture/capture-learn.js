/* Re-captures every Learn screenshot from the fictional demo world, in both
   themes (dark = base name, light = -light suffix), with the Next.js dev
   badge removed. Also captures the deck-only extras and the lineup-card PDF. */
const fs = require("fs");
const path = require("path");
const { chromium } = require("@playwright/test");

const BASE = "http://localhost:3000";
const OUT = path.resolve(__dirname, "../../public/learn");
const IDS = JSON.parse(fs.readFileSync(path.join(__dirname, "demo-ids.json"), "utf8"));
const GAME = `/games/season/${IDS.demoGameId}?team=${IDS.hawks}`;
const AUTH_TMP = path.join(__dirname, "capture-auth.json");

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
    await ctx.storageState({ path: AUTH_TMP });
    await ctx.close();
  }

  const themedContext = async (theme, authed) => {
    const ctx = await browser.newContext({
      viewport: { width: 1600, height: 900 },
      deviceScaleFactor: 1.5,
      ...(authed ? { storageState: AUTH_TMP } : {}),
    });
    await ctx.addInitScript((t) => window.localStorage.setItem("theme", t), theme);
    // The dev-tools badge re-mounts if removed; hide its portal host with CSS instead.
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

  /* ── Pass 1 (per theme): everything before the defense lineup exists ── */
  for (const theme of ["dark", "light"]) {
    const ctx = await themedContext(theme, true);
    const page = await ctx.newPage();

    // Team page (Follow button) → Roster tab → player positions page
    await page.goto(`${BASE}/teams/${IDS.hawks}`);
    await settle(page);
    await shoot(page, "follow-team", theme);
    await page.getByRole("tab", { name: "Roster" }).click();
    await settle(page, 600);
    await shoot(page, "roster", theme);
    await page.goto(`${BASE}/teams/${IDS.hawks}/roster/${IDS.rosterIds["5"]}`);
    await settle(page);
    await shoot(page, "positions", theme);

    // Home, leagues, season pages
    await page.goto(`${BASE}/`);
    await settle(page);
    await shoot(page, "home-follows", theme);
    await page.goto(`${BASE}/leagues`);
    await settle(page);
    await shoot(page, "leagues", theme);
    for (const tab of ["overview", "teams", "schedule", "standings"]) {
      await page.goto(`${BASE}/seasons/${IDS.seasonId}/${tab}`);
      await settle(page);
      await shoot(page, `season-${tab}`, theme);
    }

    // Game page: overview (deck), confirmations, batting order
    await page.goto(`${BASE}${GAME}`);
    await settle(page);
    if (theme === "dark") await shoot(page, "game-overview", theme);
    await page.getByRole("tab", { name: "Confirmations" }).click();
    await settle(page, 600);
    await shoot(page, "confirmations", theme);
    await page.getByRole("tab", { name: "Batting Order" }).click();
    await settle(page, 600);
    await shoot(page, "batting-order", theme);

    // Defense: empty grid → picker open → duplicate (unsaved, discarded)
    await page.getByRole("tab", { name: "Defense" }).click();
    await settle(page, 600);
    await shoot(page, "defense-grid", theme);
    await page.locator('[data-cell="1-P"] input').click();
    await page.waitForTimeout(400);
    await page.evaluate(() => document.querySelectorAll("nextjs-portal").forEach((e) => e.remove()));
    await shoot(page, "defense-picker", theme);
    await page.locator('[data-cell="1-P"] button', { hasText: "#5 Ziggy R" }).click();
    await page.locator('[data-cell="1-C"] input').click();
    await page.locator('[data-cell="1-C"] button', { hasText: "#5 Ziggy R" }).click();
    await page.waitForTimeout(400);
    await page.evaluate(() => document.querySelectorAll("nextjs-portal").forEach((e) => e.remove()));
    await shoot(page, "defense-duplicate", theme);

    await ctx.close();
    console.log(`pass 1 (${theme}) done`);
  }

  /* ── Seed the violating defense lineup + rules ON (once) ── */
  {
    const ctx = await themedContext("dark", true);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`);
    const r = IDS.rosterIds;
    const inning = { P: r["2"], C: r["4"], "1B": r["9"], "2B": r["23"], "3B": r["13"], SS: r["7"], LF: r["21"], CF: r["11"], RF: r["5"] };
    const lineup = [];
    for (const inn of [1, 2]) for (const [position, roster_id] of Object.entries(inning)) lineup.push({ inning: inn, position, roster_id });
    const status = await page.evaluate(
      async ({ gameId, teamId, lineup }) => {
        const opts = (body) => ({ method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const a = await fetch(`/api/games/season/${gameId}/defensive-lineup`, opts({ team_id: teamId, lineup }));
        const b = await fetch(`/api/games/season/${gameId}/lineup-rules`, opts({ team_id: teamId, rules: { fair_sit: true, fair_outfield: true } }));
        return [a.status, b.status];
      },
      { gameId: IDS.demoGameId, teamId: IDS.hawks, lineup }
    );
    console.log("lineup+rules seeded", status);
    await ctx.close();
  }

  /* ── Pass 2 (per theme): warnings state + deck extras ── */
  for (const theme of ["dark", "light"]) {
    const ctx = await themedContext(theme, true);
    const page = await ctx.newPage();
    await page.goto(`${BASE}${GAME}`);
    await settle(page);
    await page.getByRole("tab", { name: "Defense" }).click();
    await settle(page, 600);
    await shoot(page, "defense-warnings", theme);
    if (theme === "dark") {
      await shoot(page, "deck-bench", theme, 'div[data-slot="card"]:has-text("Bench / Unassigned")');
      await shoot(page, "deck-banner", theme, "css=.border-warning\\/40");
    }
    await ctx.close();
    console.log(`pass 2 (${theme}) done`);
  }

  /* ── Lineup-card PDF: download once, render page 1 (theme-neutral) ── */
  {
    const ctx = await themedContext("dark", true);
    const page = await ctx.newPage();
    await page.goto(`${BASE}${GAME}`);
    await settle(page);
    await page.getByRole("tab", { name: "Reports" }).click();
    await settle(page, 600);
    const dl = page.waitForEvent("download", { timeout: 30000 });
    await page.getByRole("button", { name: /Lineup Card|Download|Generate/i }).first().click();
    const download = await dl;
    const pdfPath = path.join(__dirname, "demo-lineup-card.pdf");
    await download.saveAs(pdfPath);
    await ctx.close();
    console.log("pdf downloaded", download.suggestedFilename());

    const headed = await chromium.launch({ headless: false });
    const view = await headed.newPage({ viewport: { width: 1050, height: 1359 }, deviceScaleFactor: 1.5 });
    await view.goto("file:///" + pdfPath.replace(/\\/g, "/") + "#toolbar=0&view=FitH");
    await view.waitForTimeout(2500);
    await view.screenshot({ path: `${OUT}/lineup-card.png` });
    await headed.close();
  }

  /* ── Signed-out shots (both themes): landing + signup ── */
  for (const theme of ["dark", "light"]) {
    const ctx = await themedContext(theme, false);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`);
    await settle(page);
    await shoot(page, "landing", theme);
    await page.goto(`${BASE}/sign-up`);
    await settle(page);
    await shoot(page, "signup", theme);
    await ctx.close();
    console.log(`signed-out (${theme}) done`);
  }

  fs.unlinkSync(AUTH_TMP);
  await browser.close();
  console.log("capture complete");
})();
