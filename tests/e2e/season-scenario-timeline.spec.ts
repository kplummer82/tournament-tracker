import { test, expect, type APIRequestContext } from "@playwright/test";
import { gotoSeasonTab } from "./helpers/navigate";
import { apiLogin } from "./helpers/auth";

// The seeded Mustang fixture season — a completed regular season with ~27
// distinct played dates, which is what makes a timeline interesting.
const SEASON_ID = 1;

async function pollUntil<T>(
  fn: () => Promise<T>,
  done: (v: T) => boolean,
  { timeout = 240_000, interval = 2000 } = {}
): Promise<T> {
  const deadline = Date.now() + timeout;
  let last = await fn();
  while (!done(last)) {
    if (Date.now() > deadline) throw new Error(`Timed out: ${JSON.stringify(last)}`);
    await new Promise((r) => setTimeout(r, interval));
    last = await fn();
  }
  return last;
}

async function deleteScenario(api: APIRequestContext, id: number) {
  await api.delete(`/api/seasons/${SEASON_ID}/scenarios/${id}`).catch(() => {});
}

test.describe("Season scenario timelines", () => {
  // A timeline replays the question at up to 12 as-of dates, each a full
  // (reduced-budget) analysis, so give it room.
  test.setTimeout(420_000);

  test("plots a scenario across played dates and renders the chart", async ({ page }) => {
    // Establishes the session for page.request as well as proving the tab loads.
    await gotoSeasonTab(page, "Scenarios");
    const api = page.request;

    const teamsRes = await api.get(`/api/seasons/${SEASON_ID}/teams`);
    expect(teamsRes.ok()).toBeTruthy();
    const { teams } = await teamsRes.json();
    expect(teams.length).toBeGreaterThan(1);
    const team = teams.find((t: { name: string }) => /Cubs/i.test(t.name)) ?? teams[0];

    const createRes = await api.post(`/api/seasons/${SEASON_ID}/scenarios`, {
      data: { questionType: "seed_achievable", teamId: team.id, targetSeed: 4, seedMode: "or_better" },
    });
    expect(createRes.status()).toBe(201);
    const scenarioId: number = (await createRes.json()).scenario.id;

    try {
      const runRes = await api.post(`/api/seasons/${SEASON_ID}/scenarios/${scenarioId}/run`, {});
      expect(runRes.status()).toBe(202);

      const scenario = await pollUntil(
        async () =>
          (await (await api.get(`/api/seasons/${SEASON_ID}/scenarios/${scenarioId}`)).json()).scenario,
        (s) => s.status === "completed" || s.status === "error"
      );
      expect(scenario.status).toBe("completed");

      // No timeline exists until one is asked for.
      const before = await (
        await api.get(`/api/seasons/${SEASON_ID}/scenarios/${scenarioId}/timeline`)
      ).json();
      expect(before.timeline).toBeNull();
      expect(before.points).toEqual([]);

      const startRes = await api.post(`/api/seasons/${SEASON_ID}/scenarios/${scenarioId}/timeline`, {});
      expect(startRes.status()).toBe(202);
      const started = (await startRes.json()).timeline;
      expect(started.status).toBe("running");
      expect(started.points_total).toBeGreaterThan(1);

      const final = await pollUntil(
        async () =>
          await (await api.get(`/api/seasons/${SEASON_ID}/scenarios/${scenarioId}/timeline`)).json(),
        (d) => d.timeline?.status === "completed" || d.timeline?.status === "error"
      );
      expect(final.timeline.status).toBe("completed");
      expect(final.points.length).toBe(final.timeline.points_total);
      expect(final.points.length).toBeGreaterThan(1);

      // Points are ordered, dated, distinct, and carry a real answer.
      const dates = final.points.map((p: { as_of_date: string }) => p.as_of_date);
      expect([...dates].sort()).toEqual(dates);
      expect(new Set(dates).size).toBe(dates.length);
      for (const p of final.points) {
        expect(p.error_message).toBeNull();
        // Either a probability, or a definitive "impossible" verdict.
        expect(p.probability !== null || p.is_possible === false).toBeTruthy();
      }

      // The chart renders in the card once the timeline panel is opened.
      await page.reload();
      await expect(page.getByRole("heading", { name: "Scenarios", exact: true })).toBeVisible({
        timeout: 20000,
      });
      await page.getByTitle("Plot this scenario over time").first().click();
      await expect(page.getByText("Over Time", { exact: true })).toBeVisible({ timeout: 15000 });

      const chart = page.locator("svg polyline").first();
      await expect(chart).toBeVisible({ timeout: 20000 });
    } finally {
      await deleteScenario(api, scenarioId);
    }
  });

  // A scenario pinned to an as-of date used to truncate its own timeline there,
  // which hid most of the season. The chart always spans the full regular season.
  test("an as-of scenario still plots the whole regular season", async ({ page }) => {
    test.setTimeout(300_000);
    await gotoSeasonTab(page, "Scenarios");
    const api = page.request;

    // Derive the expected span the same way the server does: distinct dates of
    // settled (4 Final / 6-7 forfeit) regular-season games.
    const { games } = await (await api.get(`/api/seasons/${SEASON_ID}/games`)).json();
    const played = [
      ...new Set(
        games
          .filter((g: { gamestatusid: number | null; gamedate: string | null }) =>
            [4, 6, 7].includes(g.gamestatusid ?? 0) && g.gamedate
          )
          .map((g: { gamedate: string }) => g.gamedate.slice(0, 10))
      ),
    ].sort() as string[];
    expect(played.length).toBeGreaterThan(2);

    const { teams } = await (await api.get(`/api/seasons/${SEASON_ID}/teams`)).json();
    // Pin the scenario well before the end of the season.
    const asOfDate = played[Math.floor(played.length / 3)];
    const createRes = await api.post(`/api/seasons/${SEASON_ID}/scenarios`, {
      data: {
        questionType: "seed_achievable",
        teamId: teams[0].id,
        targetSeed: 1,
        seedMode: "or_better",
        asOfDate,
      },
    });
    expect(createRes.status()).toBe(201);
    const scenarioId: number = (await createRes.json()).scenario.id;

    try {
      expect((await api.post(`/api/seasons/${SEASON_ID}/scenarios/${scenarioId}/timeline`, {})).status()).toBe(202);
      const final = await pollUntil(
        async () =>
          await (await api.get(`/api/seasons/${SEASON_ID}/scenarios/${scenarioId}/timeline`)).json(),
        (d) => d.timeline?.status === "completed" || d.timeline?.status === "error"
      );
      expect(final.timeline.status).toBe("completed");

      const plotted = final.points.map((p: { as_of_date: string }) => p.as_of_date);
      expect(plotted[0]).toBe(played[0]);
      expect(plotted[plotted.length - 1]).toBe(played[played.length - 1]);
      // The pin is well before the end, so the plot must run past it.
      expect(plotted[plotted.length - 1] > asOfDate).toBeTruthy();
    } finally {
      await deleteScenario(api, scenarioId);
    }
  });

  // Admins bypass the reservation entirely, so the throttle only gets exercised
  // by a non-admin. Timelines and scenarios draw on separate daily budgets.
  test("timeline and scenario run budgets are throttled independently", async ({ page, browser }) => {
    test.setTimeout(180_000);

    // Set up the scenario as admin, then hand off to a regular user in a
    // separate context so the admin session survives for the cleanup.
    await gotoSeasonTab(page, "Scenarios");
    const adminApi = page.request;

    const settingsBefore = (await (await adminApi.get("/api/admin/settings")).json()).settings;
    const { teams } = await (await adminApi.get(`/api/seasons/${SEASON_ID}/teams`)).json();
    const createRes = await adminApi.post(`/api/seasons/${SEASON_ID}/scenarios`, {
      data: { questionType: "seed_achievable", teamId: teams[0].id, targetSeed: 4, seedMode: "or_better" },
    });
    expect(createRes.status()).toBe(201);
    const scenarioId: number = (await createRes.json()).scenario.id;

    // Both budgets count a rolling 24h window, so the user may already have runs
    // from an earlier execution. Start generous, spend one, then squeeze the
    // timeline limit to 1 — that lands the user over it whatever the history.
    const setLimits = (timeline: number, scenario: number) =>
      adminApi.put("/api/admin/settings", {
        data: { timeline_daily_run_limit: timeline, scenario_daily_run_limit: scenario },
      });
    expect((await setLimits(1000, 1000)).ok()).toBeTruthy();

    const userContext = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const userPage = await userContext.newPage();
    try {
      await apiLogin(userPage, "regularUser");
      const api = userPage.request;

      const first = await api.post(`/api/seasons/${SEASON_ID}/scenarios/${scenarioId}/timeline`, {});
      expect(first.status()).toBe(202);

      expect((await setLimits(1, 1000)).ok()).toBeTruthy();

      const second = await api.post(`/api/seasons/${SEASON_ID}/scenarios/${scenarioId}/timeline`, {});
      expect(second.status()).toBe(429);
      expect((await second.json()).code).toBe("rate_limited");

      // Timeline budget exhausted, scenario budget unaffected — they are separate.
      const run = await api.post(`/api/seasons/${SEASON_ID}/scenarios/${scenarioId}/run`, {});
      expect(run.status()).toBe(202);
    } finally {
      await userContext.close();
      await adminApi
        .put("/api/admin/settings", {
          data: {
            timeline_daily_run_limit: settingsBefore.timeline_daily_run_limit,
            scenario_daily_run_limit: settingsBefore.scenario_daily_run_limit,
          },
        })
        .catch(() => {});
      await deleteScenario(adminApi, scenarioId);
    }
  });

  test("timeline reads are safe on a scenario that has never been plotted", async ({ page }) => {
    await gotoSeasonTab(page, "Scenarios");
    const api = page.request;

    const res = await api.get(`/api/seasons/${SEASON_ID}/scenarios/999999999/timeline`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.timeline).toBeNull();
    expect(data.points).toEqual([]);
  });
});
