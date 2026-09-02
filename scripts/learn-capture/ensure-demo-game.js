/* Preflight for capture-learn.js.

   seed-demo.js bails wholesale once the demo league exists, so it can't repair a
   demo world that has partly rotted — and when the demo game goes missing the
   capture fails 100 lines in with an opaque "tab not found" timeout. This
   re-derives the volatile ids in demo-ids.json from what's actually in the
   database and re-seeds the demo game's confirmations and batting order.

   Idempotent: safe to run before every capture.
   Usage: npm run learn:preflight */
const fs = require("fs");
const path = require("path");
const { chromium } = require("@playwright/test");

const BASE = "http://localhost:3000";
const IDS_PATH = path.join(__dirname, "demo-ids.json");
const IDS = JSON.parse(fs.readFileSync(IDS_PATH, "utf8"));

// Matches seed-demo.js's demo game: the Thunderhawks' upcoming home fixture.
const OPPONENT = "River Otters";

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', "admin@test.stackedbench.com");
  await page.fill('input[type="password"]', "TestAdmin123!");
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20000 });

  const api = async (method, url, body) => {
    const res = await page.evaluate(
      async ({ method, url, body }) => {
        const opts = { method, credentials: "include", headers: { "Content-Type": "application/json" } };
        if (body) opts.body = JSON.stringify(body);
        const r = await fetch(url, opts);
        const data = await r.json().catch(() => ({}));
        return { status: r.status, data };
      },
      { method, url, body }
    );
    return res;
  };

  const must = async (method, url, body) => {
    const r = await api(method, url, body);
    if (r.status >= 400) throw new Error(`${method} ${url} -> ${r.status}: ${JSON.stringify(r.data).slice(0, 300)}`);
    return r.data;
  };

  const hawks = IDS.hawks;
  const changed = [];

  /* ── Roster: re-derive jersey → roster_id from the live roster ── */
  const rosterRes = await must("GET", `/api/teams/${hawks}/roster`);
  const roster = Array.isArray(rosterRes) ? rosterRes : rosterRes.roster || rosterRes.rows || [];
  if (roster.length === 0) {
    throw new Error(`Thunderhawks (team ${hawks}) has no roster — re-seed the demo world from scratch.`);
  }
  const rosterIds = {};
  for (const p of roster) if (p.jersey_number != null) rosterIds[p.jersey_number] = p.id;
  if (JSON.stringify(rosterIds) !== JSON.stringify(IDS.rosterIds)) {
    IDS.rosterIds = rosterIds;
    changed.push("rosterIds");
  }
  console.log(`roster ok — ${roster.length} players`);

  /* ── Demo game: keep it if it still exists, otherwise adopt or create ── */
  const probe = await api("GET", `/api/games/season/${IDS.demoGameId}`);
  if (probe.status === 200) {
    console.log(`demo game ${IDS.demoGameId} ok`);
  } else {
    console.log(`demo game ${IDS.demoGameId} is gone (HTTP ${probe.status}) — repairing`);
    const { games } = await must("GET", `/api/seasons/${IDS.seasonId}/games`);
    const candidate = games.find(
      (g) => g.home === hawks && g.away_team === OPPONENT && !/final/i.test(g.gamestatus_label || "")
    );

    if (candidate) {
      IDS.demoGameId = candidate.id;
      console.log(`adopted existing game ${candidate.id} (${candidate.home_team} vs ${candidate.away_team})`);
    } else {
      const statuses = await must("GET", "/api/gamestatuses");
      const scheduled = (statuses.statuses ?? []).find((s) => /sched|upcoming/i.test(s.name))?.id;
      const otters = Object.entries(IDS.teamIds).find(([n]) => n === OPPONENT)?.[1];
      const created = await must("POST", `/api/seasons/${IDS.seasonId}/games`, {
        home: hawks,
        away: otters,
        gamedate: "2026-05-16",
        gametime: "10:30",
        gamestatusid: scheduled,
        field: "Field 2",
      });
      IDS.demoGameId = created.id ?? created.game?.id ?? created.row?.id;
      console.log(`created game ${IDS.demoGameId}`);
    }
    changed.push("demoGameId");
  }

  /* ── Confirmations + batting order (capture's lineup tabs need them) ── */
  const ids = Object.values(IDS.rosterIds);
  await must("PUT", `/api/games/season/${IDS.demoGameId}/confirmations`, {
    team_id: hawks,
    confirmations: ids.map((roster_id) => ({ roster_id, status: "confirmed" })),
  });
  // Jersey order, matching seed-demo.js.
  const byJersey = Object.keys(IDS.rosterIds)
    .map(Number)
    .sort((a, b) => a - b);
  await must("PUT", `/api/games/season/${IDS.demoGameId}/batting-order`, {
    team_id: hawks,
    order: byJersey.map((j, i) => ({ roster_id: IDS.rosterIds[j], bat_order: i + 1 })),
  });
  console.log("confirmations + batting order seeded");

  /* Reset the defense to empty. capture-learn.js pass 1 shoots the empty grid
     and the picker *before* seeding a lineup mid-run for the warnings shots —
     so without this, a second capture would find last run's lineup still in
     place and "defense-grid" would come out populated and already warning. */
  await must("PUT", `/api/games/season/${IDS.demoGameId}/defensive-lineup`, {
    team_id: hawks,
    lineup: [],
  });
  await must("PUT", `/api/games/season/${IDS.demoGameId}/lineup-rules`, {
    team_id: hawks,
    rules: { fair_sit: false, fair_outfield: false },
  });
  console.log("defense reset to empty");

  if (changed.length) {
    fs.writeFileSync(IDS_PATH, JSON.stringify(IDS, null, 2) + "\n");
    console.log(`demo-ids.json updated (${changed.join(", ")})`);
  }

  console.log(`preflight ok — demo game /games/season/${IDS.demoGameId}?team=${hawks}`);
  await browser.close();
})();
