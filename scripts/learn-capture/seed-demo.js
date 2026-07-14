/* Seeds a fully fictional demo world for marketing/guide screenshots:
   Maple Valley Youth Baseball → Grizzly division → Spring 2026 season,
   6 invented teams, full fictional Thunderhawks roster, played + upcoming
   games, and one demo game with confirmations/batting/defense + fairness
   rules in the violating state. Idempotence: bails if the league exists. */
const fs = require("fs");
const path = require("path");
const { chromium } = require("@playwright/test");

const BASE = "http://localhost:3000";

const TEAMS = ["Thunderhawks", "River Otters", "Mudcats", "Night Owls", "Sandsharks", "Yetis"];

// Entirely invented players: first name + single-letter last name (matches app convention)
const ROSTER = [
  { jersey: 2,  first: "Boone",  last: "K", song: "Thunderstruck — AC/DC",              pos: [["P","primary"],["SS","primary"],["2B","secondary"]] },
  { jersey: 4,  first: "Cash",   last: "M", song: "We Will Rock You — Queen",           pos: [["C","primary"],["1B","primary"],["3B","secondary"]] },
  { jersey: 5,  first: "Ziggy",  last: "R", song: "Centerfield — John Fogerty",         pos: [["P","primary"],["CF","primary"],["RF","primary"],["LF","secondary"],["2B","secondary"]] },
  { jersey: 7,  first: "Rome",   last: "T", song: "Eye of the Tiger — Survivor",        pos: [["SS","primary"],["2B","primary"],["P","secondary"]] },
  { jersey: 9,  first: "Ledger", last: "P", song: null,                                  pos: [["1B","primary"],["LF","primary"],["C","secondary"]] },
  { jersey: 11, first: "Wilder", last: "S", song: "Back in Black — AC/DC",              pos: [["CF","primary"],["RF","primary"],["2B","secondary"]] },
  { jersey: 13, first: "Arlo",   last: "F", song: "The Boys Are Back in Town — Thin Lizzy", pos: [["3B","primary"],["P","secondary"],["C","secondary"]] },
  { jersey: 21, first: "Duke",   last: "W", song: null,                                  pos: [["LF","primary"],["RF","primary"],["3B","secondary"]] },
  { jersey: 23, first: "Nova",   last: "C", song: "Song 2 — Blur",                       pos: [["2B","primary"],["SS","secondary"],["CF","secondary"]] },
  { jersey: 27, first: "Ryder",  last: "G", song: "Seven Nation Army — The White Stripes", pos: [["RF","primary"],["LF","primary"],["1B","secondary"]] },
  { jersey: 42, first: "Bear",   last: "J", song: "Bear Necessities — Disney",           pos: [["C","primary"],["3B","primary"],["P","secondary"]] },
  { jersey: 44, first: "Moss",   last: "L", song: null,                                  pos: [["RF","primary"],["1B","secondary"],["LF","secondary"]] },
];

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', "admin@test.stackedbench.com");
  await page.fill('input[type="password"]', "TestAdmin123!");
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 20000 });

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
    if (res.status >= 400) throw new Error(`${method} ${url} -> ${res.status}: ${JSON.stringify(res.data).slice(0, 300)}`);
    return res.data;
  };

  // Bail if already seeded
  const existing = await api("GET", "/api/leagues");
  const found = (existing.rows ?? []).find((l) => l.name === "Maple Valley Youth Baseball");
  if (found) {
    console.log(`League already exists (id ${found.id}) — aborting to avoid duplicates.`);
    await browser.close();
    process.exit(1);
  }

  // 1. League → division → season
  const league = await api("POST", "/api/leagues", {
    name: "Maple Valley Youth Baseball",
    abbreviation: "MVYB",
    city: "Maple Valley",
    state: "CA",
  });
  const leagueId = league.id ?? league.league?.id ?? league.row?.id;
  console.log("league", leagueId);

  const division = await api("POST", `/api/leagues/${leagueId}/divisions`, {
    name: "Grizzly",
    age_range: "9-10",
    sort_order: 1,
  });
  const divisionId = division.id ?? division.division?.id ?? division.row?.id;
  console.log("division", divisionId);

  const season = await api("POST", "/api/seasons", {
    league_division_id: divisionId,
    name: "Spring 2026",
    year: 2026,
    season_type: "spring",
  });
  const seasonId = season.id ?? season.season?.id ?? season.row?.id;
  console.log("season", seasonId);

  // 2. Teams
  const teamIds = {};
  for (const name of TEAMS) {
    const t = await api("POST", "/api/teams", {
      name,
      season: "Spring",
      year: 2026,
      leagueId,
      leagueDivisionId: divisionId,
    });
    teamIds[name] = t.teamid ?? t.id ?? t.team?.teamid ?? t.team?.id;
    console.log("team", name, teamIds[name]);
  }
  await api("POST", `/api/seasons/${seasonId}/teams`, { teamIds: Object.values(teamIds) });

  // 3. Thunderhawks roster + positions
  const hawks = teamIds["Thunderhawks"];
  const rosterIds = {};
  for (const p of ROSTER) {
    const r = await api("POST", `/api/teams/${hawks}/roster`, {
      first_name: p.first,
      last_name: p.last,
      role: "player",
      jersey_number: p.jersey,
      walkup_song: p.song ?? undefined,
    });
    const rid = r.id ?? r.roster?.id ?? r.row?.id;
    rosterIds[p.jersey] = rid;
    await api("PUT", `/api/teams/${hawks}/roster/${rid}/positions`, {
      positions: p.pos.map(([position, priority]) => ({ position, priority })),
    });
  }
  console.log("roster", rosterIds);

  // 4. Game statuses
  const statuses = await api("GET", "/api/gamestatuses");
  const statusId = (name) =>
    (statuses.statuses ?? []).find((s) => s.name.toLowerCase().includes(name))?.id;
  const FINAL = statusId("final");
  const SCHEDULED = statusId("sched") ?? statusId("upcoming");
  console.log("statuses final/scheduled", FINAL, SCHEDULED);

  // 5. Played games (Saturdays Mar 28 – May 9) + upcoming
  const names = Object.keys(teamIds);
  const score = () => Math.floor(Math.random() * 11);
  const playedDates = ["2026-03-28", "2026-04-04", "2026-04-11", "2026-04-18", "2026-04-25", "2026-05-02", "2026-05-09"];
  let g = 0;
  for (const date of playedDates) {
    // three games per Saturday, rotating pairings
    for (let i = 0; i < 3; i++) {
      const home = names[(g + i) % 6];
      const away = names[(g + i + 3) % 6];
      let hs = score(), as_ = score();
      if (hs === as_) hs += 1;
      await api("POST", `/api/seasons/${seasonId}/games`, {
        home: teamIds[home], away: teamIds[away],
        gamedate: date, gametime: ["09:00", "11:00", "13:00"][i],
        homescore: hs, awayscore: as_,
        gamestatusid: FINAL,
        field: `Field ${i + 1}`,
      });
    }
    g++;
  }
  // Upcoming, incl. the demo lineup game
  const demoGame = await api("POST", `/api/seasons/${seasonId}/games`, {
    home: teamIds["Thunderhawks"], away: teamIds["River Otters"],
    gamedate: "2026-05-16", gametime: "10:30",
    gamestatusid: SCHEDULED,
    field: "Field 2",
  });
  const demoGameId = demoGame.id ?? demoGame.game?.id ?? demoGame.row?.id;
  await api("POST", `/api/seasons/${seasonId}/games`, {
    home: teamIds["Mudcats"], away: teamIds["Yetis"],
    gamedate: "2026-05-16", gametime: "12:30",
    gamestatusid: SCHEDULED,
    field: "Field 1",
  });
  console.log("demo game", demoGameId);

  // 6. Demo game: confirmations + batting order (defense lineup is seeded later,
  //    mid-capture, so the empty-grid and picker shots can be taken first)
  await api("PUT", `/api/games/season/${demoGameId}/confirmations`, {
    team_id: hawks,
    confirmations: Object.values(rosterIds).map((roster_id) => ({ roster_id, status: "confirmed" })),
  });
  await api("PUT", `/api/games/season/${demoGameId}/batting-order`, {
    team_id: hawks,
    order: ROSTER.map((p, i) => ({ roster_id: rosterIds[p.jersey], bat_order: i + 1 })),
  });

  const out = { leagueId, divisionId, seasonId, teamIds, rosterIds, demoGameId, hawks };
  fs.writeFileSync(path.join(__dirname, "demo-ids.json"), JSON.stringify(out, null, 2));
  console.log("seed complete", JSON.stringify(out));
  await browser.close();
})();
