# Signup Intent (Gap F2) — Design

**Date:** 2026-05-22
**Status:** Draft for review
**Author:** Kellan (with Claude)
**Umbrella:** [2026-05-21 Personas and Journeys](2026-05-21-personas-and-journeys-design.md), gap **F2**

## Context

Today `pages/sign-up.tsx` collects name + email + password and drops every new user on the marketing home page (or `/login?registered=1` if approval is required). The app has no idea why each person signed up — parent looking to follow a team, coach waiting to be added to one, league operator ready to create their first league. As a result, every persona gets the same generic home page with passive "Nothing here yet." empty states, and field testers will spend their first minute trying to figure out where to go.

This spec adds an intent picker to signup, persists the choice on `user_profiles`, and routes each persona to a page that lets them start their journey immediately. It also defines (but does not build) the URL contract that future invite links (umbrella gap X1) must conform to, so the two pieces fit together cleanly when X1 ships.

Stage timing was decided during brainstorming: intent comes **before** credentials (a two-stage form, one route, in-component state). The picker is replaced when an `?invite=<token>` query param is present and a future `/api/invites/peek` endpoint returns a valid payload — until X1 ships, that endpoint returns 404 and the param is silently ignored.

## Personas affected

All four personas defined in the umbrella spec see this flow. Their post-signup destinations differ; the picker is the same for everyone.

| Intent (picker) | Persona | Post-signup target (active) | Post-signup target (inactive) |
|---|---|---|---|
| `follower` — "I want to follow a team or league" | Follower | `/find` if it exists, fall back to `/tournaments` | `/login?registered=1` |
| `coach` — "I coach or manage a team" | Coach | `/welcome/coach` | `/welcome/coach` (banner shown) |
| `league_operator` — "I run a league" | League Operator | `/leagues/new` | `/welcome/pending` |
| `tournament_organizer` — "I'm running a tournament" | Tournament Organizer | `/tournaments/new` | `/welcome/pending` |
| `null` (older signup, or intent-write failed) | unknown | `/` | `/login?registered=1` |

## UX

### Two-stage signup

`pages/sign-up.tsx` becomes a two-stage component. The left branding panel stays unchanged.

**Stage 1 — intent picker.** Shown by default for cold signups. The right panel renders:

- Heading: "Create Account"
- Sub: "First, tell us what brings you here."
- Four large cards (vertical on mobile, 2×2 on desktop):
  - "I want to follow a team or league"
  - "I coach or manage a team"
  - "I run a league"
  - "I'm running a tournament"
- Below: "Already have an account? Sign in."

Each card sets `intent` in component state and advances to stage 2.

**Stage 2 — credentials.** Identical to today's form, with:

- A chip at the top reading "Signing up to **<verb phrase>**" (e.g. "follow a team"), with a "Change" link that resets to stage 1.
- The submit button's label varies by intent: "Sign up to follow your team", "Sign up to coach", "Sign up to run your league", "Sign up to run your tournament".
- Same handler, same fields, same validation as today.

### Invite link branch (contract defined; behavior stubbed)

When the URL carries `?invite=<token>`:

1. The component calls `GET /api/invites/peek?token=<token>` on mount.
2. If the response is 200 with a payload (see Data layer), skip stage 1; pre-fill `intent` from the payload, pre-fill the email (read-only if the payload includes it), and render stage 2 directly.
3. If the response is 404 (the F2-shipped stub returns this for every token), fall through to the normal stage-1 flow. The query param is silently ignored.
4. The "existing-user via invite link" branch is **out of scope for F2** — it requires the invite-acceptance endpoint that X1 will build. F2's redirect helper does not handle invite-derived role grants; it routes only by `signup_intent`.

## Data layer

### Migration

New file: `database/migration_user_profiles_signup_intent.sql`

```sql
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS signup_intent VARCHAR(20) NULL;
```

Allowed values are validated at the application layer (not via DB constraint) so future personas can be added without a migration:

```
'follower' | 'coach' | 'league_operator' | 'tournament_organizer'
```

Intent is deliberately distinct from `AppRole` in `lib/auth/permissions.ts`. Intent is what the user *said* at signup; role is what they have been *granted*. The two can diverge legitimately (a Coach signs up but is never assigned `team_manager`; a Follower is later promoted to `league_admin`).

### Write path

`pages/api/auth/[...path].ts` already intercepts signup responses and inserts a `user_profiles` row. Extend the interceptor to:

1. Parse `signup_intent` from the **original request body** (not the upstream response — Neon Auth doesn't echo custom fields).
2. Validate it against the allowed set; treat unknown values as `null`.
3. Include it in the INSERT alongside `status`.

The client (`pages/sign-up.tsx`) passes `signup_intent` as a custom field on `authClient.signUp.email({...})`. Neon Auth ignores custom fields it doesn't recognize; the proxy interceptor reads them on the way through.

If the intent write fails for any reason, the existing "don't break signup if profile creation fails" posture is preserved: the column stays NULL and the redirect helper falls through to `/`.

### Read path

New helper in `lib/auth/profile.ts` (create the file if it doesn't exist):

```ts
export async function getUserSignupIntent(userId: string): Promise<SignupIntent | null>;
```

Used by the post-signup redirect helper. Other consumers (the persona-aware home page X2, future analytics) will use the same helper.

Add a `SignupIntent` type alias next to `AppRole` in `lib/auth/permissions.ts`:

```ts
export type SignupIntent = 'follower' | 'coach' | 'league_operator' | 'tournament_organizer';
```

### Invite-peek contract (stubbed)

New endpoint: `GET /api/invites/peek?token=<token>`. For F2 it returns `404` for every token. The response shape it must support (defined here so X1 doesn't have to redesign it later):

```ts
type InvitePeekResponse = {
  intent: SignupIntent;
  email?: string;                              // pre-fills, read-only when present
  role?: AppRole;                              // for X1's grant-on-acceptance
  scope?: { type: ScopeType; id: number };
  invitedBy?: { name: string };
};
```

X1 will replace the stub with real token lookup and add the corresponding `POST /api/invites/accept` for the existing-user branch.

## Routing helper

New file: `lib/auth/postSignupRedirect.ts`. Pure function:

```ts
export function postSignupRedirect(
  intent: SignupIntent | null,
  status: 'active' | 'inactive',
  options?: { findPageExists?: boolean }
): string;
```

Returns the target URL per the table in the Personas section. The `findPageExists` flag exists so the helper degrades gracefully until F3 ships:

- F2 ship: `findPageExists` defaults to `false`, Follower lands on `/tournaments`.
- F3 ship: flip the default (or remove the flag entirely) and Follower lands on `/find`.

Called from `pages/sign-up.tsx` after `authClient.getSession()` confirms the new user is logged in.

## New pages

- **`pages/welcome/coach.tsx`** — small page. Copy: "Your account is created. A league operator needs to add you to a team before you can manage one. Share this email with them: **<user.email>**." Includes a secondary "Find a team to follow while you wait" link to F3 (`/find` or `/tournaments` fallback). When `status='inactive'`, prepend a banner: "Your account is awaiting approval before you can be added to a team."

- **`pages/welcome/pending.tsx`** — generic awaiting-approval page used by both operator personas when `status='inactive'`. Copy: "Thanks for signing up to run a <league|tournament>. Your account is awaiting approval. We'll email you when you're approved." The `<league|tournament>` variant is driven by reading `signup_intent` server-side via `getUserSignupIntent` in `getServerSideProps`.

No marketing flourishes, no role-explanation walls of text. Both pages are intentionally small.

## Files touched

**New:**
- `database/migration_user_profiles_signup_intent.sql`
- `lib/auth/postSignupRedirect.ts`
- `lib/auth/profile.ts` (if not already present; otherwise extend)
- `pages/welcome/coach.tsx`
- `pages/welcome/pending.tsx`
- `pages/api/invites/peek.ts` (stub returning 404)
- `pages/api/admin/users/[userId].ts` — DELETE handler for test cleanup (see Testing). Verify whether an existing route covers DELETE first; today `pages/api/admin/users/index.ts` is GET-only and `pages/api/admin/users/[userId]/{role,status}.ts` exist but no top-level delete.
- `tests/e2e/helpers/signup.ts`
- E2E spec file(s) per Testing section

**Modified:**
- `pages/sign-up.tsx` — two-stage rewrite
- `pages/api/auth/[...path].ts` — extend signup interceptor to write `signup_intent`
- `lib/auth/permissions.ts` — add `SignupIntent` type alias

**Not touched (deliberately):**
- `pages/leagues/new`, `pages/tournaments/new` — already work correctly for fresh creators (auto-assign admin role)
- `pages/login.tsx` — signup-intent only applies to new accounts
- `pages/index.tsx` — persona-aware home is X2's job

## Error handling

| Failure mode | Behavior |
|---|---|
| Signup succeeds, `signup_intent` INSERT fails | Existing posture preserved: log and continue. Column stays NULL; redirect helper returns `/`. |
| User reloads `/sign-up` mid-flow | Component state resets to stage 1. Acceptable — nothing was submitted yet. |
| Invalid `signup_intent` value reaches the proxy | Server validates against the allowed set; on mismatch, store `null` and proceed. |
| `?invite=<token>` present but peek returns 404 | Fall through to stage-1 cold-signup flow. Param silently ignored. |
| `?invite=<token>` present and peek 200 but intent missing/invalid in payload | Treat as 404: fall through to stage 1. (Defensive — F2 stub never hits this path, but X1 might.) |
| Approval mode on + operator intent | Redirect to `/welcome/pending` instead of `/leagues/new` or `/tournaments/new`. |

## Testing

The repo uses Playwright with pre-seeded fixture users (`admin@test.stackedbench.com`, `user@test.stackedbench.com`) and default `storageState: 'tests/auth-state.json'` — meaning most existing tests start already authenticated. There is no existing pattern for testing a fresh signup. F2 establishes that pattern.

### Approach

Real Neon Auth signups with throwaway emails per test. The whole point of F2 is the real signup form behavior, so a backdoor that bypasses the form gives no coverage of what we're testing.

### New test infrastructure

**`tests/e2e/helpers/signup.ts`** — exports:

- `generateTestEmail(intent: SignupIntent): string` — produces `e2e-${intent}-${Date.now()}-${randomSuffix}@test.stackedbench.com`.
- `signUpWithIntent(page, intent: SignupIntent): Promise<{ email, password, userId }>` — drives the UI: navigates `/sign-up`, clicks the intent card, fills credentials, submits, captures the resulting user id.
- `cleanupTestUser(adminPage, userId): Promise<void>` — calls `DELETE /api/admin/users/[userId]` using an admin-authenticated page. Used in `test.afterEach`.

**`DELETE /api/admin/users/[userId]`** — new handler. Auth-guarded behind Neon Auth `role='admin'` (matches the existing pattern in `pages/admin/roles.tsx`). Deletes from `user_profiles`, `user_roles`, `user_follows`, and the Neon Auth user (via the Neon Auth admin API, or direct SQL on `neon_auth."user"` if that's the established pattern — verify during implementation by reading `pages/api/admin/users/[userId]/status.ts` for the existing access shape).

### Test plan (six specs in `tests/e2e/signup-intent.spec.ts`)

1. **Follower happy path** — sign up with intent `follower`; assert landing URL matches the helper's prediction (currently `/tournaments`, becomes `/find` once F3 ships); assert `user_profiles.signup_intent === 'follower'` for that user via an authenticated read (e.g. a small `/api/me/profile` endpoint if it doesn't already exist, otherwise via direct DB read in the helper).
2. **Coach happy path** — sign up with intent `coach`; assert landing on `/welcome/coach`; assert the page shows the user's email in the body copy.
3. **League operator happy path** — sign up with intent `league_operator`; assert landing on `/leagues/new`.
4. **Tournament organizer happy path** — sign up with intent `tournament_organizer`; assert landing on `/tournaments/new`.
5. **Approval mode — operator** — temporarily enable `require_user_approval` via the admin settings endpoint (or set up via a `beforeAll` direct SQL write); sign up with intent `league_operator`; assert landing on `/welcome/pending`; teardown restores the original value.
6. **Invite link ignored when peek 404s** — navigate `/sign-up?invite=bogus-token`; assert stage 1 (intent picker) renders, i.e. invite param is gracefully ignored.

Each test uses `test.afterEach` to call `cleanupTestUser` so the dev DB is left clean. The admin-context page for cleanup is established in a `test.beforeAll` per the pattern in `tests/e2e/rbac-auto-assign.spec.ts`.

### Existing tests

No existing tests need modification. The `storageState` default ensures other suites stay authenticated as the standard fixture user; F2's tests opt out by not using that fixture (Playwright supports per-test storage state).

## Out of scope (explicit)

- **The invite issuance and acceptance side (X1).** F2 defines the contract; X1 builds the token table, the operator-side "send invite" UI, the real peek endpoint, and the `POST /api/invites/accept` endpoint for existing users.
- **The `/find` unified search page (F3).** F2 routes Followers to `/tournaments` until F3 ships.
- **Persona-aware home page (X2).** The home page is unchanged by F2.
- **L2 / T2 next-step banners** on the league/tournament detail pages. Those live on the post-creation pages, not on the path between signup and creation.
- **C2 "request a role" path** for Coaches with no operator. The `/welcome/coach` page tells them what to do; it does not yet provide a button to request access.
- **Backfilling `signup_intent` for existing accounts.** Existing rows stay NULL; the redirect helper handles NULL by returning `/`.

## Verification

1. Migration runs successfully on the dev Neon branch (`br-billowing-forest-aflgasia`). Confirm with `\d user_profiles` showing the new column.
2. Manual smoke: sign up cold with each of the four intents in a fresh browser session, confirm each lands on the expected page.
3. Manual smoke under approval mode: enable `require_user_approval`, sign up as `league_operator`, confirm `/welcome/pending` shows the right copy.
4. Manual smoke for invite stub: navigate `/sign-up?invite=anything`, confirm the picker still appears.
5. Playwright suite passes: `npx playwright test signup-intent.spec.ts`.
6. Existing Playwright tests still pass: `npx playwright test` (full suite).
