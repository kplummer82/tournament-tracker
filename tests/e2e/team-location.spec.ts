import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { apiLogin, authedFetch } from "./helpers/auth";
import { deleteTeamViaApi } from "./helpers/seed";

/**
 * Team home location — either a venue from the shared directory ("home_field")
 * or a Mapbox-resolved city ("city").
 *
 * The city path is asserted through the API rather than the Mapbox typeahead so
 * the suite never depends on (or bills) the Mapbox Search Box endpoint. The UI
 * test drives the home-field typeahead, which hits our own /api/locations.
 */

// Don't load the saved storageState (tests/auth-state.json) — this spec signs in
// fresh via apiLogin, and the file isn't present in CI.
test.use({ storageState: { cookies: [], origins: [] } });

// Serial: one sign-in shared by every test — concurrent sign-ins trip Better
// Auth's per-IP rate limit.
test.describe.configure({ mode: "serial" });

const unique = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
let counter = 0;
const uniqueName = (prefix: string) => `${prefix} ${unique}-${counter++}`;

test.describe("Team location", () => {
  let context: BrowserContext;
  let page: Page;
  let location: { id: number; name: string };

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    await apiLogin(page, "admin");

    const { data } = await authedFetch(page, "GET", "/api/locations?pageSize=1&page=1");
    const row = data.rows?.[0];
    expect(row, "the locations directory must have at least one row").toBeTruthy();
    location = { id: row.id, name: row.name };
  });

  test.afterAll(async () => {
    await context?.close();
  });

  const createTeam = (body: Record<string, unknown>) =>
    authedFetch(page, "POST", "/api/teams", {
      season: "Spring",
      year: 2026,
      divisionId: 1,
      ...body,
    });

  test("creates a team located by city and reads it back", async () => {
    const { status, data } = await createTeam({
      name: uniqueName("Loc City"),
      locationType: "city",
      city: "San Marcos",
      state: "CA",
      latitude: 33.1434,
      longitude: -117.1661,
    });
    expect(status).toBe(201);
    const teamId = data.id;

    try {
      const { data: detail } = await authedFetch(page, "GET", `/api/teams/${teamId}`);
      expect(detail.team.location_type).toBe("city");
      expect(detail.team.city).toBe("San Marcos");
      expect(detail.team.state).toBe("CA");
      expect(detail.team.home_location_id).toBeNull();
      expect(detail.team.location_label).toBe("San Marcos, CA");
      expect(Number(detail.team.latitude)).toBeCloseTo(33.1434, 3);
    } finally {
      await deleteTeamViaApi(page, teamId);
    }
  });

  test("creates a team located by home field and inherits the venue's city", async () => {
    const { status, data } = await createTeam({
      name: uniqueName("Loc Field"),
      locationType: "home_field",
      homeLocationId: location.id,
    });
    expect(status).toBe(201);
    const teamId = data.id;

    try {
      const { data: detail } = await authedFetch(page, "GET", `/api/teams/${teamId}`);
      expect(detail.team.location_type).toBe("home_field");
      expect(detail.team.home_location_id).toBe(location.id);
      expect(detail.team.home_location_name).toBe(location.name);
      expect(detail.team.location_label).toBe(location.name);
    } finally {
      await deleteTeamViaApi(page, teamId);
    }
  });

  test("switching location mode via PATCH clears the other mode's columns", async () => {
    const { data } = await createTeam({
      name: uniqueName("Loc Switch"),
      locationType: "city",
      city: "Escondido",
      state: "CA",
      latitude: 33.1192,
      longitude: -117.0864,
    });
    const teamId = data.id;

    try {
      const { status } = await authedFetch(page, "PATCH", `/api/teams/${teamId}`, {
        locationType: "home_field",
        homeLocationId: location.id,
      });
      expect(status).toBe(200);

      const { data: detail } = await authedFetch(page, "GET", `/api/teams/${teamId}`);
      expect(detail.team.location_type).toBe("home_field");
      expect(detail.team.home_location_id).toBe(location.id);
      // The old city must not linger — the effective city now comes from the venue.
      expect(detail.team.location_label).toBe(location.name);
      expect(detail.team.city).not.toBe("Escondido");
    } finally {
      await deleteTeamViaApi(page, teamId);
    }
  });

  test("a PATCH that omits locationType leaves the location untouched", async () => {
    const { data } = await createTeam({
      name: uniqueName("Loc Keep"),
      locationType: "city",
      city: "Poway",
      state: "CA",
    });
    const teamId = data.id;

    try {
      const renamed = uniqueName("Loc Keep Renamed");
      const { status } = await authedFetch(page, "PATCH", `/api/teams/${teamId}`, { name: renamed });
      expect(status).toBe(200);

      const { data: detail } = await authedFetch(page, "GET", `/api/teams/${teamId}`);
      expect(detail.team.name).toBe(renamed);
      expect(detail.team.location_label).toBe("Poway, CA");
    } finally {
      await deleteTeamViaApi(page, teamId);
    }
  });

  test("rejects incomplete location payloads", async () => {
    const missingField = await createTeam({
      name: uniqueName("Loc Bad Field"),
      locationType: "home_field",
    });
    expect(missingField.status).toBe(400);

    const missingCity = await createTeam({
      name: uniqueName("Loc Bad City"),
      locationType: "city",
      state: "CA",
    });
    expect(missingCity.status).toBe(400);
  });

  test("the create form requires a location before it will submit", async () => {
    await page.goto("/teams");
    await page.getByRole("button", { name: /New Team/i }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog.getByLabel(/Team name/i).fill(uniqueName("Loc UI"));

    // Comboboxes in DOM order: Season, League, Division, Sport. Leaving League
    // alone keeps this an independent team, so Division lists global divisions.
    // Options render in a portal outside the dialog, hence page-level lookup.
    for (const index of [0, 2, 3]) {
      await dialog.getByRole("combobox").nth(index).click();
      await page.getByRole("option").first().click();
    }

    const createBtn = dialog.getByRole("button", { name: /^Create$/ });
    await expect(createBtn, "no location chosen yet").toBeDisabled();

    // Home field is the default mode — search the shared directory and pick a venue.
    await dialog.getByPlaceholder(/Search fields/i).fill(location.name.slice(0, 12));
    await dialog.getByRole("button", { name: new RegExp(escapeRe(location.name)) }).first().click();

    await expect(createBtn).toBeEnabled();
  });
});

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
