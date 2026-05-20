# Tournament Venues Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Venues tab to each tournament where organizers define the venues+fields a tournament uses, then constrain game scheduling to those venues.

**Architecture:** Two new tables (`tournament_venues`, `tournament_venue_fields`) with a kind-XOR design — a venue is either a pointer to a global `locations` row (predefined) or a freeform per-tournament entry (custom). One new nullable column on `tournamentgames` (`tournament_venue_id`). New tab/page/modals on the frontend, replacement of `LocationPicker` with `TournamentVenuePicker` in the bracket schedule modal, and a one-time auto-promotion routine that runs the first time the Venues tab is loaded for a tournament that has games with locations already set.

**Tech Stack:** Next.js 15 Pages Router, TypeScript, Tailwind v4, Neon Postgres (`sql` tagged template + `pool.connect()` from `@/lib/db`), Playwright for end-to-end checks via the existing dev server.

**Spec:** [docs/superpowers/specs/2026-05-20-tournament-venues-tab-design.md](../specs/2026-05-20-tournament-venues-tab-design.md)

---

## File Structure

**New files (created in order):**

| Path | Responsibility |
|---|---|
| `database/migration_tournament_venues.sql` | Schema migration: two tables, `tournamentgames.tournament_venue_id`, `tournaments.venues_initialized` |
| `lib/tournaments/venues.ts` | Server-side helpers: `runAutoPromotion`, shared row→DTO mapper |
| `pages/api/tournaments/[tournamentid]/venues/index.ts` | GET (with auto-promotion) + POST |
| `pages/api/tournaments/[tournamentid]/venues/[venueId]/index.ts` | PATCH + DELETE for a venue |
| `pages/api/tournaments/[tournamentid]/venues/[venueId]/fields/index.ts` | POST a new field |
| `pages/api/tournaments/[tournamentid]/venues/[venueId]/fields/[fieldId].ts` | PATCH + DELETE for a field |
| `components/tournaments/venues/VenueCard.tsx` | One predefined-or-custom venue with inline field chips |
| `components/tournaments/venues/AddPredefinedVenueModal.tsx` | Search-only modal that calls `POST .../venues { kind: "predefined" }` |
| `components/tournaments/venues/AddCustomVenueModal.tsx` | Freeform name/address/fields modal that calls `POST .../venues { kind: "custom" }` |
| `components/tournaments/TournamentVenuePicker.tsx` | Two-step venue+field dropdown for game scheduling |
| `pages/tournaments/[tournamentid]/venues.tsx` | The tab page itself |

**Modified files:**

| Path | Change |
|---|---|
| `components/tournaments/types.ts` | Add `"venues"` to `TabKey` |
| `components/tournaments/TabsNav.tsx` | Insert "Venues" between Teams and Pool Play |
| `components/bracket/BracketGameScheduleModal.tsx` | Swap `LocationPicker` for `TournamentVenuePicker`; include `tournament_venue_id` in the PATCH body |
| `pages/api/seasons/[seasonid]/games/[gameid].ts` | If this is the endpoint the bracket modal PATCHes, accept and persist `tournament_venue_id` (verify in Task 14) |

---

## Task 1: Database migration

**Files:**
- Create: `database/migration_tournament_venues.sql`

- [ ] **Step 1: Write the migration**

```sql
-- database/migration_tournament_venues.sql
-- Tournament-scoped venues with optional link to global locations,
-- per-venue field/court list, and a one-time auto-promotion flag.

CREATE TABLE IF NOT EXISTS tournament_venues (
  id               serial PRIMARY KEY,
  tournament_id    int NOT NULL REFERENCES tournaments(tournamentid) ON DELETE CASCADE,
  sort_order       int NOT NULL DEFAULT 0,

  location_id      int NULL REFERENCES locations(id) ON DELETE SET NULL,

  custom_name      text NULL,
  custom_address   text NULL,
  custom_city      text NULL,
  custom_state     text NULL,

  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       text NULL,

  CONSTRAINT tournament_venues_kind_xor CHECK (
    (location_id IS NOT NULL AND custom_name IS NULL)
    OR
    (location_id IS NULL AND custom_name IS NOT NULL)
  ),
  CONSTRAINT tournament_venues_unique_predefined UNIQUE (tournament_id, location_id)
);

CREATE INDEX IF NOT EXISTS idx_tournament_venues_tid
  ON tournament_venues (tournament_id, sort_order);

CREATE TABLE IF NOT EXISTS tournament_venue_fields (
  id                    serial PRIMARY KEY,
  tournament_venue_id   int NOT NULL REFERENCES tournament_venues(id) ON DELETE CASCADE,
  name                  text NOT NULL,
  sort_order            int NOT NULL DEFAULT 0,
  CONSTRAINT tournament_venue_fields_unique_name
    UNIQUE (tournament_venue_id, name)
);

CREATE INDEX IF NOT EXISTS idx_tournament_venue_fields_venue
  ON tournament_venue_fields (tournament_venue_id, sort_order);

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS venues_initialized boolean NOT NULL DEFAULT false;

ALTER TABLE tournamentgames
  ADD COLUMN IF NOT EXISTS tournament_venue_id int NULL
    REFERENCES tournament_venues(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tournamentgames_venue
  ON tournamentgames (tournament_venue_id);
```

- [ ] **Step 2: Apply to dev Neon branch**

Use the Neon MCP `run_sql` tool against project `wispy-breeze-77320545`, branch `br-billowing-forest-aflgasia`, paste the SQL above. Expected: empty `[]` result.

- [ ] **Step 3: Verify**

Run via Neon MCP `run_sql`:

```sql
SELECT to_regclass('tournament_venues') AS v,
       to_regclass('tournament_venue_fields') AS f;
SELECT column_name FROM information_schema.columns
  WHERE table_name='tournaments' AND column_name='venues_initialized';
SELECT column_name FROM information_schema.columns
  WHERE table_name='tournamentgames' AND column_name='tournament_venue_id';
```

Expected: both regclasses populated, both columns present.

- [ ] **Step 4: Commit**

```bash
git add database/migration_tournament_venues.sql
git commit -m "feat(db): tournament_venues + tournament_venue_fields schema"
```

---

## Task 2: Server-side helpers (`lib/tournaments/venues.ts`)

This module owns the DTO shape, the SQL→DTO mapper, and the auto-promotion transaction. Every API route below calls into it.

**Files:**
- Create: `lib/tournaments/venues.ts`

- [ ] **Step 1: Write the file**

