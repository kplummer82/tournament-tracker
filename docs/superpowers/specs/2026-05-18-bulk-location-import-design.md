# Bulk Location Import — Design

**Date:** 2026-05-18
**Owner:** Kellan
**Status:** Draft for review

## Context

The `locations` and `location_fields` tables are currently populated one row at a time through the `/admin/locations` UI. To seed the database with real baseball/softball venues across CA/AZ/OR/NV (and to make future bulk additions easy for league commissioners), we need a CSV-based bulk import feature.

The user explicitly rejected direct SQL inserts for seeding. The bulk upload feature must exist first, then a separately-researched CSV draft is reviewed by the user, then imported through this UI.

The single-row create flow already handles USPS verification and Mapbox geocoding correctly — bulk import should reuse that logic, not reimplement it.

## Scope

**In scope:**
- CSV parser + validator (pure function, testable in isolation)
- New `POST /api/locations/bulk` endpoint with `preview` and `commit` modes
- `BulkImportLocationsModal` UI added to `/admin/locations`
- Dedupe by `(LOWER(name), LOWER(city), state)` against existing rows
- Per-row USPS + Mapbox calls on commit (same as single create)
- Per-row error reporting; failed rows do not abort the rest

**Out of scope:**
- The data collection itself (handled by a separate research subagent task, output is a CSV the user reviews)
- Schema changes (none needed — existing `UNIQUE(location_id, name)` on `location_fields` is enough)
- Editing existing locations via CSV
- Lat/lng or notes columns in the CSV (just the 6 columns below)

## CSV format

Header row required. Columns must appear in this order:

```
name,address,city,state,zip,fields
```

- `name` — required. Trimmed.
- `address` — optional. Street address.
- `city` — optional, but required if `address` is present (else USPS skip).
- `state` — required. 2-letter code, uppercased.
- `zip` — optional, 5 digits when present.
- `fields` — optional. Semicolon-separated list of field names. Whitespace around each name is trimmed. Empty entries dropped. Example: `Field 1;Field 2;Diamond A`.

Quoting follows standard CSV rules (commas inside quoted values are fine).

## Architecture

### New files

| Path | Responsibility |
|---|---|
| `lib/locations/parseBulkCsv.ts` | Pure CSV → typed rows + per-row validation errors. No I/O. |
| `lib/locations/importLocations.ts` | Shared insert logic. Takes one parsed row, runs USPS + Mapbox, inserts location + fields. Used by the bulk endpoint and (optionally later) the single-create endpoint. |
| `pages/api/locations/bulk.ts` | `POST` handler, admin-only. Modes: `preview` (no writes, returns dedupe report) and `commit` (writes + returns result). |
| `components/admin/BulkImportLocationsModal.tsx` | Modal with file picker, preview table (Ready / Duplicate / Invalid sections), and Confirm button. |

### Modified files

| Path | Change |
|---|---|
| `components/admin/AdminLocationsClient.tsx` | Add a "Bulk Import" button near the New Location form header. Wire it to the modal. On commit success, append imported rows to the existing `locations` state. |

### Reused (no changes)

- `lib/usps.ts` → `verifyAddress`
- `lib/mapbox/geocodeAddress.ts` → `geocodeAddress`
- `lib/auth/requireSession.ts` → `requireAdmin`
- DB schema (`locations`, `location_fields`)

## Data flow

```
Admin clicks "Bulk Import"
  → file picker → CSV chosen
  → browser reads file, parses with parseBulkCsv (client-side)
  → POST /api/locations/bulk?mode=preview with { rows: ParsedRow[] }
       server re-runs parseBulkCsv on stringified payload to defend against
       client tampering, then SELECTs existing locations and computes:
         - ready:      rows that pass validation + no dupe
         - duplicate:  rows that collide with an existing row (skipped on commit)
         - invalid:    rows with validation errors
  → modal shows preview table with three sections + "Confirm Import" button
  → admin clicks Confirm
  → POST /api/locations/bulk?mode=commit with the same payload
       server walks `ready` rows in order:
         - call importLocations.importOne(row)
         - importOne: USPS verify (if enabled+full address) → geocode → INSERT location → INSERT each field
         - if any single row throws, log it, mark as failed, continue
  → returns { imported: [...], skipped: [...], failed: [{row, error}] }
  → modal shows result; closing the modal refreshes the locations list
```

### Why two-step instead of one-shot rollback

USPS + Mapbox calls cost money/quota. Doing them once on commit (not on preview) keeps the preview free and fast. The preview is enough to catch the common mistakes (typos in state code, missing required columns, dupes against existing rows) before spending API calls.

A single-transaction rollback would mean one bad row kills 50 good rows after they've already been geocoded — wasteful and frustrating. Per-row best-effort with a failure report is the better tradeoff for a seeding tool.

## Dedupe rule

A row is a duplicate of an existing location when:

```sql
LOWER(TRIM(csv.name)) = LOWER(TRIM(locations.name))
AND LOWER(TRIM(COALESCE(csv.city, ''))) = LOWER(TRIM(COALESCE(locations.city, '')))
AND UPPER(TRIM(COALESCE(csv.state, ''))) = UPPER(TRIM(COALESCE(locations.state, '')))
```

