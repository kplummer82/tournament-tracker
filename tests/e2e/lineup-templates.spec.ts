import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { apiLogin, authedFetch } from "./helpers/auth";
import {
  assignRoleViaApi,
  createTeamViaApi,
  deleteTeamViaApi,
  revokeRoleViaApi,
} from "./helpers/seed";

/**
 * Reusable team-scoped defensive lineups.
 *
 * Four things are locked in here:
 *
 * 1. Access. Saved lineups are coaching data — staff only, on read as well as
 *    write. A user with no role on the team must 403 on every method of every
 *    route, including the duplicate action.
 * 2. Shared by the team. Unlike per-coach position ratings, a lineup belongs to
 *    the whole team: granting `team_manager` opens up read AND write, and the
 *    grantee can edit and delete a lineup someone else created.
 * 3. Cross-team ids never resolve. A payload carrying another team's roster_id
 *    is accepted but stripped to null, so a crafted request can't read back a
 *    foreign team's player names through a lineup.
 * 4. The position vocabulary is the nine fielding positions from
 *    lib/positions.ts — NOT the wider DH/BN set the game's defensive-lineup
 *    route happens to accept. A lineup also can't put one player at two spots,
 *    which is what makes an import structurally unable to create a duplicate.
 *
 * A non-admin (regularUser) is required for the non-staff cases — system admins
 * bypass the scoped read guard, so an admin session proves nothing there.
 */

const unique = Date.now();

const data: {
  teamId: number | null;
  otherTeamId: number | null;
  otherTemplateId: number | null;
  rosterIds: number[];
  foreignRosterId: number | null;
  throwawayRosterId: number | null;
  userId: string | null;
  grantedRoleId: number | null;
} = {
  teamId: null,
  otherTeamId: null,
  otherTemplateId: null,
  rosterIds: [],
  foreignRosterId: null,
  throwawayRosterId: null,
  userId: null,
  grantedRoleId: null,
};

// Don't load the saved storageState (tests/auth-state.json) — this spec signs in
// fresh via apiLogin in its own contexts, and the file isn't present in CI.
test.use({ storageState: { cookies: [], origins: [] } });

// Serial: the suite shares fixtures created once in beforeAll, later tests build
// on earlier writes, and concurrent sign-ins trip Better Auth's per-IP rate limit.
test.describe.configure({ mode: "serial" });

async function currentUserId(page: Page): Promise<string> {
  const { data: session } = await authedFetch(page, "GET", "/api/auth/get-session");
  const id = session?.user?.id;
  if (!id) throw new Error("Could not read the signed-in user id");
  return String(id);
}

async function addPlayer(page: Page, teamId: number, first: string): Promise<number> {
  const { status, data: player } = await authedFetch(page, "POST", `/api/teams/${teamId}/roster`, {
    first_name: first,
    last_name: `Probe ${unique}`,
    role: "player",
  });
  expect(status).toBe(201);
  return player.id;
}

function listUrl(teamId: number | null) {
  return `/api/teams/${teamId}/lineup-templates`;
}