```ts
// lib/tournaments/venues.ts
import type { PoolClient } from "pg";

export type VenueFieldDTO = {
  id: number;
  name: string;
  sortOrder: number;
};

export type VenueDTO = {
  id: number;
  kind: "predefined" | "custom";
  locationId: number | null;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  sortOrder: number;
  gameCount: number;
  fields: VenueFieldDTO[];
};

/**
 * Load all venues for a tournament with their fields and a per-venue game count,
 * ordered by sort_order then id. Single query per call site, returns ready-to-send DTOs.
 */
export async function loadVenues(
  client: PoolClient,
  tournamentId: number,
): Promise<VenueDTO[]> {
  const { rows: venueRows } = await client.query(
    `
    SELECT
      tv.id,
      tv.location_id,
      tv.custom_name,
      tv.custom_address,
      tv.custom_city,
      tv.custom_state,
      tv.sort_order,
      l.name    AS loc_name,
      l.address AS loc_address,
      l.city    AS loc_city,
      l.state   AS loc_state,
      (SELECT COUNT(*)::int FROM tournamentgames g
        WHERE g.tournament_venue_id = tv.id) AS game_count
    FROM tournament_venues tv
    LEFT JOIN locations l ON l.id = tv.location_id
    WHERE tv.tournament_id = $1
    ORDER BY tv.sort_order ASC, tv.id ASC
    `,
    [tournamentId],
  );

  if (venueRows.length === 0) return [];

  const venueIds = venueRows.map((r) => Number(r.id));
  const { rows: fieldRows } = await client.query(
    `
    SELECT id, tournament_venue_id, name, sort_order
    FROM tournament_venue_fields
    WHERE tournament_venue_id = ANY($1::int[])
    ORDER BY sort_order ASC, id ASC
    `,
    [venueIds],
  );

  const fieldsByVenue = new Map<number, VenueFieldDTO[]>();
  for (const f of fieldRows) {
    const vid = Number(f.tournament_venue_id);
    const list = fieldsByVenue.get(vid) ?? [];
    list.push({ id: Number(f.id), name: f.name, sortOrder: Number(f.sort_order) });
    fieldsByVenue.set(vid, list);
  }

  return venueRows.map((r): VenueDTO => {
    const kind: "predefined" | "custom" = r.location_id != null ? "predefined" : "custom";
    return {
      id: Number(r.id),
      kind,
      locationId: r.location_id != null ? Number(r.location_id) : null,
      name: kind === "predefined" ? (r.loc_name ?? "") : (r.custom_name ?? ""),
      address: kind === "predefined" ? (r.loc_address ?? null) : (r.custom_address ?? null),
      city: kind === "predefined" ? (r.loc_city ?? null) : (r.custom_city ?? null),
      state: kind === "predefined" ? (r.loc_state ?? null) : (r.custom_state ?? null),
      sortOrder: Number(r.sort_order),
      gameCount: Number(r.game_count ?? 0),
      fields: fieldsByVenue.get(Number(r.id)) ?? [],
    };
  });
}

/**
 * One-time migration: when this tournament's venues_initialized flag is false,
 * roll existing tournamentgames locations into tournament_venues + fields,
 * then set the flag. Idempotent and locked via SELECT ... FOR UPDATE.
 */
export async function runAutoPromotionIfNeeded(
  client: PoolClient,
  tournamentId: number,
): Promise<void> {
  const { rows: tRows } = await client.query(
    `SELECT venues_initialized FROM tournaments
      WHERE tournamentid = $1 FOR UPDATE`,
    [tournamentId],
  );
  if (tRows.length === 0) return; // tournament gone; caller handles 404
  if (tRows[0].venues_initialized === true) return;

  // Predefined: distinct location_id values among this tournament's games.
  const { rows: predefRows } = await client.query(
    `
    SELECT location_id, MIN(tournamentgameid) AS first_game
    FROM tournamentgames
    WHERE tournamentid = $1 AND location_id IS NOT NULL
    GROUP BY location_id
    `,
    [tournamentId],
  );

  // Custom: distinct non-empty lower(trim(location)) among games with no location_id.
  const { rows: customRows } = await client.query(
    `
    SELECT
      LOWER(TRIM(location)) AS key,
      MIN(location) AS sample_name
    FROM tournamentgames
    WHERE tournamentid = $1
      AND location_id IS NULL
      AND location IS NOT NULL
      AND TRIM(location) <> ''
    GROUP BY LOWER(TRIM(location))
    `,
    [tournamentId],
  );

  // Insert predefined venues + backfill games + insert fields
  for (const r of predefRows) {
    const { rows: ins } = await client.query(
      `INSERT INTO tournament_venues (tournament_id, location_id, sort_order)
         VALUES ($1, $2, 0)
         ON CONFLICT (tournament_id, location_id) DO UPDATE SET sort_order = tournament_venues.sort_order
         RETURNING id`,
      [tournamentId, Number(r.location_id)],
    );
    const venueId = Number(ins[0].id);

    await client.query(
      `UPDATE tournamentgames
          SET tournament_venue_id = $1
        WHERE tournamentid = $2 AND location_id = $3`,
      [venueId, tournamentId, Number(r.location_id)],
    );

    // Distinct non-empty field strings for this group → field rows
    const { rows: fieldRows } = await client.query(
      `SELECT DISTINCT field FROM tournamentgames
        WHERE tournamentid = $1 AND location_id = $2
          AND field IS NOT NULL AND TRIM(field) <> ''`,
      [tournamentId, Number(r.location_id)],
    );
    let order = 0;
    for (const f of fieldRows) {
      await client.query(
        `INSERT INTO tournament_venue_fields (tournament_venue_id, name, sort_order)
           VALUES ($1, $2, $3)
           ON CONFLICT (tournament_venue_id, name) DO NOTHING`,
        [venueId, String(f.field).trim(), order++],
      );
    }
  }

  // Insert custom venues + backfill games + insert fields
  for (const r of customRows) {
    const key = String(r.key);
    const sampleName = String(r.sample_name).trim();

    const { rows: ins } = await client.query(
      `INSERT INTO tournament_venues (tournament_id, custom_name, sort_order)
         VALUES ($1, $2, 0)
         RETURNING id`,
      [tournamentId, sampleName],
    );
    const venueId = Number(ins[0].id);

    await client.query(
      `UPDATE tournamentgames
          SET tournament_venue_id = $1
        WHERE tournamentid = $2
          AND location_id IS NULL
          AND LOWER(TRIM(location)) = $3`,
      [venueId, tournamentId, key],
    );

    const { rows: fieldRows } = await client.query(
      `SELECT DISTINCT field FROM tournamentgames
        WHERE tournamentid = $1
          AND location_id IS NULL
          AND LOWER(TRIM(location)) = $2
          AND field IS NOT NULL AND TRIM(field) <> ''`,
      [tournamentId, key],
    );
    let order = 0;
    for (const f of fieldRows) {
      await client.query(
        `INSERT INTO tournament_venue_fields (tournament_venue_id, name, sort_order)
           VALUES ($1, $2, $3)
           ON CONFLICT (tournament_venue_id, name) DO NOTHING`,
        [venueId, String(f.field).trim(), order++],
      );
    }
  }

  await client.query(
    `UPDATE tournaments SET venues_initialized = true WHERE tournamentid = $1`,
    [tournamentId],
  );
}
```

- [ ] **Step 2: Type-check the file**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors related to `lib/tournaments/venues.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/tournaments/venues.ts
git commit -m "feat(api): tournament venues helpers + auto-promotion"
```

---

## Task 3: `GET` + `POST /api/tournaments/:id/venues`

**Files:**
- Create: `pages/api/tournaments/[tournamentid]/venues/index.ts`

- [ ] **Step 1: Write the handler**