Within the CSV itself, the same triple appearing twice is treated as the second row being a duplicate of the first.

## Validation rules (parseBulkCsv)

Per row, fail with a clear error message:
- `name` is empty or whitespace-only.
- `state` is missing, not exactly 2 letters, or not in a permissive A-Z check (we don't enforce US state membership — leaves room for other states later).
- `zip` is present but not 5 digits.
- `fields` contains duplicate names after trimming (case-insensitive).

Header validation:
- Missing required column → reject whole upload with "CSV missing column: X".
- Extra columns → ignored (warning surfaced in preview, not fatal).
- Empty file or only header → reject with "CSV contains no data rows".

## API contract

### `POST /api/locations/bulk?mode=preview`

Request body:
```ts
{ rows: Array<{ name, address, city, state, zip, fields }> }   // raw strings
```

Response 200:
```ts
{
  ready:     Array<{ row: ParsedRow; index: number }>;
  duplicate: Array<{ row: ParsedRow; index: number; existingId: number; existingName: string }>;
  invalid:   Array<{ row: ParsedRow; index: number; errors: string[] }>;
}
```

### `POST /api/locations/bulk?mode=commit`

Request body: same as preview.

Response 200:
```ts
{
  imported: Array<{ id: number; name: string; field_count: number }>;
  skipped:  Array<{ index: number; reason: "duplicate" | "invalid"; details: string }>;
  failed:   Array<{ index: number; row: ParsedRow; error: string }>;
}
```

Failure modes:
- 400 if body is malformed.
- 401/403 if not admin.
- 500 only for server-internal errors. Per-row USPS/Mapbox failures are not 500s — they appear in `failed`.

## UI details

**Trigger:** A small `Bulk Import` button styled like the existing admin buttons, placed in the top-right of the "New Location" form card.

**Modal layout:**
1. **Step 1 — Choose file**
   - File input (`.csv` only).
   - Inline CSV format help with a copy-paste example.
   - On file selection, parse + auto-submit to `?mode=preview`.

2. **Step 2 — Review preview**
   - Three collapsible sections: Ready (N), Duplicate (N), Invalid (N).
   - Each section lists rows with name/city/state and either the dupe target or the error.
   - Buttons: "Cancel" (closes), "Confirm Import (N)" (only enabled if `ready.length > 0`).

3. **Step 3 — Result**
   - Imported count, skipped count, failed count.
   - Expandable failure list with the error for each row.
   - "Close" button. On close, modal calls a callback that re-fetches `/api/locations` so the parent list is fresh (simpler than splicing state — keeps the parent and DB in sync, and field counts are already correct).

Errors during file parse (bad header, malformed CSV) show inline in step 1, never reach the server.

## Testing / verification

End-to-end manual test on the dev branch (`br-billowing-forest-aflgasia`):

1. Create a small CSV with 4 rows: one valid+new, one valid that duplicates an existing location, one with a bad state code, one with two fields.
2. Upload via the modal → preview should show exactly 1 ready, 1 duplicate, 1 invalid, 1 ready-with-fields.
3. Click Confirm → result shows 2 imported, 1 skipped (dupe), 1 skipped (invalid), 0 failed.
4. `/admin/locations` list refreshes; the two new rows appear with correct field counts and (if address provided) USPS badge.
5. Re-upload the same CSV → all 4 should now appear as duplicates; commit produces 0 imported.

Unit-test scope (in `lib/locations/parseBulkCsv.test.ts` if a test runner is present in the repo — TBD on first read of the codebase):
- Header validation: missing/extra/reordered columns.
- Per-row validation: each rule above.
- Fields parsing: semicolons, whitespace, empties, internal dupes.
- Quoting: commas inside quoted name fields.

If no test runner is configured for `lib/`, skip the unit tests and rely on manual E2E. (Project memory does not mention a unit test setup for `lib/` — this is a question for the implementation phase.)

## Risks / open questions

- **Mapbox / USPS rate limits.** A 60-row import means 120 outbound API calls in sequence. Should be fine for the seed batch but worth noting. If it becomes a problem later, the importer can batch with a small delay — out of scope for v1.
- **Partial commit on server crash.** If the Node process dies mid-commit, some rows will be inserted and some won't. Acceptable for v1: the dedupe rule means re-uploading the same CSV finishes the job.
- **Field-only updates not supported.** Re-uploading a CSV to add new fields to an existing location is intentionally not supported in v1 (the user picked "skip duplicates, report them"). If needed later, add `?mode=commit&allowFieldsMerge=true` as a separate feature.

## Critical files for implementation

- `pages/api/locations/index.ts` — pattern reference for USPS + Mapbox + insert.
- `components/admin/AdminLocationsClient.tsx` — pattern reference for modal/state, lines 47–146.
- `lib/usps.ts`, `lib/mapbox/geocodeAddress.ts` — reused as-is.
- `database/migration_locations.sql` — schema reference, no changes.