test.describe("Lineup templates: access, validation, and roster churn", () => {
  let adminPage: Page;
  let userPage: Page;
  let adminContext: BrowserContext;
  let userContext: BrowserContext;

  test.beforeAll(async ({ browser }) => {
    adminContext = await browser.newContext();
    userContext = await browser.newContext();
    adminPage = await adminContext.newPage();
    userPage = await userContext.newPage();
    await apiLogin(adminPage, "admin");
    await apiLogin(userPage, "regularUser");

    data.userId = await currentUserId(userPage);

    // Admin owns both teams; regularUser has no role on either (yet).
    data.teamId = await createTeamViaApi(adminPage, `Lineups Team ${unique}`);
    data.otherTeamId = await createTeamViaApi(adminPage, `Lineups Other ${unique}`);

    for (const name of ["Ava", "Ben", "Cole"]) {
      data.rosterIds.push(await addPlayer(adminPage, data.teamId, name));
    }
    // Deleted mid-suite to prove the stale-id contract.
    data.throwawayRosterId = await addPlayer(adminPage, data.teamId, "Dana");
    // Belongs to the OTHER team — must never resolve through this team's routes.
    // Distinctive first name so a leak is detectable by substring search.
    data.foreignRosterId = await addPlayer(adminPage, data.otherTeamId, "Zephyrus");

    const { status, data: other } = await authedFetch(adminPage, "POST", listUrl(data.otherTeamId), {
      name: `Other team lineup ${unique}`,
      defense: { P: data.foreignRosterId },
    });
    expect(status).toBe(201);
    data.otherTemplateId = other.template.id;
  });

  test.afterAll(async () => {
    if (data.grantedRoleId) await revokeRoleViaApi(adminPage, data.grantedRoleId).catch(() => {});
    if (data.teamId) await deleteTeamViaApi(adminPage, data.teamId);
    if (data.otherTeamId) await deleteTeamViaApi(adminPage, data.otherTeamId);
    await adminPage.close();
    await userPage.close();
    await adminContext.close();
    await userContext.close();
  });

  /* ── Non-staff is blocked ──────────────────────────────────────────────── */

  test("non-staff gets 403 listing a team's saved lineups", async () => {
    const { status } = await authedFetch(userPage, "GET", listUrl(data.teamId));
    expect(status).toBe(403);
  });

  test("non-staff gets 403 creating a saved lineup", async () => {
    const { status } = await authedFetch(userPage, "POST", listUrl(data.teamId), {
      name: `Sneaky ${unique}`,
      defense: { P: data.rosterIds[0] },
    });
    expect(status).toBe(403);
  });

  test("non-staff gets 403 on read, update, delete and duplicate of one lineup", async () => {
    // Created by the admin so there is a real id to probe.
    const { status: created, data: made } = await authedFetch(adminPage, "POST", listUrl(data.teamId), {
      name: `Probe target ${unique}`,
      defense: { P: data.rosterIds[0] },
    });
    expect(created).toBe(201);
    const id = made.template.id;
    const url = `${listUrl(data.teamId)}/${id}`;

    expect((await authedFetch(userPage, "GET", url)).status).toBe(403);
    expect((await authedFetch(userPage, "PUT", url, { name: "nope" })).status).toBe(403);
    expect((await authedFetch(userPage, "POST", `${url}/duplicate`, {})).status).toBe(403);
    expect((await authedFetch(userPage, "DELETE", url)).status).toBe(403);

    // Clean up so later count-sensitive assertions aren't affected.
    expect((await authedFetch(adminPage, "DELETE", url)).status).toBe(200);
  });

  /* ── Scoping ───────────────────────────────────────────────────────────── */

  test("another team's lineup id 404s rather than 403s", async () => {
    const { status } = await authedFetch(
      adminPage,
      "GET",
      `${listUrl(data.teamId)}/${data.otherTemplateId}`
    );
    expect(status).toBe(404);
  });

  test("a roster_id from another team is stripped, never resolved", async () => {
    const { status, data: body } = await authedFetch(adminPage, "POST", listUrl(data.teamId), {
      name: `Cross team ${unique}`,
      defense: { P: data.foreignRosterId, C: data.rosterIds[0] },
    });
    expect(status).toBe(201);
    // Accepted, but the foreign player did not land in the lineup...
    expect(body.template.defense.P).toBeNull();
    expect(body.template.defense.C).toBe(data.rosterIds[0]);
    // ...and it isn't reported as merely "missing" either, which would still
    // confirm the id exists somewhere. It's simply gone.
    expect(body.template.missing_roster_ids).not.toContain(data.foreignRosterId);
    expect(JSON.stringify(body)).not.toContain("Zephyrus");

    await authedFetch(adminPage, "DELETE", `${listUrl(data.teamId)}/${body.template.id}`);
  });

  /* ── Validation ────────────────────────────────────────────────────────── */

  test("rejects a defense payload that is missing, empty, or malformed", async () => {
    const bad: [string, unknown][] = [
      ["no defense at all", undefined],
      ["all nine slots null", { P: null, C: null }],
      ["not an object", 42],
    ];
    for (const [label, defense] of bad) {
      const { status } = await authedFetch(adminPage, "POST", listUrl(data.teamId), {
        name: `Bad ${label} ${unique}`,
        defense,
      });
      expect(status, label).toBe(400);
    }
  });

  test("rejects DH and BN — a saved lineup is the nine fielding positions", async () => {
    // The game's defensive-lineup route accepts these; saved lineups must not,
    // or an import would carry a position the grid can never render.
    for (const pos of ["DH", "BN"]) {
      const { status } = await authedFetch(adminPage, "POST", listUrl(data.teamId), {
        name: `Bad ${pos} ${unique}`,
        defense: { [pos]: data.rosterIds[0] },
      });
      expect(status, pos).toBe(400);
    }
  });

  test("rejects the same player at two positions", async () => {
    const { status } = await authedFetch(adminPage, "POST", listUrl(data.teamId), {
      name: `Dupe ${unique}`,
      defense: { P: data.rosterIds[0], SS: data.rosterIds[0] },
    });
    expect(status).toBe(400);
  });

  test("rejects a blank or over-long name", async () => {
    for (const name of ["", "   ", "x".repeat(61)]) {
      const { status } = await authedFetch(adminPage, "POST", listUrl(data.teamId), {
        name,
        defense: { P: data.rosterIds[0] },
      });
      expect(status, JSON.stringify(name)).toBe(400);
    }
  });

  test("rejects an empty update", async () => {
    const { data: made } = await authedFetch(adminPage, "POST", listUrl(data.teamId), {
      name: `Empty update ${unique}`,
      defense: { P: data.rosterIds[0] },
    });
    const url = `${listUrl(data.teamId)}/${made.template.id}`;
    expect((await authedFetch(adminPage, "PUT", url, {})).status).toBe(400);
    await authedFetch(adminPage, "DELETE", url);
  });

  /* ── Unique names + duplicate ──────────────────────────────────────────── */

  test("names are unique per team, ignoring case and surrounding space", async () => {
    const name = `Jack pitching ${unique}`;
    const first = await authedFetch(adminPage, "POST", listUrl(data.teamId), {
      name,
      defense: { P: data.rosterIds[0] },
    });
    expect(first.status).toBe(201);

    for (const variant of [name, name.toUpperCase(), `  ${name}  `]) {
      const { status } = await authedFetch(adminPage, "POST", listUrl(data.teamId), {
        name: variant,
        defense: { P: data.rosterIds[1] },
      });
      expect(status, variant).toBe(409);
    }

    // Duplicating auto-suffixes rather than colliding.
    const copy1 = await authedFetch(
      adminPage,
      "POST",
      `${listUrl(data.teamId)}/${first.data.template.id}/duplicate`,
      {}
    );
    expect(copy1.status).toBe(201);
    expect(copy1.data.template.name).toBe(`${name} (copy)`);

    const copy2 = await authedFetch(
      adminPage,
      "POST",
      `${listUrl(data.teamId)}/${first.data.template.id}/duplicate`,
      {}
    );
    expect(copy2.status).toBe(201);
    expect(copy2.data.template.name).toBe(`${name} (copy 2)`);

    for (const id of [first.data.template.id, copy1.data.template.id, copy2.data.template.id]) {
      await authedFetch(adminPage, "DELETE", `${listUrl(data.teamId)}/${id}`);
    }
  });

  /* ── Roster churn ──────────────────────────────────────────────────────── */

  test("a deleted player becomes a missing id, and the next save strips it", async () => {
    const { status, data: made } = await authedFetch(adminPage, "POST", listUrl(data.teamId), {
      name: `Churn ${unique}`,
      defense: { P: data.throwawayRosterId, C: data.rosterIds[0] },
    });
    expect(status).toBe(201);
    const url = `${listUrl(data.teamId)}/${made.template.id}`;
    expect(made.template.defense.P).toBe(data.throwawayRosterId);

    // Hard-delete the player (the roster route deletes rather than anonymizes).
    expect(
      (await authedFetch(adminPage, "DELETE", `/api/teams/${data.teamId}/roster/${data.throwawayRosterId}`))
        .status
    ).toBe(200);

    const after = await authedFetch(adminPage, "GET", url);
    expect(after.status).toBe(200);
    expect(after.data.template.defense.P).toBeNull();
    expect(after.data.template.missing_roster_ids).toContain(data.throwawayRosterId);
    // The slot degrades to empty — no tombstoned name leaks through.
    expect(JSON.stringify(after.data)).not.toContain("Dana");

    // Saving self-heals: the stale id is gone from storage afterwards.
    const saved = await authedFetch(adminPage, "PUT", url, {
      defense: { C: data.rosterIds[0] },
    });
    expect(saved.status).toBe(200);
    expect(saved.data.template.missing_roster_ids).toHaveLength(0);

    const reread = await authedFetch(adminPage, "GET", url);
    expect(reread.data.template.missing_roster_ids).toHaveLength(0);

    await authedFetch(adminPage, "DELETE", url);
  });

  /* ── Shared by the team ────────────────────────────────────────────────── */

  test("granting team_manager opens up read, write and delete for everyone's lineups", async () => {
    // Created by the admin — the grantee must be able to edit it, because saved
    // lineups belong to the team rather than to their author.
    const { data: made } = await authedFetch(adminPage, "POST", listUrl(data.teamId), {
      name: `Shared ${unique}`,
      defense: { P: data.rosterIds[0] },
    });
    const url = `${listUrl(data.teamId)}/${made.template.id}`;

    const role = await assignRoleViaApi(
      adminPage,
      data.userId!,
      "team_manager",
      "team",
      data.teamId!
    );
    data.grantedRoleId = role?.id ?? null;

    try {
      expect((await authedFetch(userPage, "GET", listUrl(data.teamId))).status).toBe(200);
      expect((await authedFetch(userPage, "GET", url)).status).toBe(200);

      const renamed = await authedFetch(userPage, "PUT", url, { name: `Shared renamed ${unique}` });
      expect(renamed.status).toBe(200);
      expect(renamed.data.template.name).toBe(`Shared renamed ${unique}`);
      // Attribution records both hands.
      expect(renamed.data.template.created_by).not.toBe(renamed.data.template.updated_by);

      const created = await authedFetch(userPage, "POST", listUrl(data.teamId), {
        name: `Grantee made ${unique}`,
        defense: { C: data.rosterIds[1] },
      });
      expect(created.status).toBe(201);
      await authedFetch(userPage, "DELETE", `${listUrl(data.teamId)}/${created.data.template.id}`);

      expect((await authedFetch(userPage, "DELETE", url)).status).toBe(200);
      expect((await authedFetch(adminPage, "GET", url)).status).toBe(404);
    } finally {
      if (data.grantedRoleId) {
        await revokeRoleViaApi(adminPage, data.grantedRoleId).catch(() => {});
        data.grantedRoleId = null;
      }
    }
  });

  /* ── Import into a game ────────────────────────────────────────────────── */

  test("importing a lineup fills the chosen innings only, and skips unconfirmed players", async () => {
    // A scrimmage this team hosts, with two of its three players confirmed.
    const { status: scrimStatus, data: scrim } = await authedFetch(
      adminPage,
      "POST",
      `/api/teams/${data.teamId}/scrimmages`,
      { gamedate: "2026-09-01", gametime: "10:00", opponent_name: `Import Opp ${unique}` }
    );
    expect(scrimStatus).toBe(201);
    const gameId = scrim.id ?? scrim.scrimmage?.id;
    expect(gameId).toBeTruthy();

    const [ava, ben, cole] = data.rosterIds;
    const confirmations = await authedFetch(
      adminPage,
      "PUT",
      `/api/games/scrimmage/${gameId}/confirmations`,
      {
        team_id: data.teamId,
        confirmations: [
          { roster_id: ava, status: "confirmed" },
          { roster_id: ben, status: "confirmed" },
          { roster_id: cole, status: "declined" },
        ],
      }
    );
    expect(confirmations.status).toBe(200);

    // Cole is in the lineup but not confirmed, so his slot must land empty.
    const { data: made } = await authedFetch(adminPage, "POST", listUrl(data.teamId), {
      name: `Import source ${unique}`,
      defense: { P: ava, C: ben, SS: cole },
    });
    const templateId = made.template.id;

    await adminPage.goto(
      `/games/scrimmage/${gameId}?team=${data.teamId}`
    );
    await adminPage.getByRole("tab", { name: /Defense/i }).click();

    await adminPage.getByRole("button", { name: /import lineup/i }).click();
    await adminPage.getByRole("button", { name: `Import source ${unique}` }).click();

    // Innings default to none — Apply stays disabled until one is picked.
    const applyBtn = adminPage.getByRole("button", { name: "Apply", exact: true });
    await expect(applyBtn).toBeDisabled();

    // Apply to innings 1 and 3 only.
    await adminPage.getByRole("button", { name: "1", exact: true }).click();
    await adminPage.getByRole("button", { name: "3", exact: true }).click();
    await expect(applyBtn).toBeEnabled();
    await applyBtn.click();

    await adminPage.getByRole("button", { name: "Save", exact: true }).click();

    // Verify against the stored game lineup rather than the grid.
    await expect(async () => {
      const { data: saved } = await authedFetch(
        adminPage,
        "GET",
        `/api/games/scrimmage/${gameId}/defensive-lineup?team=${data.teamId}`
      );
      const at = (inning: number, position: string) =>
        saved.lineup.find(
          (r: { inning: number; position: string }) => r.inning === inning && r.position === position
        )?.roster_id ?? null;

      // Innings 1 and 3 filled...
      expect(at(1, "P")).toBe(ava);
      expect(at(1, "C")).toBe(ben);
      expect(at(3, "P")).toBe(ava);
      expect(at(3, "C")).toBe(ben);
      // ...the declined player left out...
      expect(at(1, "SS")).toBeNull();
      expect(at(3, "SS")).toBeNull();
      // ...and the innings that weren't ticked untouched.
      expect(saved.lineup.filter((r: { inning: number }) => r.inning === 2)).toHaveLength(0);
      expect(saved.lineup.filter((r: { inning: number }) => r.inning === 4)).toHaveLength(0);
    }).toPass({ timeout: 10_000 });

    /* Capture: save inning 1 back out as a new team lineup. */
    await adminPage
      .getByRole("button", { name: `Save inning 1 as a team lineup` })
      .click();
    const captureName = `Captured ${unique}`;
    await adminPage.getByLabel("Name").fill(captureName);
    await adminPage.getByRole("button", { name: /save lineup/i }).click();

    await expect(async () => {
      const { data: list } = await authedFetch(adminPage, "GET", listUrl(data.teamId));
      const captured = list.templates.find((t: { name: string }) => t.name === captureName);
      expect(captured).toBeTruthy();
      expect(captured.defense.P).toBe(ava);
      expect(captured.defense.C).toBe(ben);
      expect(captured.defense.SS).toBeNull();
    }).toPass({ timeout: 10_000 });

    // Cleanup
    const { data: list } = await authedFetch(adminPage, "GET", listUrl(data.teamId));
    for (const t of list.templates as { id: number; name: string }[]) {
      if (t.name === captureName || t.id === templateId) {
        await authedFetch(adminPage, "DELETE", `${listUrl(data.teamId)}/${t.id}`);
      }
    }
    await authedFetch(adminPage, "DELETE", `/api/teams/${data.teamId}/scrimmages/${gameId}`);
  });

  /* ── UI ────────────────────────────────────────────────────────────────── */

  test("the Lineups tab is coach-only and can build a lineup end to end", async () => {
    await userPage.goto(`/teams/${data.teamId}`);
    await expect(userPage.getByRole("tab", { name: "Lineups" })).toHaveCount(0);

    await adminPage.goto(`/teams/${data.teamId}?tab=lineups`);
    await expect(adminPage.getByRole("tab", { name: "Lineups" })).toBeVisible();

    await adminPage.getByRole("button", { name: /new lineup/i }).click();
    const name = `UI Lineup ${unique}`;
    await adminPage.getByLabel("Name").fill(name);

    // Type into the P cell and pick the first suggestion.
    const pitcherCell = adminPage.getByRole("textbox", { name: "P", exact: true });
    await pitcherCell.click();
    await pitcherCell.fill("Ava");
    await pitcherCell.press("Enter");

    await adminPage.getByRole("button", { name: /save lineup/i }).click();
    await expect(adminPage.getByText(name)).toBeVisible();

    // And it's really there.
    const { data: list } = await authedFetch(adminPage, "GET", listUrl(data.teamId));
    const found = list.templates.find((t: { name: string }) => t.name === name);
    expect(found).toBeTruthy();
    expect(found.defense.P).toBe(data.rosterIds[0]);

    await authedFetch(adminPage, "DELETE", `${listUrl(data.teamId)}/${found.id}`);
  });
});