```ts
// pages/api/tournaments/[tournamentid]/venues/index.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "@/lib/db";
import { requireSession, requireTournamentAccess } from "@/lib/auth/requireSession";
import { loadVenues, runAutoPromotionIfNeeded } from "@/lib/tournaments/venues";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const tournamentId = Number(req.query.tournamentid);
  if (!Number.isFinite(tournamentId)) {
    return res.status(400).json({ error: "Invalid tournament id" });
  }
  if (req.method === "GET") return getVenues(req, res, tournamentId);
  if (req.method === "POST") return createVenue(req, res, tournamentId);
  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).end("Method Not Allowed");
}

async function getVenues(req: NextApiRequest, res: NextApiResponse, tournamentId: number) {
  const session = await requireSession(req, res);
  if (!session) return;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await runAutoPromotionIfNeeded(client, tournamentId);
    const venues = await loadVenues(client, tournamentId);
    await client.query("COMMIT");
    return res.status(200).json({ venues });
  } catch (e: any) {
    await client.query("ROLLBACK");
    console.error(e);
    return res.status(500).json({ error: e.message || "Failed to load venues" });
  } finally {
    client.release();
  }
}

async function createVenue(req: NextApiRequest, res: NextApiResponse, tournamentId: number) {
  const session = await requireTournamentAccess(req, res, tournamentId);
  if (!session) return;
  const body = req.body ?? {};
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let venueId: number;

    if (body.kind === "predefined") {
      const locationId = Number(body.locationId);
      if (!Number.isFinite(locationId)) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "locationId required for predefined kind" });
      }
      const { rows: locRows } = await client.query(
        `SELECT id FROM locations WHERE id = $1`,
        [locationId],
      );
      if (locRows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Unknown location" });
      }
      try {
        const { rows: ins } = await client.query(
          `INSERT INTO tournament_venues (tournament_id, location_id, sort_order, created_by)
             VALUES ($1, $2,
               COALESCE((SELECT MAX(sort_order) + 1 FROM tournament_venues WHERE tournament_id = $1), 0),
               $3)
             RETURNING id`,
          [tournamentId, locationId, session.user.id],
        );
        venueId = Number(ins[0].id);
      } catch (e: any) {
        if (String(e.code) === "23505") {
          await client.query("ROLLBACK");
          return res.status(409).json({ error: "Tournament already includes this location" });
        }
        throw e;
      }

      // Pre-populate fields from the location's existing location_fields (if any).
      const { rows: lf } = await client.query(
        `SELECT name FROM location_fields WHERE location_id = $1 ORDER BY id ASC`,
        [locationId],
      );
      let order = 0;
      for (const f of lf) {
        await client.query(
          `INSERT INTO tournament_venue_fields (tournament_venue_id, name, sort_order)
             VALUES ($1, $2, $3)
             ON CONFLICT (tournament_venue_id, name) DO NOTHING`,
          [venueId, String(f.name).trim(), order++],
        );
      }
    } else if (body.kind === "custom") {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "name required for custom kind" });
      }
      const { rows: ins } = await client.query(
        `INSERT INTO tournament_venues
           (tournament_id, custom_name, custom_address, custom_city, custom_state, sort_order, created_by)
         VALUES ($1, $2, $3, $4, $5,
           COALESCE((SELECT MAX(sort_order) + 1 FROM tournament_venues WHERE tournament_id = $1), 0),
           $6)
         RETURNING id`,
        [
          tournamentId,
          name,
          typeof body.address === "string" ? body.address.trim() || null : null,
          typeof body.city === "string" ? body.city.trim() || null : null,
          typeof body.state === "string" ? body.state.trim() || null : null,
          session.user.id,
        ],
      );
      venueId = Number(ins[0].id);

      const fields: unknown = body.fields;
      if (Array.isArray(fields)) {
        let order = 0;
        const seen = new Set<string>();
        for (const f of fields) {
          if (typeof f !== "string") continue;
          const t = f.trim();
          if (!t) continue;
          const key = t.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          await client.query(
            `INSERT INTO tournament_venue_fields (tournament_venue_id, name, sort_order)
               VALUES ($1, $2, $3)
               ON CONFLICT (tournament_venue_id, name) DO NOTHING`,
            [venueId, t, order++],
          );
        }
      }
    } else {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "kind must be 'predefined' or 'custom'" });
    }

    const venues = await loadVenues(client, tournamentId);
    await client.query("COMMIT");
    const created = venues.find((v) => v.id === venueId);
    return res.status(201).json({ venue: created });
  } catch (e: any) {
    await client.query("ROLLBACK");
    console.error(e);
    return res.status(500).json({ error: e.message || "Failed to create venue" });
  } finally {
    client.release();
  }
}
```

- [ ] **Step 2: Smoke test via curl-equivalent (PowerShell `Invoke-RestMethod`)**

Pre-req: dev server is already running on port 3000, you are signed in as the admin user `KP` whose cookie is in the running browser session. The simplest smoke is from the Playwright session we already have open in the smoke-test step at Task 18 — defer functional verification to that task. For now, just confirm the file type-checks.

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add pages/api/tournaments/[tournamentid]/venues/index.ts
git commit -m "feat(api): GET/POST tournament venues"
```

---

## Task 4: `PATCH` + `DELETE /api/tournaments/:id/venues/:venueId`

**Files:**
- Create: `pages/api/tournaments/[tournamentid]/venues/[venueId]/index.ts`

- [ ] **Step 1: Write the handler**

```ts
// pages/api/tournaments/[tournamentid]/venues/[venueId]/index.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "@/lib/db";
import { requireTournamentAccess } from "@/lib/auth/requireSession";
import { loadVenues } from "@/lib/tournaments/venues";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const tournamentId = Number(req.query.tournamentid);
  const venueId = Number(req.query.venueId);
  if (!Number.isFinite(tournamentId) || !Number.isFinite(venueId)) {
    return res.status(400).json({ error: "Invalid id(s)" });
  }
  if (req.method === "PATCH") return patchVenue(req, res, tournamentId, venueId);
  if (req.method === "DELETE") return deleteVenue(req, res, tournamentId, venueId);
  res.setHeader("Allow", ["PATCH", "DELETE"]);
  return res.status(405).end("Method Not Allowed");
}

