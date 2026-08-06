# E2E tests

Playwright specs in this directory. Config: `playwright.config.ts`.

## Fixture users

The RBAC specs authenticate as two fixture users that must exist in the target
database's Neon Auth (`neon_auth."user"`), with a `credential` account:

| Key | Email | Password | `role` |
|-----|-------|----------|--------|
| `admin` | `admin@test.stackedbench.com` | `TestAdmin123!` | `admin` (system admin) |
| `regularUser` | `user@test.stackedbench.com` | `TestUser123!` | `user` |

Both must have `user_profiles.status = 'active'` (or `require_user_approval`
off) so they aren't blocked by approval mode, and must not have MFA enabled.

To (re)create a fixture against a running app, POST to the auth API:

```bash
curl -X POST "$BASE/api/auth/sign-up/email" -H 'Content-Type: application/json' \
  -d '{"email":"user@test.stackedbench.com","password":"TestUser123!","name":"E2E User"}'
```

Email verification is not required for sign-in. The `admin` fixture's `role`
is set to `admin` directly in `neon_auth."user"`.

## Running locally

Needs a dev server (Playwright's `webServer` starts `npm run dev` if none is
running) pointed at a DB that has the fixtures — the **dev** branch already does.

```bash
npx playwright test rbac-idor.spec.ts --project=default
```

`rbac-idor.spec.ts` uses `apiLogin` (auth API, robust) rather than driving the
login form, and runs serially to share fixtures and avoid auth rate limits.

## CI

The `e2e` job in `.github/workflows/ci.yml` is **gated off by default** so it
never breaks CI before it's configured. To activate:

1. Add repository **secrets**: `E2E_DATABASE_URL`, `E2E_NEON_AUTH_BASE_URL`,
   `E2E_NEON_AUTH_COOKIE_SECRET` — pointing at a branch whose DB has the fixture
   users (e.g. the dev branch).
2. Add repository **variable** `RUN_E2E` = `true`.

The job installs Chromium, boots the app against that DB, and runs the RBAC/IDOR
spec, uploading the Playwright HTML report as an artifact.
