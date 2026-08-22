import { test, expect, type APIResponse } from "@playwright/test";
import { gotoSeasonTab } from "./helpers/navigate";

/**
 * A coin toss only decides anything once every regular-season game is settled.
 *
 * The bug these guard against: with no games played, every team sits at 0-0-0,
 * ties after every tiebreaker, and the standings page offered "1 tie needs a
 * coin toss to set final seeds" with a Resolve button — on day one.
 *
 * These assert the phase contract rather than a specific fixture's records, so
 * they survive reseeding.
 */

const PHASES = ["none", "provisional", "final"];

type CoinToss = {
  phase: string;
  remainingGames: number;
  groups: { groupSig: string; resolved: boolean; teams: { teamid: number }[] }[];
};

async function coinTossOf(res: APIResponse): Promise<CoinToss> {
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  return body.coinToss as CoinToss;
}

test.describe("Coin-toss phase gating", () => {
  test("standings expose a valid phase and remaining-game count", async ({ page }) => {
    const ct = await coinTossOf(await page.request.get("/api/seasons/1/standings"));
    expect(PHASES).toContain(ct.phase);
    expect(typeof ct.remainingGames).toBe("number");
    expect(ct.remainingGames).toBeGreaterThanOrEqual(0);
  });

  test("no settled games means nothing to resolve", async ({ page }) => {
    // An as-of date before any season started yields an empty game set, which is
    // the same state a season sits in on day one.
    const ct = await coinTossOf(
      await page.request.get("/api/seasons/1/standings?asOfDate=2000-01-01")
    );
    expect(ct.phase).toBe("none");
    expect(ct.groups).toHaveLength(0);
  });

  test("every season reports a coherent phase", async ({ page }) => {
    const listRes = await page.request.get("/api/seasons");
    expect(listRes.ok()).toBeTruthy();
    const seasons = (await listRes.json()).rows as { id: number }[];
    expect(seasons.length).toBeGreaterThan(0);

    for (const s of seasons) {
      const ct = await coinTossOf(await page.request.get(`/api/seasons/${s.id}/standings`));
      expect(PHASES, `season ${s.id}`).toContain(ct.phase);
      // Games still to play means a coin toss can't be final yet.
      if (ct.remainingGames > 0) {
        expect(ct.phase, `season ${s.id} has ${ct.remainingGames} games left`).not.toBe("final");
      }
      // "none" must carry no groups — an empty list is what hides the banner.
      if (ct.phase === "none") {
        expect(ct.groups, `season ${s.id}`).toHaveLength(0);
      }
    }
  });

  test("a coin toss cannot be saved before the season is complete", async ({ page }) => {
    const listRes = await page.request.get("/api/seasons");
    const seasons = (await listRes.json()).rows as { id: number }[];

    let target: { id: number; sig: string } | null = null;
    for (const s of seasons) {
      const ct = await coinTossOf(await page.request.get(`/api/seasons/${s.id}/standings`));
      if (ct.phase === "final") continue;
      // Any signature works: the phase guard runs before group validation, so an
      // incomplete season must be refused whether or not the group exists.
      target = { id: s.id, sig: ct.groups[0]?.groupSig ?? "1-2" };
      break;
    }
    test.skip(target === null, "every seeded season is already complete");

    const res = await page.request.put(`/api/seasons/${target!.id}/coin-toss`, {
      data: { groupSig: target!.sig, order: target!.sig.split("-").map(Number) },
    });
    expect(res.status()).toBe(409);
    expect((await res.json()).error).toMatch(/isn't complete/i);
  });

  test("the standings tab offers no Resolve button before the season is complete", async ({
    page,
  }) => {
    const ct = await coinTossOf(await page.request.get("/api/seasons/1/standings"));
    test.skip(ct.phase === "final", "fixture season is complete; Resolve is expected");

    await gotoSeasonTab(page, "Standings");
    await expect(page.getByRole("heading", { name: /Standings/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: "Resolve", exact: true })).toHaveCount(0);
    await expect(page.getByText(/needs a coin toss to set final seeds/i)).toHaveCount(0);
  });
});