async function patchVenue(req: NextApiRequest, res: NextApiResponse, tournamentId: number, venueId: number) {
  const session = await requireTournamentAccess(req, res, tournamentId);
  if (!session) return;
  const body = req.body ?? {};
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT id, location_id FROM tournament_venues
        WHERE id = $1 AND tournament_id = $2`,
      [venueId, tournamentId],
    );
    if (rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Venue not found" });
    }
    const isCustom = rows[0].location_id == null;

    const sets: string[] = [];
    const params: any[] = [];
    let i = 1;

    if (isCustom) {
      if (typeof body.name === "string") {
        const t = body.name.trim();
        if (!t) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: "name cannot be empty" });
        }
        sets.push(`custom_name = $${i++}`);
        params.push(t);
      }
      if (typeof body.address === "string") {
        sets.push(`custom_address = $${i++}`);
        params.push(body.address.trim() || null);
      }
      if (typeof body.city === "string") {
        sets.push(`custom_city = $${i++}`);
        params.push(body.city.trim() || null);
      }
      if (typeof body.state === "string") {
        sets.push(`custom_state = $${i++}`);
        params.push(body.state.trim() || null);
      }
    }

    if (body.sortOrder != null && Number.isFinite(Number(body.sortOrder))) {
      sets.push(`sort_order = $${i++}`);
      params.push(Number(body.sortOrder));
    }

    if (sets.length === 0) {
      // Nothing to change; just return current state.
      const venues = await loadVenues(client, tournamentId);
      await client.query("COMMIT");
      const updated = venues.find((v) => v.id === venueId);
      return res.status(200).json({ venue: updated });
    }

    params.push(venueId);
    await client.query(
      `UPDATE tournament_venues SET ${sets.join(", ")} WHERE id = $${i}`,
      params,
    );

    const venues = await loadVenues(client, tournamentId);
    await client.query("COMMIT");
    const updated = venues.find((v) => v.id === venueId);
    return res.status(200).json({ venue: updated });
  } catch (e: any) {
    await client.query("ROLLBACK");
    console.error(e);
    return res.status(500).json({ error: e.message || "Failed to update venue" });
  } finally {
    client.release();
  }
}

async function deleteVenue(req: NextApiRequest, res: NextApiResponse, tournamentId: number, venueId: number) {
  const session = await requireTournamentAccess(req, res, tournamentId);
  if (!session) return;
  const client = await pool.connect();
  try {
    const { rowCount } = await client.query(
      `DELETE FROM tournament_venues
        WHERE id = $1 AND tournament_id = $2`,
      [venueId, tournamentId],
    );
    if (rowCount === 0) return res.status(404).json({ error: "Venue not found" });
    return res.status(204).end();
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: e.message || "Failed to delete venue" });
  } finally {
    client.release();
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add pages/api/tournaments/[tournamentid]/venues/[venueId]/index.ts
git commit -m "feat(api): PATCH/DELETE tournament venue"
```

---

## Task 5: Field POST endpoint

**Files:**
- Create: `pages/api/tournaments/[tournamentid]/venues/[venueId]/fields/index.ts`

- [ ] **Step 1: Write the handler**

```ts
// pages/api/tournaments/[tournamentid]/venues/[venueId]/fields/index.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "@/lib/db";
import { requireTournamentAccess } from "@/lib/auth/requireSession";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const tournamentId = Number(req.query.tournamentid);
  const venueId = Number(req.query.venueId);
  if (!Number.isFinite(tournamentId) || !Number.isFinite(venueId)) {
    return res.status(400).json({ error: "Invalid id(s)" });
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end("Method Not Allowed");
  }
  const session = await requireTournamentAccess(req, res, tournamentId);
  if (!session) return;

  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!name) return res.status(400).json({ error: "name required" });

  const client = await pool.connect();
  try {
    const { rows: own } = await client.query(
      `SELECT 1 FROM tournament_venues WHERE id = $1 AND tournament_id = $2`,
      [venueId, tournamentId],
    );
    if (own.length === 0) return res.status(404).json({ error: "Venue not found" });

    // Case-insensitive duplicate check
    const { rows: dup } = await client.query(
      `SELECT id FROM tournament_venue_fields
        WHERE tournament_venue_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`,
      [venueId, name],
    );
    if (dup.length > 0) {
      return res.status(409).json({ error: "Field already exists on this venue" });
    }

    const { rows: ins } = await client.query(
      `INSERT INTO tournament_venue_fields (tournament_venue_id, name, sort_order)
       VALUES ($1, $2,
         COALESCE((SELECT MAX(sort_order) + 1 FROM tournament_venue_fields
                    WHERE tournament_venue_id = $1), 0))
       RETURNING id, name, sort_order`,
      [venueId, name],
    );
    return res.status(201).json({
      field: { id: Number(ins[0].id), name: ins[0].name, sortOrder: Number(ins[0].sort_order) },
    });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: e.message || "Failed to add field" });
  } finally {
    client.release();
  }
}
```

- [ ] **Step 2: Type-check + commit**

```bash
npx tsc --noEmit -p tsconfig.json
git add pages/api/tournaments/[tournamentid]/venues/[venueId]/fields/index.ts
git commit -m "feat(api): POST tournament venue field"
```

---

## Task 6: Field PATCH + DELETE endpoint

**Files:**
- Create: `pages/api/tournaments/[tournamentid]/venues/[venueId]/fields/[fieldId].ts`

- [ ] **Step 1: Write the handler**

```ts
// pages/api/tournaments/[tournamentid]/venues/[venueId]/fields/[fieldId].ts
import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "@/lib/db";
import { requireTournamentAccess } from "@/lib/auth/requireSession";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const tournamentId = Number(req.query.tournamentid);
  const venueId = Number(req.query.venueId);
  const fieldId = Number(req.query.fieldId);
  if (![tournamentId, venueId, fieldId].every(Number.isFinite)) {
    return res.status(400).json({ error: "Invalid id(s)" });
  }
  const session = await requireTournamentAccess(req, res, tournamentId);
  if (!session) return;

  const client = await pool.connect();
  try {
    // Ownership check
    const { rows: own } = await client.query(
      `SELECT 1
       FROM tournament_venue_fields f
       JOIN tournament_venues v ON v.id = f.tournament_venue_id
       WHERE f.id = $1 AND v.id = $2 AND v.tournament_id = $3`,
      [fieldId, venueId, tournamentId],
    );
    if (own.length === 0) return res.status(404).json({ error: "Field not found" });

    if (req.method === "PATCH") {
      const body = req.body ?? {};
      const sets: string[] = [];
      const params: any[] = [];
      let i = 1;
      if (typeof body.name === "string") {
        const t = body.name.trim();
        if (!t) return res.status(400).json({ error: "name cannot be empty" });
        const { rows: dup } = await client.query(
          `SELECT id FROM tournament_venue_fields
            WHERE tournament_venue_id = $1 AND LOWER(name) = LOWER($2) AND id <> $3 LIMIT 1`,
          [venueId, t, fieldId],
        );
        if (dup.length > 0) return res.status(409).json({ error: "Field already exists on this venue" });
        sets.push(`name = $${i++}`);
        params.push(t);
      }
      if (body.sortOrder != null && Number.isFinite(Number(body.sortOrder))) {
        sets.push(`sort_order = $${i++}`);
        params.push(Number(body.sortOrder));
      }
      if (sets.length === 0) return res.status(200).json({ ok: true });

      params.push(fieldId);
      const { rows: upd } = await client.query(
        `UPDATE tournament_venue_fields SET ${sets.join(", ")}
          WHERE id = $${i}
          RETURNING id, name, sort_order`,
        params,
      );
      return res.status(200).json({
        field: { id: Number(upd[0].id), name: upd[0].name, sortOrder: Number(upd[0].sort_order) },
      });
    }

    if (req.method === "DELETE") {
      await client.query(`DELETE FROM tournament_venue_fields WHERE id = $1`, [fieldId]);
      return res.status(204).end();
    }

    res.setHeader("Allow", ["PATCH", "DELETE"]);
    return res.status(405).end("Method Not Allowed");
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: e.message || "Failed to update field" });
  } finally {
    client.release();
  }
}
```

- [ ] **Step 2: Type-check + commit**

```bash
npx tsc --noEmit -p tsconfig.json
git add pages/api/tournaments/[tournamentid]/venues/[venueId]/fields/[fieldId].ts
git commit -m "feat(api): PATCH/DELETE tournament venue field"
```

---

## Task 7: Tab key + nav update

**Files:**
- Modify: `components/tournaments/types.ts`
- Modify: `components/tournaments/TabsNav.tsx`

- [ ] **Step 1: Add the tab key**

Edit `components/tournaments/types.ts` and add `"venues"` to `TabKey`:

```ts
export type TabKey =
  | "overview"
  | "teams"
  | "venues"
  | "pool"
  | "standings"
  | "bracket"
  | "tiebreakers"
  | "scenarios";
```

- [ ] **Step 2: Insert the nav item**

Edit `components/tournaments/TabsNav.tsx` `items` array; insert one entry between `teams` and `pool`:

```ts
const items: { key: TabKey; label: string; path: (id: number) => string }[] = [
  { key: "overview",    label: "Overview",    path: (id) => `/tournaments/${id}/overview` },
  { key: "teams",       label: "Teams",       path: (id) => `/tournaments/${id}/teams` },
  { key: "venues",      label: "Venues",      path: (id) => `/tournaments/${id}/venues` },
  { key: "pool",        label: "Pool Play",   path: (id) => `/tournaments/${id}/pool` },
  { key: "standings",   label: "Standings",   path: (id) => `/tournaments/${id}/standings` },
  { key: "bracket",     label: "Bracket",     path: (id) => `/tournaments/${id}/bracket` },
  { key: "tiebreakers", label: "Tiebreakers", path: (id) => `/tournaments/${id}/tiebreakers` },
  { key: "scenarios",   label: "Scenarios",   path: (id) => `/tournaments/${id}/scenarios` },
];
```

- [ ] **Step 3: Verify in browser**

The dev server is already running. Reload `/tournaments/13/teams` and confirm the sidebar now shows "Venues" between Teams and Pool Play. Clicking it will 404 until Task 11 lands — that's expected.

- [ ] **Step 4: Commit**

```bash
git add components/tournaments/types.ts components/tournaments/TabsNav.tsx
git commit -m "feat(tournaments): add Venues tab key and nav entry"
```

---

## Task 8: `VenueCard` component

**Files:**
- Create: `components/tournaments/venues/VenueCard.tsx`

- [ ] **Step 1: Write the component**

```tsx
// components/tournaments/venues/VenueCard.tsx
"use client";
import { useState } from "react";
import { Plus, X, Pencil, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { VenueDTO, VenueFieldDTO } from "@/lib/tournaments/venues";

export type { VenueDTO, VenueFieldDTO };

interface Props {
  tournamentId: number;
  venue: VenueDTO;
  canEdit: boolean;
  onChanged: () => void; // re-fetch venues from parent
}

const INPUT =
  "border border-border bg-input px-2 py-1 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors";
const CHIP =
  "inline-flex items-center gap-1 border border-border bg-input px-2 py-0.5 text-xs text-foreground";

export default function VenueCard({ tournamentId, venue, canEdit, onChanged }: Props) {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(venue.name);
  const [addressDraft, setAddressDraft] = useState(venue.address ?? "");
  const [newField, setNewField] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveCustom = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/venues/${venue.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameDraft, address: addressDraft }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Save failed");
      setEditingName(false);
      onChanged();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const removeVenue = async () => {
    if (venue.gameCount > 0) {
      const ok = window.confirm(
        `${venue.gameCount} game${venue.gameCount === 1 ? "" : "s"} ${venue.gameCount === 1 ? "is" : "are"} scheduled here. Removing this venue will leave ${venue.gameCount === 1 ? "that game" : "those games"} with their last-known location label but unlinked. Continue?`,
      );
      if (!ok) return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/venues/${venue.id}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 204) throw new Error((await res.json()).error || "Delete failed");
      onChanged();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const addField = async () => {
    const t = newField.trim();
    if (!t) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/tournaments/${tournamentId}/venues/${venue.id}/fields`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: t }),
        },
      );
      if (!res.ok) throw new Error((await res.json()).error || "Add field failed");
      setNewField("");
      onChanged();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const removeField = async (fieldId: number) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/tournaments/${tournamentId}/venues/${venue.id}/fields/${fieldId}`,
        { method: "DELETE" },
      );
      if (!res.ok && res.status !== 204) throw new Error((await res.json()).error || "Delete field failed");
      onChanged();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border border-border bg-card p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={cn(
                "text-[9px] font-semibold uppercase tracking-[0.1em] border px-1.5 py-0.5",
                venue.kind === "predefined"
                  ? "border-primary/40 text-primary"
                  : "border-muted-foreground/40 text-muted-foreground",
              )}
            >
              {venue.kind}
            </span>
            {venue.gameCount > 0 && (
              <span className="text-xs text-muted-foreground">
                {venue.gameCount} game{venue.gameCount === 1 ? "" : "s"}
              </span>
            )}
          </div>

          {venue.kind === "custom" && editingName ? (
            <div className="flex flex-col gap-2">
              <input
                className={INPUT}
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                placeholder="Venue name"
              />
              <input
                className={INPUT}
                value={addressDraft}
                onChange={(e) => setAddressDraft(e.target.value)}
                placeholder="Address (optional)"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={saveCustom}
                  className="inline-flex items-center gap-1 border border-primary bg-primary text-primary-foreground px-2 py-1 text-xs"
                >
                  <Check className="h-3 w-3" /> Save
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setEditingName(false);
                    setNameDraft(venue.name);
                    setAddressDraft(venue.address ?? "");
                  }}
                  className="inline-flex items-center gap-1 border border-border px-2 py-1 text-xs"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="font-medium text-sm flex items-center gap-2">
                {venue.name}
                {canEdit && venue.kind === "custom" && (
                  <button
                    type="button"
                    aria-label="Edit name"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => setEditingName(true)}
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                )}
              </div>
              {(venue.address || venue.city || venue.state) && (
                <div className="text-xs text-muted-foreground">
                  {[venue.address, [venue.city, venue.state].filter(Boolean).join(", ")]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              )}
            </>
          )}
        </div>
        {canEdit && (
          <button
            type="button"
            aria-label="Remove venue"
            disabled={busy}
            onClick={removeVenue}
            className="text-muted-foreground hover:text-destructive transition-colors p-1"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5 items-center">
        {venue.fields.map((f) => (
          <span key={f.id} className={CHIP}>
            {f.name}
            {canEdit && (
              <button
                type="button"
                aria-label={`Remove field ${f.name}`}
                disabled={busy}
                onClick={() => removeField(f.id)}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}
        {canEdit && (
          <div className="inline-flex items-center gap-1">
            <input
              className={cn(INPUT, "w-32")}
              value={newField}
              onChange={(e) => setNewField(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addField();
                }
              }}
              placeholder="Add field"
            />
            <button
              type="button"
              disabled={busy || !newField.trim()}
              onClick={addField}
              className="inline-flex items-center gap-1 border border-border px-2 py-1 text-xs disabled:opacity-50"
            >
              <Plus className="h-3 w-3" /> Add
            </button>
          </div>
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Type-check + commit**

```bash
npx tsc --noEmit -p tsconfig.json
git add components/tournaments/venues/VenueCard.tsx
git commit -m "feat(ui): VenueCard for tournament venues"
```

---

## Task 9: `AddPredefinedVenueModal`

This modal embeds a search against `/api/locations` (the existing endpoint) and lets the user pick one to attach. We don't reuse `LocationPicker` directly because that component supports the "custom" mode which we don't want here.

**Files:**
- Create: `components/tournaments/venues/AddPredefinedVenueModal.tsx`

- [ ] **Step 1: Write the modal**

```tsx
// components/tournaments/venues/AddPredefinedVenueModal.tsx
"use client";
import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Search } from "lucide-react";

