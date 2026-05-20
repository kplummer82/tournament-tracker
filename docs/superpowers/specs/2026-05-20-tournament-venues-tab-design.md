# Tournament Venues Tab

**Date:** 2026-05-20
**Status:** Design approved; ready for implementation plan.

## Context

Today a tournament has a single main city (now backed by the Mapbox typeahead from the prior PR), but games can in practice be played across multiple venues — especially at larger events where many games must run concurrently. Schedulers currently pick a location for each game via the global [components/LocationPicker.tsx](components/LocationPicker.tsx), which searches the entire `locations` directory. That has two problems:

1. Nothing constrains scheduling to a tournament-relevant subset, so it's easy to mis-pick a park that has nothing to do with this event.
2. There is no way to record "we plan to use these N parks for this tournament" as a first-class concept — it only exists implicitly across already-scheduled games.

We're adding a **Venues tab** to each tournament, sitting between Teams and Pool Play, where an organizer defines the venues for this tournament. A venue is either a pointer to an existing row in the global `locations` directory (predefined) or a freeform name/address that lives only on this tournament (custom). Game scheduling then becomes a constrained pick: venue + field from this tournament's list, no global search.

Custom venues never write to the global `locations` directory — that table is curated separately by admins and is not allowed to grow via tournament editing.

## Scope

In scope:
- New "Venues" tab and page on each tournament.
- New tables `tournament_venues` and `tournament_venue_fields`.
- New column `tournamentgames.tournament_venue_id` (nullable FK).
- New tracking column `tournaments.venues_initialized boolean`.
- CRUD API for tournament venues and their fields.
- Replacement of the global LocationPicker in tournament-game scheduling modals with a constrained `TournamentVenuePicker` (venue + field dropdown).
- One-time auto-promotion of existing game locations into venues on the tournament's first venues-tab load.

Out of scope:
- Promoting a custom venue into a predefined `locations` row in-place (organizer can do this manually today via the admin Locations page, then re-add as predefined).
- Per-day venue availability or per-field time-slot conflict detection.
- Bulk import of venues.
- Modifying the season scheduling flow (`pages/seasons/[seasonid]/scheduling.tsx`) — seasons remain on the global LocationPicker.

## Data Model

```sql
CREATE TABLE tournament_venues (
  id               serial PRIMARY KEY,
  tournament_id    int NOT NULL REFERENCES tournaments(tournamentid) ON DELETE CASCADE,
  sort_order       int NOT NULL DEFAULT 0,

  -- Predefined: link to the global locations directory.
  location_id      int NULL REFERENCES locations(id) ON DELETE SET NULL,

  -- Custom: freeform that lives only on this tournament.
  custom_name      text NULL,
  custom_address   text NULL,
  custom_city      text NULL,
  custom_state     text NULL,

  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       int REFERENCES users(id),

  CONSTRAINT tournament_venues_kind_xor CHECK (
    (location_id IS NOT NULL AND custom_name IS NULL)
    OR
    (location_id IS NULL AND custom_name IS NOT NULL)
  ),
  CONSTRAINT tournament_venues_unique_predefined UNIQUE (tournament_id, location_id)
);

CREATE INDEX idx_tournament_venues_tid ON tournament_venues (tournament_id, sort_order);

CREATE TABLE tournament_venue_fields (
  id                    serial PRIMARY KEY,
  tournament_venue_id   int NOT NULL REFERENCES tournament_venues(id) ON DELETE CASCADE,
  name                  text NOT NULL,
  sort_order            int NOT NULL DEFAULT 0,
  CONSTRAINT tournament_venue_fields_unique_name
    UNIQUE (tournament_venue_id, name)  -- case-insensitive uniqueness enforced in API layer
);

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS venues_initialized boolean NOT NULL DEFAULT false;

ALTER TABLE tournamentgames
  ADD COLUMN IF NOT EXISTS tournament_venue_id int NULL
    REFERENCES tournament_venues(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tournamentgames_venue
  ON tournamentgames (tournament_venue_id);
```

Existing `tournamentgames.location_id`, `tournamentgames.location`, and `tournamentgames.field` columns stay. When a game is saved through the constrained picker, the API writes:

- `tournament_venue_id` always.
- `location_id` when the venue is predefined (mirrors the venue's `location_id`).
- `field` always (text of the chosen field name).
- `location` is left untouched for predefined venues, and is set to `custom_name` for custom venues (so existing display code keeps working).

When a tournament venue is deleted with games still attached, the FK's `ON DELETE SET NULL` clears `tournamentgames.tournament_venue_id` but `location_id`/`location`/`field` are not touched — the game keeps its last-known label until someone re-edits it.

## UI

### Tab placement
`TabKey` in [components/tournaments/types.ts](components/tournaments/types.ts) gains `"venues"`. The item list in [components/tournaments/TabsNav.tsx](components/tournaments/TabsNav.tsx) becomes:

```
Overview → Teams → Venues → Pool Play → Standings → Bracket → Tiebreakers → Scenarios
```

Both the desktop sidebar and the mobile horizontal strip get the new entry without further changes.

### Page: `pages/tournaments/[tournamentid]/venues.tsx`

- Wraps `TournamentShell` like the other tab pages do.
- Top action row: `+ Add Predefined` and `+ Add Custom` buttons (only rendered when `canEdit`).
- Body:
  - **Empty state** (no venues): centered callout explaining the tab plus the two add buttons.
  - **Venue list**: vertical stack of `VenueCard`s. Each card shows:
    - A `PREDEFINED` or `CUSTOM` badge.
    - Name (read-only for predefined; inline-editable for custom).
    - Address line (for predefined, from `locations`; for custom, from `custom_*` columns, inline-editable).
    - Chip row of fields with inline add/edit/remove (`+ Add field`).
    - Drag handle on the left for reordering; persists via `PATCH .../venues/:id { sort_order }`.
    - `✕ Remove` button on the right. If `game_count > 0`, opens a confirmation modal: *"N games are scheduled here. Removing this venue will leave those games with their last-known location label but unlinked. Continue?"*

### Modals

- **`AddPredefinedVenueModal`** — embeds [components/LocationPicker.tsx](components/LocationPicker.tsx) restricted to `searching` mode only (no custom freeform inside this modal — custom uses the separate modal). On select, calls `POST /api/tournaments/:id/venues { kind: "predefined", locationId }`; server pre-fills `tournament_venue_fields` from `location_fields` if any exist.
- **`AddCustomVenueModal`** — name (required), optional address/city/state, fields chip-editor. Submits `POST /api/tournaments/:id/venues { kind: "custom", name, address?, city?, state?, fields?: string[] }`.

### Constrained picker: `TournamentVenuePicker`

New component at `components/tournaments/TournamentVenuePicker.tsx`. Replaces `LocationPicker` in:

- [components/bracket/BracketGameScheduleModal.tsx](components/bracket/BracketGameScheduleModal.tsx)

`AddGameModal` does not capture a location today and there is currently no separate pool-game schedule modal — so for this PR the constrained picker lands only in `BracketGameScheduleModal`. The `tournament_venue_id` column is in place from day one, however, so a future pool schedule modal can adopt `TournamentVenuePicker` without further schema work.

Behavior:
- Two-step dropdowns: venue, then field (field dropdown disabled until a venue is chosen, and shows the picked venue's fields only).
- Data source: `GET /api/tournaments/:id/venues` cached with SWR keyed by tournament id.
- Empty state: when the tournament has zero venues, both dropdowns are replaced with a "Set up venues first" callout and a link to `/tournaments/:id/venues`.
- On change, calls `onChange({ tournamentVenueId, locationId, location, field })` so the parent modal writes all the snapshot fields the existing schema expects.

## API Routes

All under `pages/api/tournaments/[tournamentid]/venues/`. All mutating routes require the caller to have `tournament_admin` on the tournament (matching how `/api/tournaments/:id/teams` is gated today).

```
GET    /api/tournaments/:id/venues
  → { venues: [{ id, kind: "predefined" | "custom", locationId|null, name, address|null,
                 city|null, state|null, sortOrder, gameCount, fields: [{ id, name, sortOrder }] }] }
  → On first call when tournaments.venues_initialized = false, runs the auto-promotion
    transaction described below, then sets venues_initialized = true and returns.

POST   /api/tournaments/:id/venues
  Body: { kind: "predefined", locationId }
        | { kind: "custom", name, address?, city?, state?, fields?: string[] }
  → 201 with the new venue row (incl. fields).
  → 409 if predefined and the tournament already has that locationId.

PATCH  /api/tournaments/:id/venues/:venueId
  Body: { name?, address?, city?, state?, sortOrder? }
  → 200. name/address/city/state only honored on custom venues; sortOrder honored on both.

DELETE /api/tournaments/:id/venues/:venueId
  → 204. FK CASCADE removes the venue's fields and ON DELETE SET NULL nulls
    tournamentgames.tournament_venue_id; legacy snapshot columns untouched.

POST   /api/tournaments/:id/venues/:venueId/fields
  Body: { name }
  → 201. Case-insensitive uniqueness within the venue enforced at the API layer
    in addition to the table's unique constraint.

PATCH  /api/tournaments/:id/venues/:venueId/fields/:fieldId
  Body: { name?, sortOrder? }

DELETE /api/tournaments/:id/venues/:venueId/fields/:fieldId
  → 204. Games whose tournament_venue_id matches this venue and whose field text
    equals the removed name keep that text (no cascade clear); display unchanged.
```

## Auto-Promotion (first venues-tab load on a legacy tournament)

Server-side, inside the `GET /api/tournaments/:id/venues` handler. Runs once per tournament, gated by `tournaments.venues_initialized`.

```text
BEGIN
SELECT venues_initialized FROM tournaments WHERE tournamentid = $1 FOR UPDATE;
IF venues_initialized = true: COMMIT and proceed to normal SELECT.
ELSE:
  -- Group existing games into venue keys
  -- For each game in tournamentgames where tournamentid = $1:
  --   key = ("predefined", location_id)  when location_id IS NOT NULL
  --       | ("custom",     lower(trim(location)))  when location is non-empty
  --       | null  otherwise (skip)
  -- For each distinct non-null key:
  --   INSERT INTO tournament_venues (...) RETURNING id
  --   For each distinct non-empty `field` text among games with that key:
  --     INSERT INTO tournament_venue_fields (tournament_venue_id, name, sort_order)
  --   UPDATE tournamentgames
  --     SET tournament_venue_id = <new_venue_id>
  --     WHERE tournamentid = $1 AND <same key match>
  UPDATE tournaments SET venues_initialized = true WHERE tournamentid = $1;
COMMIT
```

Notes:
- The `FOR UPDATE` on the tournaments row serializes concurrent first-loads.
- Free-text `location` strings are *not* matched against `locations.name`. They become custom venues even if the global directory happens to have a row by that name — avoids surprise mutation of pre-existing data.
- The flag is set even when there are zero games to promote, so we don't re-scan on every subsequent GET.
- Manual deletion of all auto-created venues will *not* re-trigger the migration; the flag is sticky.

## Permissions

- `GET /api/tournaments/:id/venues` and `TournamentVenuePicker` reads are available to anyone who can read the tournament (matches how teams/games are exposed).
- All mutations (POST/PATCH/DELETE on venues and fields) require `tournament_admin` role on the tournament, checked via the same `assignRole`-style guard used in `pages/api/tournaments/[tournamentid]/teams/...`.

## Verification

End-to-end smoke (Playwright on the local dev server, the same flow used during the prior city-typeahead work):

1. **Fresh case**: create a new tournament → Venues tab shows empty state → add one predefined venue with fields pre-populated from `location_fields`, add one custom venue with two typed fields → reorder via drag → confirm `GET /api/tournaments/:id/venues` reflects the new order.
2. **Schedule constraint**: open the bracket schedule modal for a game on the new tournament → confirm the venue+field dropdowns are the only location UI → save, reopen, verify round-trip.
3. **Empty-venues schedule**: on a tournament with no venues, open a schedule modal → confirm the empty-state callout and link.
4. **Auto-promotion**: pick an existing tournament (e.g. #11 with already-scheduled games) → open Venues tab → confirm auto-created venues with aggregated fields → reload → no duplicate inserts → spot-check via Neon SQL that `tournamentgames.tournament_venue_id` is populated and `tournaments.venues_initialized` is `true`.
5. **Delete venue with games**: remove a venue that has games → confirmation modal shows the count → after delete, verify games' `tournament_venue_id` is NULL while `location_id`/`location`/`field` remain.
6. **Custom-venue isolation**: create a custom venue named "Custom-only Test Park" → verify it does not appear in `GET /api/locations`.
7. **Permissions**: as a non-admin user, confirm POST/PATCH/DELETE return 403 and the tab is read-only.

Database checks (via Neon MCP on the dev branch):
- Insert a venue row with both `location_id` and `custom_name` set → expect CHECK violation.
- Delete a tournament → confirm `tournament_venues` and `tournament_venue_fields` rows cascade and games' `tournament_venue_id` is null.

Migration order: dev branch (`br-billowing-forest-aflgasia`) first, then ldqa (`br-dark-paper-afuw26ux`). Prod is uninitialized so the migration history replays in order during the eventual prod deploy.

## Files Touched (anticipated)

New:
- `database/migration_tournament_venues.sql`
- `pages/tournaments/[tournamentid]/venues.tsx`
- `components/tournaments/TournamentVenuePicker.tsx`
- `components/tournaments/venues/VenueCard.tsx`
- `components/tournaments/venues/AddPredefinedVenueModal.tsx`
- `components/tournaments/venues/AddCustomVenueModal.tsx`
- `pages/api/tournaments/[tournamentid]/venues/index.ts`
- `pages/api/tournaments/[tournamentid]/venues/[venueId]/index.ts`
- `pages/api/tournaments/[tournamentid]/venues/[venueId]/fields/index.ts`
- `pages/api/tournaments/[tournamentid]/venues/[venueId]/fields/[fieldId].ts`

Modified:
- `components/tournaments/types.ts` (add `"venues"` to `TabKey`)
- `components/tournaments/TabsNav.tsx` (insert "Venues" between Teams and Pool Play)
- `components/bracket/BracketGameScheduleModal.tsx` (swap LocationPicker for TournamentVenuePicker)
- `pages/api/tournaments/[tournamentid]/poolgames/[gameId].ts` (accept `tournament_venue_id`)
- Wherever the bracket modal's save endpoint lives — confirm it persists `tournament_venue_id` alongside the existing `location_id`/`location`/`field` writes