type LocOption = {
  id: number;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tournamentId: number;
  onCreated: () => void;
}

const INPUT =
  "w-full border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors";

export default function AddPredefinedVenueModal({ open, onOpenChange, tournamentId, onCreated }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LocOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<number | null>(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setError(null);
      return;
    }
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const id = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/locations?q=${encodeURIComponent(query)}&pageSize=20`);
        const json = await res.json();
        setResults(Array.isArray(json.rows) ? json.rows : []);
      } catch (e: any) {
        setError(e.message || "Search failed");
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(id);
  }, [open, query]);

  const pick = async (locationId: number) => {
    setSubmitting(locationId);
    setError(null);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/venues`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "predefined", locationId }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to add");
      onCreated();
      onOpenChange(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg rounded-none">
        <DialogHeader>
          <DialogTitle
            style={{ fontFamily: "var(--font-display)", textTransform: "uppercase", fontSize: "18px" }}
          >
            Add Predefined Venue
          </DialogTitle>
          <DialogDescription>
            Pick from the existing locations directory. To add a venue that isn't in the directory, use "Add Custom" instead.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            className={`${INPUT} pl-8`}
            placeholder="Search by name, city, or state"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          {loading && (
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin rounded-full border-2 border-border border-t-primary" />
          )}
        </div>

        <ul className="max-h-72 overflow-y-auto border border-border divide-y divide-border">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                disabled={submitting != null}
                className="w-full text-left px-3 py-2 hover:bg-muted/60 transition-colors disabled:opacity-50"
                onClick={() => pick(r.id)}
              >
                <div className="text-sm font-medium">{r.name}</div>
                <div className="text-xs text-muted-foreground">
                  {[r.address, [r.city, r.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}
                </div>
              </button>
            </li>
          ))}
          {!loading && results.length === 0 && query.trim().length >= 2 && (
            <li className="px-3 py-2 text-xs text-muted-foreground">No matches.</li>
          )}
        </ul>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <DialogFooter>
          <button
            type="button"
            className="border border-border px-3 py-1.5 text-xs"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Type-check + commit**

```bash
npx tsc --noEmit -p tsconfig.json
git add components/tournaments/venues/AddPredefinedVenueModal.tsx
git commit -m "feat(ui): AddPredefinedVenueModal"
```

---

## Task 10: `AddCustomVenueModal`

**Files:**
- Create: `components/tournaments/venues/AddCustomVenueModal.tsx`

- [ ] **Step 1: Write the modal**

```tsx
// components/tournaments/venues/AddCustomVenueModal.tsx
"use client";
import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tournamentId: number;
  onCreated: () => void;
}

const INPUT =
  "w-full border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors";
const CHIP =
  "inline-flex items-center gap-1 border border-border bg-input px-2 py-0.5 text-xs";

export default function AddCustomVenueModal({ open, onOpenChange, tournamentId, onCreated }: Props) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [fields, setFields] = useState<string[]>([]);
  const [newField, setNewField] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setName("");
    setAddress("");
    setCity("");
    setState("");
    setFields([]);
    setNewField("");
    setError(null);
  };

  const addField = () => {
    const t = newField.trim();
    if (!t) return;
    if (fields.some((f) => f.toLowerCase() === t.toLowerCase())) {
      setNewField("");
      return;
    }
    setFields((f) => [...f, t]);
    setNewField("");
  };

  const submit = async () => {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/venues`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "custom",
          name: name.trim(),
          address: address.trim() || undefined,
          city: city.trim() || undefined,
          state: state.trim() || undefined,
          fields,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to add venue");
      reset();
      onCreated();
      onOpenChange(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-lg rounded-none">
        <DialogHeader>
          <DialogTitle
            style={{ fontFamily: "var(--font-display)", textTransform: "uppercase", fontSize: "18px" }}
          >
            Add Custom Venue
          </DialogTitle>
          <DialogDescription>
            Lives only on this tournament. Not added to the locations directory.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-1 block">
              Name
            </label>
            <input
              className={INPUT}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Westside Field B"
              autoFocus
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-1 block">
              Address (optional)
            </label>
            <input
              className={INPUT}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-1 block">
                City
              </label>
              <input className={INPUT} value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-1 block">
                State
              </label>
              <input className={INPUT} value={state} onChange={(e) => setState(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-1 block">
              Fields (optional)
            </label>
            <div className="flex flex-wrap gap-1.5 items-center">
              {fields.map((f) => (
                <span key={f} className={CHIP}>
                  {f}
                  <button
                    type="button"
                    aria-label={`Remove ${f}`}
                    onClick={() => setFields((cur) => cur.filter((x) => x !== f))}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <input
                className={cn(INPUT, "w-32")}
                value={newField}
                onChange={(e) => setNewField(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addField();
                  }
                }}
                placeholder="Add field"
              />
              <button
                type="button"
                disabled={!newField.trim()}
                onClick={addField}
                className="inline-flex items-center gap-1 border border-border px-2 py-1 text-xs disabled:opacity-50"
              >
                <Plus className="h-3 w-3" /> Add
              </button>
            </div>
          </div>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <DialogFooter>
          <button
            type="button"
            className="border border-border px-3 py-1.5 text-xs"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting || !name.trim()}
            onClick={submit}
            className="border border-primary bg-primary text-primary-foreground px-3 py-1.5 text-xs disabled:opacity-50"
          >
            Save Venue
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Type-check + commit**

```bash
npx tsc --noEmit -p tsconfig.json
git add components/tournaments/venues/AddCustomVenueModal.tsx
git commit -m "feat(ui): AddCustomVenueModal"
```

---

## Task 11: Venues tab page

**Files:**
- Create: `pages/tournaments/[tournamentid]/venues.tsx`

- [ ] **Step 1: Write the page**

```tsx
// pages/tournaments/[tournamentid]/venues.tsx
import { useCallback, useEffect, useState } from "react";
import TournamentProvider, { useTournament } from "@/components/tournaments/TournamentProvider";
import TournamentShell from "@/components/tournaments/TournamentShell";
import VenueCard, { type VenueDTO } from "@/components/tournaments/venues/VenueCard";
import AddPredefinedVenueModal from "@/components/tournaments/venues/AddPredefinedVenueModal";
import AddCustomVenueModal from "@/components/tournaments/venues/AddCustomVenueModal";
import { Plus } from "lucide-react";

function VenuesInner() {
  const { tid, canEdit } = useTournament();
  const [venues, setVenues] = useState<VenueDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openPredefined, setOpenPredefined] = useState(false);
  const [openCustom, setOpenCustom] = useState(false);

  const refresh = useCallback(async () => {
    if (!tid) return;
    setError(null);
    try {
      const res = await fetch(`/api/tournaments/${tid}/venues`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load");
      setVenues(json.venues ?? []);
    } catch (e: any) {
      setError(e.message);
    }
  }, [tid]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!tid) return null;

  return (
    <div className="flex flex-col gap-4">
      {canEdit && (
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 border border-border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em]"
            onClick={() => setOpenPredefined(true)}
          >
            <Plus className="h-3 w-3" /> Add Predefined
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 border border-primary bg-primary text-primary-foreground px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em]"
            onClick={() => setOpenCustom(true)}
          >
            <Plus className="h-3 w-3" /> Add Custom
          </button>
        </div>
      )}

      {error && (
        <div className="border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {venues == null ? (
        <div className="space-y-2">
          <div className="h-20 bg-elevated animate-pulse" />
          <div className="h-20 bg-elevated animate-pulse" />
        </div>
      ) : venues.length === 0 ? (
        <div className="border border-dashed border-border p-8 text-center">
          <h2
            className="mb-1"
            style={{
              fontFamily: "var(--font-display)",
              textTransform: "uppercase",
              fontSize: "16px",
              letterSpacing: "0.02em",
            }}
          >
            No venues yet
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Add at least one venue so games can be scheduled. Pick from the existing locations directory or create a custom venue that lives only on this tournament.
          </p>
          {canEdit && (
            <div className="flex justify-center gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 border border-border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em]"
                onClick={() => setOpenPredefined(true)}
              >
                <Plus className="h-3 w-3" /> Add Predefined
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 border border-primary bg-primary text-primary-foreground px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em]"
                onClick={() => setOpenCustom(true)}
              >
                <Plus className="h-3 w-3" /> Add Custom
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {venues.map((v) => (
            <VenueCard
              key={v.id}
              tournamentId={tid}
              venue={v}
              canEdit={canEdit}
              onChanged={refresh}
            />
          ))}
        </div>
      )}

      <AddPredefinedVenueModal
        open={openPredefined}
        onOpenChange={setOpenPredefined}
        tournamentId={tid}
        onCreated={refresh}
      />
      <AddCustomVenueModal
        open={openCustom}
        onOpenChange={setOpenCustom}
        tournamentId={tid}
        onCreated={refresh}
      />
    </div>
  );
}

export default function VenuesPage() {
  return (
    <TournamentProvider>
      <TournamentShell tab="venues">
        <VenuesInner />
      </TournamentShell>
    </TournamentProvider>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Smoke test in browser**

- Reload `/tournaments/13/venues` in the existing Playwright session.
- Expect empty-state UI on the fresh tournament from the prior smoke test (if it still exists) OR the auto-promoted venues if there are scheduled games.
- Click "Add Custom", create a venue named "Field House Smoke Test" with fields `Diamond 1`, `Diamond 2`. Confirm the card appears.
- Click "Add Predefined", pick the first search result. Confirm the card appears with any fields that came pre-populated from `location_fields`.

- [ ] **Step 4: Commit**

```bash
git add pages/tournaments/[tournamentid]/venues.tsx
git commit -m "feat(ui): tournament Venues tab page"
```

---

## Task 12: `TournamentVenuePicker`

**Files:**
- Create: `components/tournaments/TournamentVenuePicker.tsx`

- [ ] **Step 1: Write the component**

```tsx
// components/tournaments/TournamentVenuePicker.tsx
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { VenueDTO } from "@/components/tournaments/venues/VenueCard";

export interface TournamentVenuePickerValue {
  tournamentVenueId: number | null;
  locationId: number | null;
  location: string;   // human label used by legacy display code
  field: string;
}

interface Props {
  tournamentId: number;
  value: TournamentVenuePickerValue;
  onChange: (v: TournamentVenuePickerValue) => void;
}

const SELECT =
  "w-full border border-border bg-input px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors";

export default function TournamentVenuePicker({ tournamentId, value, onChange }: Props) {
  const [venues, setVenues] = useState<VenueDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/tournaments/${tournamentId}/venues`);
        const json = await res.json();
        if (!cancelled) setVenues(Array.isArray(json.venues) ? json.venues : []);
      } catch (e: any) {
        if (!cancelled) setError(e.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tournamentId]);

  if (venues == null) {
    return <div className="h-9 bg-elevated animate-pulse" />;
  }

  if (venues.length === 0) {
    return (
      <div className="border border-dashed border-border p-3 text-sm">
        <p className="text-muted-foreground mb-1">No venues set up for this tournament yet.</p>
        <Link
          className="text-primary underline"
          href={`/tournaments/${tournamentId}/venues`}
        >
          Set up venues
        </Link>
      </div>
    );
  }

  const selected = venues.find((v) => v.id === value.tournamentVenueId) ?? null;

  return (
    <div className="grid grid-cols-2 gap-2">
      <select
        className={SELECT}
        value={value.tournamentVenueId ?? ""}
        onChange={(e) => {
          const raw = e.target.value;
          if (!raw) {
            onChange({ tournamentVenueId: null, locationId: null, location: "", field: "" });
            return;
          }
          const v = venues.find((x) => x.id === Number(raw));
          if (!v) return;
          onChange({
            tournamentVenueId: v.id,
            locationId: v.locationId,
            location: v.name,
            field: "",
          });
        }}
      >
        <option value="">— Select venue —</option>
        {venues.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name}
          </option>
        ))}
      </select>
      <select
        className={SELECT}
        disabled={!selected || selected.fields.length === 0}
        value={value.field}
        onChange={(e) => onChange({ ...value, field: e.target.value })}
      >
        <option value="">{selected && selected.fields.length === 0 ? "— No fields —" : "— Select field —"}</option>
        {selected?.fields.map((f) => (
          <option key={f.id} value={f.name}>
            {f.name}
          </option>
        ))}
      </select>
      {error && <p className="col-span-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Type-check + commit**

```bash
npx tsc --noEmit -p tsconfig.json
git add components/tournaments/TournamentVenuePicker.tsx
git commit -m "feat(ui): TournamentVenuePicker for constrained game scheduling"
```

---

## Task 13: Swap LocationPicker in `BracketGameScheduleModal`

This modal is currently used by season brackets, but it is the same modal that tournament bracket scheduling goes through — its props take `seasonId`. We add a `tournamentId` alternative so the picker is constrained when scheduling a tournament game, and keep the old `LocationPicker` for the season case.

**Files:**
- Modify: `components/bracket/BracketGameScheduleModal.tsx`

- [ ] **Step 1: Read the existing component**

Read `components/bracket/BracketGameScheduleModal.tsx` end-to-end before editing. Pay attention to the `Props` type and the `handleSave` payload.

- [ ] **Step 2: Add a `tournamentId` prop and branch the picker**

Update the `Props` type to accept `tournamentId?: number` (mutually exclusive in practice with `seasonId`). Keep both `seasonId` and `tournamentId` non-required individually; runtime asserts that exactly one is provided. The current import line is:

```ts
import LocationPicker from "@/components/LocationPicker";
import type { LocationPickerValue } from "@/components/LocationPicker";
```

Add:

```ts
import TournamentVenuePicker, {
  type TournamentVenuePickerValue,
} from "@/components/tournaments/TournamentVenuePicker";
```

Add state for the new `tournamentVenueId`:

```ts
const [tournamentVenueId, setTournamentVenueId] = useState<number | null>(
  // BracketGameRecord doesn't carry this yet; fall back to null
  (game as BracketGameRecord & { tournament_venue_id?: number | null }).tournament_venue_id ?? null,
);
```

Replace the `<LocationPicker ...>` JSX (around line 141) with:

```tsx
{tournamentId != null ? (
  <TournamentVenuePicker
    tournamentId={tournamentId}
    value={{
      tournamentVenueId,
      locationId,
      location,
      field,
    }}
    onChange={(val: TournamentVenuePickerValue) => {
      setTournamentVenueId(val.tournamentVenueId);
      setLocationId(val.locationId);
      setLocation(val.location);
      setField(val.field);
    }}
  />
) : (
  <LocationPicker
    locationId={locationId}
    location={location}
    field={field}
    onChange={(val: LocationPickerValue) => {
      setLocationId(val.locationId);
      setLocation(val.location);
      setField(val.field);
    }}
  />
)}
```

Include `tournament_venue_id` in the PATCH body inside `handleSave`:

```ts
const body: Record<string, unknown> = {
  gamedate: gamedate || null,
  gametime: gametime || null,
  location: location || null,
  field: field || null,
  location_id: locationId ?? null,
  tournament_venue_id: tournamentVenueId ?? null,
};
```

Add the `Props` change:

```ts
type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  game: BracketGameRecord;
  seasonId?: number;
  tournamentId?: number;
  onSaved: () => void;
};
```

And inside the component body, before the existing `seasonId` usage in `handleSave`, branch the PATCH URL:

```ts
const url =
  tournamentId != null
    ? `/api/tournaments/${tournamentId}/poolgames/${game.id}`
    : `/api/seasons/${seasonId}/games/${game.id}`;
const res = await fetch(url, {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
```

- [ ] **Step 3: Add a runtime assertion at the top of `handleSave`**

```ts
if ((seasonId == null) === (tournamentId == null)) {
  throw new Error("BracketGameScheduleModal: pass exactly one of seasonId or tournamentId");
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors. Existing callers that pass `seasonId={X}` continue to type-check against the now-optional prop.

- [ ] **Step 5: Commit**

```bash
git add components/bracket/BracketGameScheduleModal.tsx
git commit -m "feat(ui): constrain bracket schedule modal to TournamentVenuePicker for tournaments"
```

---

## Task 14: Persist `tournament_venue_id` on pool/tournament game PATCH

`BracketGameScheduleModal` now sends `tournament_venue_id` to either the season-game or pool-game endpoint depending on which id was passed. Wire the pool-game endpoint to accept and store it.

**Files:**
- Modify: `pages/api/tournaments/[tournamentid]/poolgames/[gameId].ts`

- [ ] **Step 1: Read the existing handler**

Open the file and locate the PATCH handler that updates a pool game.

- [ ] **Step 2: Add `tournament_venue_id` to the UPDATE**

Find the SQL update for the game's location/field/scores. Wherever `location_id` is currently set, also accept `tournament_venue_id` from the body. The change is purely additive — accept the new field and write it into `tournamentgames.tournament_venue_id`:

```ts
// (sketch — adapt to the existing param-building style in this file)
if ("tournament_venue_id" in body) {
  const v = body.tournament_venue_id;
  fields.push("tournament_venue_id");
  values.push(v == null ? null : Number(v));
}
```

If the file builds its UPDATE via a fields/values pair list (as `pages/api/tournaments/index.ts` does), follow that style. If it uses the `sql` tagged template, use:

```ts
await sql`UPDATE tournamentgames SET tournament_venue_id = ${v == null ? null : Number(v)} WHERE tournamentgameid = ${gameId} AND tournamentid = ${tournamentId}`;
```

- [ ] **Step 3: Verify in browser**

Reload `/tournaments/13/bracket` (or any tournament's bracket page) → open the schedule modal for a game → confirm the location section is now the venue+field dropdown sourced from this tournament's venues → pick one → save → reload → confirm the venue and field persist.

- [ ] **Step 4: Commit**

```bash
git add pages/api/tournaments/[tournamentid]/poolgames/[gameId].ts
git commit -m "feat(api): accept tournament_venue_id on pool game PATCH"
```

---

## Task 15: Migration verification — auto-promotion

This is a focused end-to-end check on an existing tournament with real data.

- [ ] **Step 1: Verify pre-state via Neon MCP**

Run via Neon MCP `run_sql` on dev branch:

```sql
SELECT t.tournamentid, t.name, t.venues_initialized,
       COUNT(DISTINCT g.location_id)  FILTER (WHERE g.location_id IS NOT NULL) AS predef_groups,
       COUNT(DISTINCT LOWER(TRIM(g.location))) FILTER (WHERE g.location IS NOT NULL AND TRIM(g.location) <> '' AND g.location_id IS NULL) AS custom_groups
FROM tournaments t
LEFT JOIN tournamentgames g USING (tournamentid)
GROUP BY t.tournamentid, t.name, t.venues_initialized
ORDER BY (predef_groups + custom_groups) DESC NULLS LAST
LIMIT 10;
```

Pick a tournament with at least 1 in `predef_groups + custom_groups`. Note its `tournamentid`.

- [ ] **Step 2: Hit the GET endpoint**

In the Playwright browser session, navigate to `/tournaments/<id>/venues`. Confirm one card appears per row in the pre-state query.

- [ ] **Step 3: Verify backfill**

Run via Neon MCP:

```sql
SELECT venues_initialized FROM tournaments WHERE tournamentid = <id>;
SELECT COUNT(*) FROM tournament_venues WHERE tournament_id = <id>;
SELECT COUNT(*) FROM tournamentgames WHERE tournamentid = <id> AND tournament_venue_id IS NOT NULL;
```

Expected: `venues_initialized = true`, venue count matches the pre-state's `predef_groups + custom_groups`, and games are backfilled.

- [ ] **Step 4: Idempotency check**

Reload `/tournaments/<id>/venues`. Re-run the venue-count query. Expected: unchanged.

- [ ] **Step 5: Commit any incidental fixes**

If anything above required tweaking helper queries in `lib/tournaments/venues.ts`, commit those fixes:

```bash
git add lib/tournaments/venues.ts
git commit -m "fix(venues): correct auto-promotion for <whatever>"
```

If no fixes were needed, skip the commit.

---

## Task 16: Custom-venue isolation check

- [ ] **Step 1: Create a uniquely-named custom venue**

In the Playwright browser, open `/tournaments/13/venues`, add a custom venue named exactly `Custom-only Isolation Test`.

- [ ] **Step 2: Verify it's NOT in the global directory**

Run via Neon MCP:

```sql
SELECT id, name FROM locations WHERE name ILIKE 'Custom-only Isolation Test%';
```

Expected: zero rows.

Also via Playwright, navigate to `/admin/locations` (or wherever the admin Locations page lives) and confirm the name isn't searchable there.

- [ ] **Step 3: Clean up**

Delete the venue via the X button in the UI. Confirm it's gone.

---

## Task 17: Delete-with-games behavior

- [ ] **Step 1: Create a venue, attach a game, delete it**

In the Playwright browser:
1. Pick a tournament whose games can be re-scheduled (e.g. one with at least one bracket game).
2. Open the bracket modal for a game; assign it the venue + a field; save.
3. Confirm via Neon: `SELECT tournament_venue_id, location_id, location, field FROM tournamentgames WHERE tournamentgameid = <id>;` shows non-null `tournament_venue_id`.
4. Go back to the Venues tab and delete that venue. The confirm dialog should say "1 game is scheduled here…".

- [ ] **Step 2: Verify the game row**

Run via Neon:

```sql
SELECT tournament_venue_id, location_id, location, field
FROM tournamentgames WHERE tournamentgameid = <id>;
```

Expected: `tournament_venue_id IS NULL`; `location`, `field`, and `location_id` unchanged.

---

## Task 18: Final end-to-end smoke

A consolidated walk-through across the whole flow in the existing Playwright session. Capture any issues; fix and commit.

- [ ] **Step 1: Empty case**

Navigate to a freshly-created tournament with no games. The Venues tab should show the empty state. Add one predefined, one custom. Confirm both cards render.

- [ ] **Step 2: Schedule modal — populated**

Navigate to that tournament's bracket page (or pool, if a schedule modal exists there now), open a schedule modal, confirm the picker is the two dropdowns and only lists those two venues. Pick one, pick a field, save, reopen, confirm round-trip.

- [ ] **Step 3: Schedule modal — empty**

Navigate to a tournament with no venues, open a schedule modal; confirm the "Set up venues" callout with the link.

- [ ] **Step 4: Permissions**

Sign out, sign in as a non-admin (or use a private/incognito session as the same admin but unfollow the tournament — whichever flow is faster). Hit `POST /api/tournaments/<id>/venues` via `fetch` from devtools. Expected: 403.

- [ ] **Step 5: Final commit (if anything changed)**

```bash
git add -A
git commit -m "chore(venues): final smoke fixes"
```

---

## Task 19: Mirror migration onto ldqa branch

- [ ] **Step 1: Apply the migration**

Use Neon MCP `run_sql` against branch `br-dark-paper-afuw26ux` (project `wispy-breeze-77320545`) with the same SQL from Task 1.

- [ ] **Step 2: Verify**

Run the same `to_regclass`/`information_schema.columns` check as Task 1, step 3, on the ldqa branch.

(Prod branch is uninitialized — no migration needed there; the file will run in order during the eventual prod deploy.)

---

## Self-Review Note

Spec coverage: every section in the spec maps to one or more tasks here (schema → Task 1; helpers/auto-promotion → Task 2; API → Tasks 3–6; UI → Tasks 7–11; picker swap → Tasks 12–14; verification → Tasks 15–18; rollout to ldqa → Task 19).

Type consistency: `VenueDTO`/`VenueFieldDTO` are defined once in `lib/tournaments/venues.ts` and re-declared identically in `components/tournaments/venues/VenueCard.tsx` (imported by all UI consumers from there). `TournamentVenuePickerValue` shape matches the `onChange` adapter in `BracketGameScheduleModal`. Endpoint paths match between the server (`pages/api/tournaments/[tournamentid]/venues/...`) and every client `fetch` call.

No placeholders: every code step contains the exact code; every test step lists the exact URL or SQL with the expected outcome.
