# Signup Intent (F2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a two-stage signup that asks the user what brings them here, persists the answer on `user_profiles`, and routes each persona to a page that lets them start their journey.

**Architecture:** Single `/sign-up` route hosts both stages via local component state. After signup succeeds, the client makes a follow-up `POST /api/me/signup-intent` to write the intent — this is more reliable than smuggling custom fields through the Neon Auth signup body. A pure-function redirect helper maps `(intent, status)` to the post-signup URL. Two small `/welcome/*` pages handle the Coach and "pending approval" landings. The invite-link branch is wired in but its server side (`/api/invites/peek`) is a stub returning 404 — the real implementation belongs to gap X1.

**Tech Stack:** Next.js 15 Pages Router, TypeScript, Tailwind CSS v4, React 19, Neon serverless Postgres via `@neondatabase/serverless`, Neon Auth via local proxy at `/api/auth/[...path]`, Playwright for E2E.

**Spec:** [docs/superpowers/specs/2026-05-22-signup-intent-design.md](../specs/2026-05-22-signup-intent-design.md)

**Deviation from spec — write path:** The spec described extending the auth proxy to read `signup_intent` from the signup request body. That approach depends on Neon Auth's `authClient.signUp.email` forwarding unknown fields to the upstream, which is not guaranteed. This plan uses a follow-up `POST /api/me/signup-intent` from the client after the session is established. Same end state on the row; cleaner separation; no change to the auth proxy. The `user_profiles` row is still created by the auth-proxy interceptor as it is today; only the `signup_intent` column is filled by the follow-up call.

---

## File Structure

**New files:**
- `database/migration_user_profiles_signup_intent.sql` — adds `signup_intent` column.
- `lib/auth/profile.ts` — read/write helpers for `user_profiles.signup_intent` and the `SignupIntent` runtime validator.
- `lib/auth/postSignupRedirect.ts` — pure-function URL chooser.
- `pages/api/me/signup-intent.ts` — `POST` writes `signup_intent` for the current user, `GET` returns it.
- `pages/api/invites/peek.ts` — stub returning 404 (defines the URL contract for X1).
- `pages/api/admin/users/[userId].ts` — `DELETE` handler for E2E cleanup.
- `pages/welcome/coach.tsx` — Coach landing page.
- `pages/welcome/pending.tsx` — operator awaiting-approval page.
- `components/signup/IntentPicker.tsx` — stage-1 UI.
- `components/signup/CredentialsForm.tsx` — stage-2 UI (extracted from current `pages/sign-up.tsx`).
- `tests/e2e/helpers/signup.ts` — fresh-user signup helpers.
- `tests/e2e/signup-intent.spec.ts` — six E2E specs.

**Modified files:**
- `lib/auth/permissions.ts` — add `SignupIntent` type alias.
- `pages/sign-up.tsx` — becomes a thin orchestrator: invite-peek on mount, stage state, renders `IntentPicker` or `CredentialsForm`. Calls `postSignupRedirect` after successful session.
- `pages/api/auth/[...path].ts` — **no change** (deviation from spec, see above).

**Files we deliberately do not touch:**
- `pages/leagues/new`, `pages/tournaments/new` — already correct.
- `pages/login.tsx` — out of scope.
- `pages/index.tsx` — persona-aware home is X2.

---

## Conventions used throughout this plan

- DB migrations are run against the **dev Neon branch** (`br-billowing-forest-aflgasia`). The codebase's `.env.local` already points here. Run via `psql "$DATABASE_URL" -f database/migration_user_profiles_signup_intent.sql`. If `psql` is not available, use the Neon MCP `run_sql` tool against project's dev branch.
- All API handlers follow the existing pattern: validate method, call `requireSession`/`requireAdmin`, JSON in/out, log errors with `[handler-name]` prefix.
- The four intent string literals are: `'follower' | 'coach' | 'league_operator' | 'tournament_organizer'`. They are exported as a single source of truth from `lib/auth/permissions.ts`.
- Commit after each task; commits look like `feat(signup-intent): <what>`.

---

## Task 1: Add the `SignupIntent` type and validator

**Files:**
- Modify: `lib/auth/permissions.ts`

- [ ] **Step 1: Add type alias and validator at the top of the file**

Open `lib/auth/permissions.ts`. Below the existing `AppRole` definition (after line 10), add:

```ts
// --------------- Signup Intent ---------------

export type SignupIntent =
  | "follower"
  | "coach"
  | "league_operator"
  | "tournament_organizer";

export const VALID_SIGNUP_INTENTS: SignupIntent[] = [
  "follower",
  "coach",
  "league_operator",
  "tournament_organizer",
];

export function isValidSignupIntent(value: unknown): value is SignupIntent {
  return typeof value === "string" && (VALID_SIGNUP_INTENTS as string[]).includes(value);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add lib/auth/permissions.ts
git commit -m "feat(signup-intent): add SignupIntent type and validator"
```

---

## Task 2: DB migration for `signup_intent` column

**Files:**
- Create: `database/migration_user_profiles_signup_intent.sql`

- [ ] **Step 1: Write the migration**

Create `database/migration_user_profiles_signup_intent.sql`:

```sql
-- Add signup_intent to user_profiles so we can route new users to a
-- persona-appropriate landing page after signup, and later personalize
-- the home page. Validation is enforced at the application layer to
-- keep adding new personas cheap.
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS signup_intent VARCHAR(20) NULL;
```

- [ ] **Step 2: Run the migration on the dev branch**

Run from the project root:

```powershell
psql "$env:DATABASE_URL" -f database/migration_user_profiles_signup_intent.sql
```

If `psql` is unavailable, use the Neon MCP `run_sql` tool against project `tournament-tracker`, branch `br-billowing-forest-aflgasia`, executing the same SQL.

- [ ] **Step 3: Verify the column exists**

Run:

```powershell
psql "$env:DATABASE_URL" -c "\d user_profiles"
```

Expected output includes: `signup_intent | character varying(20) |`

- [ ] **Step 4: Commit**

```bash
git add database/migration_user_profiles_signup_intent.sql
git commit -m "feat(signup-intent): add signup_intent column to user_profiles"
```

---

## Task 3: `lib/auth/profile.ts` — read/write helpers

**Files:**
- Create: `lib/auth/profile.ts`

- [ ] **Step 1: Write the helper module**

Create `lib/auth/profile.ts`:

```ts
import { sql } from "@/lib/db";
import type { SignupIntent } from "./permissions";
import { isValidSignupIntent } from "./permissions";

/**
 * Read the signup_intent for a user. Returns null if no row, no intent set,
 * or if validation fails (in case the DB ever has a stale value).
 */
export async function getUserSignupIntent(
  userId: string
): Promise<SignupIntent | null> {
  try {
    const rows = await sql`
      SELECT signup_intent FROM user_profiles WHERE user_id = ${userId}
    `;
    const raw = rows[0]?.signup_intent ?? null;
    return isValidSignupIntent(raw) ? raw : null;
  } catch {
    return null;
  }
}

/**
 * Set the signup_intent for a user. Upserts so it works even if the
 * user_profiles row was not created (defensive — the auth proxy normally
 * creates it on signup).
 */
export async function setUserSignupIntent(
  userId: string,
  intent: SignupIntent
): Promise<void> {
  await sql`
    INSERT INTO user_profiles (user_id, signup_intent, updated_at)
    VALUES (${userId}, ${intent}, NOW())
    ON CONFLICT (user_id) DO UPDATE
      SET signup_intent = ${intent}, updated_at = NOW()
  `;
}

/**
 * Read the status for a user. Returns 'active' if no row exists
 * (matches isUserInactive's "no row = active" posture in requireSession).
 */
export async function getUserStatus(
  userId: string
): Promise<"active" | "inactive"> {
  try {
    const rows = await sql`
      SELECT status FROM user_profiles WHERE user_id = ${userId}
    `;
    const raw = rows[0]?.status;
    return raw === "inactive" ? "inactive" : "active";
  } catch {
    return "active";
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add lib/auth/profile.ts
git commit -m "feat(signup-intent): add profile read/write helpers"
```

---

## Task 4: `lib/auth/postSignupRedirect.ts` — pure routing helper

**Files:**
- Create: `lib/auth/postSignupRedirect.ts`

- [ ] **Step 1: Write the helper**

Create `lib/auth/postSignupRedirect.ts`:

```ts
import type { SignupIntent } from "./permissions";

export interface PostSignupRedirectOptions {
  /**
   * Set to true once the unified "find what to follow" page (gap F3) ships.
   * Until then, Follower lands on /tournaments which is the closest existing
   * surface.
   */
  findPageExists?: boolean;
}

/**
 * Decide where to send a user immediately after their signup completes.
 *
 *   intent  | status='active'                | status='inactive'
 *  ---------|--------------------------------|---------------------------
 *   follower | /find or /tournaments         | /login?registered=1
 *   coach    | /welcome/coach                | /welcome/coach (banner)
 *   league_operator       | /leagues/new      | /welcome/pending
 *   tournament_organizer  | /tournaments/new  | /welcome/pending
 *   null    | /                              | /login?registered=1
 */
export function postSignupRedirect(
  intent: SignupIntent | null,
  status: "active" | "inactive",
  options: PostSignupRedirectOptions = {}
): string {
  const { findPageExists = false } = options;

  if (intent === "follower") {
    if (status === "inactive") return "/login?registered=1";
    return findPageExists ? "/find" : "/tournaments";
  }

  if (intent === "coach") {
    // Coach welcome page handles both active and inactive cases internally
    return "/welcome/coach";
  }

  if (intent === "league_operator") {
    return status === "inactive" ? "/welcome/pending" : "/leagues/new";
  }

  if (intent === "tournament_organizer") {
    return status === "inactive" ? "/welcome/pending" : "/tournaments/new";
  }

  // Unknown intent (null / older signup / write failed) — fall back
  return status === "inactive" ? "/login?registered=1" : "/";
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add lib/auth/postSignupRedirect.ts
git commit -m "feat(signup-intent): add postSignupRedirect helper"
```

---

## Task 5: `POST /api/me/signup-intent` endpoint

**Files:**
- Create: `pages/api/me/signup-intent.ts`

- [ ] **Step 1: Write the handler**

Create `pages/api/me/signup-intent.ts`:

```ts
import type { NextApiRequest, NextApiResponse } from "next";
import { getSessionForRequest } from "@/lib/auth/server";
import { getUserSignupIntent, setUserSignupIntent } from "@/lib/auth/profile";
import { isValidSignupIntent } from "@/lib/auth/permissions";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // We intentionally do NOT use requireSession here — that function rejects
  // inactive users. A brand-new inactive user must still be able to record
  // their signup intent (we'll route them to /welcome/pending).
  const session = await getSessionForRequest(req);
  if (!session?.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (req.method === "GET") {
    const intent = await getUserSignupIntent(session.user.id);
    return res.status(200).json({ intent });
  }

  if (req.method === "POST") {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {};
    const intent = body.intent;
    if (!isValidSignupIntent(intent)) {
      return res
        .status(400)
        .json({ error: "intent must be one of: follower, coach, league_operator, tournament_organizer" });
    }
    try {
      await setUserSignupIntent(session.user.id, intent);
      return res.status(200).json({ intent });
    } catch (err) {
      console.error("[me/signup-intent] write failed", err);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method Not Allowed" });
}
```

- [ ] **Step 2: Manual smoke test**

Start the dev server: `npm run dev` (skip if it's already running). In a browser logged in as any user, open DevTools → Console and run:

```js
await fetch("/api/me/signup-intent", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ intent: "follower" }) }).then(r => r.json())
```

Expected: `{ intent: "follower" }`.

Then:

```js
await fetch("/api/me/signup-intent").then(r => r.json())
```

Expected: `{ intent: "follower" }`.

- [ ] **Step 3: Commit**

```bash
git add pages/api/me/signup-intent.ts
git commit -m "feat(signup-intent): POST/GET /api/me/signup-intent"
```

---

## Task 6: `/api/invites/peek` stub

**Files:**
- Create: `pages/api/invites/peek.ts`

- [ ] **Step 1: Write the stub**

Create `pages/api/invites/peek.ts`:

```ts
import type { NextApiRequest, NextApiResponse } from "next";

/**
 * Stub for the invite peek endpoint. Real implementation belongs to gap X1.
 *
 * Contract defined here so the signup page's invite branch can be wired up:
 *
 *   GET /api/invites/peek?token=<token>
 *
 * 200 response shape (when X1 ships):
 *   {
 *     intent: SignupIntent,
 *     email?: string,
 *     role?: AppRole,
 *     scope?: { type: ScopeType; id: number },
 *     invitedBy?: { name: string }
 *   }
 *
 * 404 for any unknown / missing / expired token. The signup page treats
 * 404 as "no invite — show the picker normally".
 */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed" });
  }
  // Always 404 in F2. X1 will replace with real token lookup.
  return res.status(404).json({ error: "Invite not found" });
}
```

- [ ] **Step 2: Smoke test**

Run: `curl.exe -i http://localhost:3000/api/invites/peek?token=anything`
Expected: `HTTP/1.1 404` and `{"error":"Invite not found"}`.

- [ ] **Step 3: Commit**

```bash
git add pages/api/invites/peek.ts
git commit -m "feat(signup-intent): stub /api/invites/peek (X1 will implement)"
```

---

## Task 7: `DELETE /api/admin/users/[userId]` for E2E cleanup

**Files:**
- Create: `pages/api/admin/users/[userId].ts`

- [ ] **Step 1: Write the handler**

Create `pages/api/admin/users/[userId].ts`:

```ts
import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdmin } from "@/lib/auth/requireSession";
import { sql } from "@/lib/db";

/**
 * Hard-delete a user. Used by E2E tests to clean up throwaway users
 * created via the real signup flow. Also useful for support actions.
 *
 * Order matters: delete dependent rows in our tables first, then
 * delete the Neon Auth user via the auth-admin proxy path.
 */
function getOrigin(req: NextApiRequest): string {
  const proto = req.headers["x-forwarded-proto"] ?? "http";
  const host = req.headers.host ?? "localhost:3000";
  return `${proto}://${host}`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "DELETE") {
    res.setHeader("Allow", "DELETE");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const session = await requireAdmin(req, res);
  if (!session) return;

  const userIdParam = req.query.userId;
  const userId = Array.isArray(userIdParam) ? userIdParam[0] : userIdParam;
  if (!userId) {
    return res.status(400).json({ error: "userId required" });
  }

  // 1. Delete app-side rows that reference the user.
  try {
    await sql`DELETE FROM user_follows  WHERE user_id = ${userId}`;
    await sql`DELETE FROM user_roles    WHERE user_id = ${userId}`;
    await sql`DELETE FROM user_profiles WHERE user_id = ${userId}`;
  } catch (err) {
    console.error("[admin delete user] app-side cleanup failed", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }

  // 2. Delete the Neon Auth user via the existing auth-admin proxy.
  //    Verify the exact upstream path matches Neon Auth's admin API.
  //    pages/api/admin/users/index.ts uses /api/auth/admin/list-users; the
  //    delete equivalent is /api/auth/admin/delete-user/<id>. If that path
  //    doesn't work at runtime, check Neon Auth admin docs and update.
  try {
    const origin = getOrigin(req);
    const url = `${origin}/api/auth/admin/delete-user/${encodeURIComponent(userId)}`;
    const authRes = await fetch(url, {
      method: "POST",
      headers: { cookie: req.headers.cookie ?? "" },
    });
    if (!authRes.ok && authRes.status !== 404) {
      const text = await authRes.text();
      console.error("[admin delete user] neon auth delete failed", authRes.status, text);
      return res.status(500).json({ error: "Failed to delete auth user" });
    }
  } catch (err) {
    console.error("[admin delete user] neon auth delete threw", err);
    return res.status(500).json({ error: "Failed to delete auth user" });
  }

  return res.status(200).json({ userId, deleted: true });
}
```

- [ ] **Step 2: Manual smoke test**

This endpoint will be exercised by the E2E tests (Task 12). For now, just confirm it loads and that unauthorized callers get 401/403:

```powershell
# As an unauthenticated client — should be 401
curl.exe -i -X DELETE http://localhost:3000/api/admin/users/anything
```

Expected: `HTTP/1.1 401` with `{"error":"Unauthorized"}`.

- [ ] **Step 3: Commit**

```bash
git add pages/api/admin/users/[userId].ts
git commit -m "feat(signup-intent): admin DELETE user endpoint for E2E cleanup"
```

---

## Task 8: `pages/welcome/coach.tsx`

**Files:**
- Create: `pages/welcome/coach.tsx`

- [ ] **Step 1: Write the page**

Create `pages/welcome/coach.tsx`:

```tsx
import Header from "@/components/Header";
import Link from "next/link";
import type { GetServerSideProps } from "next";
import { getSessionForRequest } from "@/lib/auth/server";
import { getUserStatus } from "@/lib/auth/profile";

interface Props {
  email: string;
  status: "active" | "inactive";
}

export const getServerSideProps: GetServerSideProps<Props> = async ({ req }) => {
  const session = await getSessionForRequest(req as any);
  if (!session?.user) {
    return { redirect: { destination: "/login", permanent: false } };
  }
  const status = await getUserStatus(session.user.id);
  return {
    props: {
      email: session.user.email ?? "",
      status,
    },
  };
};

export default function CoachWelcome({ email, status }: Props) {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 mx-auto max-w-2xl w-full px-6 py-16">
        {status === "inactive" && (
          <div
            className="mb-8 border border-border bg-card px-4 py-3 text-sm"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Your account is awaiting approval before you can be added to a team.
          </div>
        )}

        <h1
          className="mb-3"
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 800,
            fontSize: "32px",
            textTransform: "uppercase",
            letterSpacing: "-0.02em",
          }}
        >
          You're in.
        </h1>

        <p
          className="text-base text-muted-foreground mb-6"
          style={{ fontFamily: "var(--font-body)" }}
        >
          Your account is created. A league operator needs to add you to a team before
          you can manage one. Share this email with them so they can find your account:
        </p>

        <p
          className="mb-10 px-4 py-3 border border-border bg-card text-foreground"
          style={{ fontFamily: "var(--font-body)", fontWeight: 600 }}
        >
          {email}
        </p>

        <Link
          href="/tournaments"
          className="inline-block text-primary hover:opacity-80 transition-opacity duration-100 text-sm"
          style={{ fontFamily: "var(--font-body)" }}
        >
          Find a team to follow while you wait →
        </Link>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Smoke test**

With the dev server running and signed in, navigate to `/welcome/coach`. Expected: page renders with your email displayed and the "Find a team to follow" link.

- [ ] **Step 3: Commit**

```bash
git add pages/welcome/coach.tsx
git commit -m "feat(signup-intent): /welcome/coach landing page"
```

---

## Task 9: `pages/welcome/pending.tsx`

**Files:**
- Create: `pages/welcome/pending.tsx`

- [ ] **Step 1: Write the page**

Create `pages/welcome/pending.tsx`:

```tsx
import Header from "@/components/Header";
import type { GetServerSideProps } from "next";
import { getSessionForRequest } from "@/lib/auth/server";
import { getUserSignupIntent } from "@/lib/auth/profile";

interface Props {
  noun: "league" | "tournament" | "account";
}

export const getServerSideProps: GetServerSideProps<Props> = async ({ req }) => {
  const session = await getSessionForRequest(req as any);
  if (!session?.user) {
    return { redirect: { destination: "/login", permanent: false } };
  }
  const intent = await getUserSignupIntent(session.user.id);
  let noun: Props["noun"] = "account";
  if (intent === "league_operator") noun = "league";
  if (intent === "tournament_organizer") noun = "tournament";
  return { props: { noun } };
};

export default function WelcomePending({ noun }: Props) {
  const headline =
    noun === "account"
      ? "Your account is awaiting approval."
      : `Thanks for signing up to run a ${noun}.`;
  const sub =
    noun === "account"
      ? "We'll email you when you're approved."
      : `Your account is awaiting approval. We'll email you when you're approved.`;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 mx-auto max-w-2xl w-full px-6 py-16">
        <h1
          className="mb-3"
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 800,
            fontSize: "32px",
            textTransform: "uppercase",
            letterSpacing: "-0.02em",
          }}
        >
          {headline}
        </h1>
        <p
          className="text-base text-muted-foreground"
          style={{ fontFamily: "var(--font-body)" }}
        >
          {sub}
        </p>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Smoke test**

With the dev server running and signed in, navigate to `/welcome/pending`. Expected: page renders with the "Your account is awaiting approval" headline (since your signup_intent is likely null today).

- [ ] **Step 3: Commit**

```bash
git add pages/welcome/pending.tsx
git commit -m "feat(signup-intent): /welcome/pending awaiting-approval page"
```

---

## Task 10: Extract `IntentPicker` and `CredentialsForm` components

This task splits the existing one-shot `/sign-up` form into two reusable stage components. The page itself is rewritten in Task 11.

**Files:**
- Create: `components/signup/IntentPicker.tsx`
- Create: `components/signup/CredentialsForm.tsx`

- [ ] **Step 1: Write `IntentPicker`**

Create `components/signup/IntentPicker.tsx`:

```tsx
import type { SignupIntent } from "@/lib/auth/permissions";

interface Option {
  intent: SignupIntent;
  label: string;
}

const OPTIONS: Option[] = [
  { intent: "follower", label: "I want to follow a team or league" },
  { intent: "coach", label: "I coach or manage a team" },
  { intent: "league_operator", label: "I run a league" },
  { intent: "tournament_organizer", label: "I'm running a tournament" },
];

interface Props {
  onPick: (intent: SignupIntent) => void;
}

export function IntentPicker({ onPick }: Props) {
  return (
    <div className="max-w-md w-full mx-auto">
      <h1
        className="mb-1"
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 800,
          fontSize: "32px",
          textTransform: "uppercase",
          letterSpacing: "-0.02em",
        }}
      >
        Create Account
      </h1>
      <p
        className="text-sm text-muted-foreground mb-8"
        style={{ fontFamily: "var(--font-body)" }}
      >
        First, tell us what brings you here.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {OPTIONS.map((opt) => (
          <button
            key={opt.intent}
            type="button"
            data-testid={`intent-${opt.intent}`}
            onClick={() => onPick(opt.intent)}
            className="text-left border border-border bg-card hover:border-primary hover:bg-elevated transition-colors duration-100 px-4 py-5 text-sm text-foreground cursor-pointer"
            style={{ fontFamily: "var(--font-body)" }}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write `CredentialsForm`**

Create `components/signup/CredentialsForm.tsx`:

```tsx
import { useState } from "react";
import type { SignupIntent } from "@/lib/auth/permissions";

const INPUT_STYLE =
  "w-full border border-border bg-input px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors";

const VERB_PHRASE: Record<SignupIntent, string> = {
  follower: "follow a team",
  coach: "coach",
  league_operator: "run your league",
  tournament_organizer: "run your tournament",
};

const SUBMIT_LABEL: Record<SignupIntent, string> = {
  follower: "Sign up to follow your team",
  coach: "Sign up to coach",
  league_operator: "Sign up to run your league",
  tournament_organizer: "Sign up to run your tournament",
};

interface Props {
  intent: SignupIntent;
  /** When present, the email field is pre-filled and read-only (invite branch). */
  prefilledEmail?: string;
  onChangeIntent: () => void;
  onSubmit: (values: { name: string; email: string; password: string }) => Promise<void>;
  loading: boolean;
  error: string | null;
}

export function CredentialsForm({
  intent,
  prefilledEmail,
  onChangeIntent,
  onSubmit,
  loading,
  error,
}: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState(prefilledEmail ?? "");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit({ name, email, password });
  };

  return (
    <div className="max-w-sm w-full mx-auto">
      <div
        className="mb-6 inline-flex items-center gap-3 border border-border bg-card px-3 py-1.5 text-xs"
        style={{ fontFamily: "var(--font-body)" }}
      >
        <span className="text-muted-foreground">
          Signing up to <span className="text-foreground font-semibold">{VERB_PHRASE[intent]}</span>
        </span>
        {!prefilledEmail && (
          <button
            type="button"
            onClick={onChangeIntent}
            className="text-primary hover:opacity-80 transition-opacity duration-100 cursor-pointer"
            data-testid="change-intent"
          >
            Change
          </button>
        )}
      </div>

      <h1
        className="mb-1"
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 800,
          fontSize: "32px",
          textTransform: "uppercase",
          letterSpacing: "-0.02em",
        }}
      >
        Create Account
      </h1>
      <p className="text-sm text-muted-foreground mb-8" style={{ fontFamily: "var(--font-body)" }}>
        Get started — it only takes a minute.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label-section mb-1.5 block">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoComplete="name"
            className={INPUT_STYLE}
            placeholder="Your full name"
          />
        </div>
        <div>
          <label className="label-section mb-1.5 block">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            readOnly={!!prefilledEmail}
            autoComplete="email"
            className={INPUT_STYLE}
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label className="label-section mb-1.5 block">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
            className={INPUT_STYLE}
            placeholder="••••••••"
          />
        </div>
        {error && (
          <p
            className="text-sm text-destructive border border-destructive/30 bg-destructive/10 px-3 py-2"
            style={{ fontFamily: "var(--font-body)" }}
          >
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={loading}
          data-testid="submit-credentials"
          className="w-full bg-primary text-primary-foreground py-2.5 text-[11px] font-semibold tracking-[0.1em] uppercase hover:opacity-90 disabled:opacity-40 transition-opacity duration-100 mt-2"
          style={{ fontFamily: "var(--font-body)" }}
        >
          {loading ? "Creating account…" : SUBMIT_LABEL[intent]}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add components/signup/IntentPicker.tsx components/signup/CredentialsForm.tsx
git commit -m "feat(signup-intent): extract IntentPicker and CredentialsForm components"
```

---

## Task 11: Rewrite `pages/sign-up.tsx` as the two-stage orchestrator

**Files:**
- Modify: `pages/sign-up.tsx` (full rewrite)

- [ ] **Step 1: Replace the file contents**

Open `pages/sign-up.tsx` and replace the entire file with:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { authClient } from "@/lib/auth/client";
import type { SignupIntent } from "@/lib/auth/permissions";
import { postSignupRedirect } from "@/lib/auth/postSignupRedirect";
import { IntentPicker } from "@/components/signup/IntentPicker";
import { CredentialsForm } from "@/components/signup/CredentialsForm";

type InvitePayload = {
  intent: SignupIntent;
  email?: string;
};

export default function SignUpPage() {
  const router = useRouter();
  const [intent, setIntent] = useState<SignupIntent | null>(null);
  const [invite, setInvite] = useState<InvitePayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // On mount, if there's an ?invite=<token> param, try to peek.
  // F2 ships with the peek stub returning 404 for all tokens, so this
  // gracefully falls through to the normal stage-1 flow.
  useEffect(() => {
    if (!router.isReady) return;
    const token = router.query.invite;
    if (typeof token !== "string" || token.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/invites/peek?token=${encodeURIComponent(token)}`);
        if (!res.ok) return; // 404 = no invite, fall through
        const data = (await res.json()) as Partial<InvitePayload>;
        if (cancelled) return;
        if (data?.intent) {
          setInvite({ intent: data.intent, email: data.email });
          setIntent(data.intent);
        }
      } catch {
        // ignore — fall through to normal flow
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router.isReady, router.query.invite]);

  const handleSubmit = async ({
    name,
    email,
    password,
  }: {
    name: string;
    email: string;
    password: string;
  }) => {
    if (!intent) return; // guarded by the form being mounted only after intent set
    setError(null);
    setLoading(true);

    let clientError: string | null = null;
    try {
      const res = await authClient.signUp.email({ name, email, password });
      if (res.error) clientError = res.error.message ?? "Sign up failed";
    } catch (err) {
      clientError = err instanceof Error ? err.message : "Sign up failed";
    }

    // Verify session — sign-up may auto-login even if client reports error
    let userId: string | null = null;
    try {
      const session = await authClient.getSession();
      userId = session?.data?.user?.id ?? null;
    } catch {
      /* fall through */
    }

    if (!userId) {
      if (!clientError) {
        // Sign-up succeeded but no auto-login (approval mode without auto-session).
        window.location.href = "/login?registered=1";
        return;
      }
      setError(clientError);
      setLoading(false);
      return;
    }

    // Write intent. If this fails, we still want to land the user somewhere
    // useful — postSignupRedirect handles null intent.
    let effectiveIntent: SignupIntent | null = intent;
    try {
      const res = await fetch("/api/me/signup-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ intent }),
      });
      if (!res.ok) effectiveIntent = null;
    } catch {
      effectiveIntent = null;
    }

    // Read status so we can route inactive users correctly.
    let status: "active" | "inactive" = "active";
    try {
      const res = await fetch("/api/me/profile-status", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        if (data?.status === "inactive") status = "inactive";
      }
    } catch {
      /* default to active */
    }

    const target = postSignupRedirect(effectiveIntent, status);
    window.location.href = target;
  };

  const showPicker = !intent;

  return (
    <div className="min-h-screen flex">
      {/* ── Left branding panel ── */}
      <div
        className="hidden lg:flex flex-col justify-between flex-1 bg-card border-r border-border p-12"
        style={{ maxWidth: "55%" }}
      >
        <div>
          <Link
            href="/"
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: "16px",
              textTransform: "uppercase",
              letterSpacing: "-0.01em",
              color: "var(--primary)",
            }}
          >
            Stacked Bench
          </Link>
        </div>

        <div>
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              fontSize: "clamp(48px, 5vw, 80px)",
              textTransform: "uppercase",
              letterSpacing: "-0.03em",
              lineHeight: 0.95,
              color: "var(--foreground)",
            }}
          >
            Run Your<br />Tournament<br />
            <span style={{ color: "var(--primary)" }}>Right.</span>
          </h2>
          <p className="mt-5 text-muted-foreground text-base max-w-sm" style={{ fontFamily: "var(--font-body)" }}>
            Pool play, standings, bracket seeding — all tracked in one place. Free to use.
          </p>
        </div>

        <div className="flex gap-6 items-center">
          <div className="w-12 h-1 bg-primary" />
          <span
            className="text-muted-foreground/40 text-[10px] tracking-[0.12em] uppercase"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Youth Sports Management Platform
          </span>
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 flex flex-col justify-center px-8 md:px-14 py-12">
        {/* Mobile brand */}
        <div className="mb-10 lg:hidden">
          <Link
            href="/"
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: "16px",
              textTransform: "uppercase",
              letterSpacing: "-0.01em",
              color: "var(--primary)",
            }}
          >
            Stacked Bench
          </Link>
        </div>

        {showPicker ? (
          <IntentPicker onPick={setIntent} />
        ) : (
          <CredentialsForm
            intent={intent!}
            prefilledEmail={invite?.email}
            onChangeIntent={() => setIntent(null)}
            onSubmit={handleSubmit}
            loading={loading}
            error={error}
          />
        )}

        <p
          className="mt-6 text-sm text-muted-foreground text-center"
          style={{ fontFamily: "var(--font-body)" }}
        >
          Already have an account?{" "}
          <Link href="/login" className="text-primary hover:opacity-80 transition-opacity duration-100">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add the small `/api/me/profile-status` endpoint the page calls**

Create `pages/api/me/profile-status.ts`:

```ts
import type { NextApiRequest, NextApiResponse } from "next";
import { getSessionForRequest } from "@/lib/auth/server";
import { getUserStatus } from "@/lib/auth/profile";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed" });
  }
  // Same posture as /api/me/signup-intent: inactive users must still be
  // able to read their status, so we do not call requireSession.
  const session = await getSessionForRequest(req);
  if (!session?.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const status = await getUserStatus(session.user.id);
  return res.status(200).json({ status });
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Manual smoke test — all four happy paths**

With the dev server running and `require_user_approval` off (the default), sign up four fresh accounts in an incognito window (one per intent). For each:

| Intent | Expected landing |
|---|---|
| follower | `/tournaments` |
| coach | `/welcome/coach` (your email appears in the page body) |
| league_operator | `/leagues/new` |
| tournament_organizer | `/tournaments/new` |

Confirm directly in the dev DB that each row has the right `signup_intent`:

```powershell
psql "$env:DATABASE_URL" -c "SELECT user_id, signup_intent, status FROM user_profiles ORDER BY created_at DESC LIMIT 4"
```

- [ ] **Step 5: Manual smoke test — invite param ignored**

In an incognito window, navigate to `/sign-up?invite=bogus`. Expected: the intent picker renders normally (the `/api/invites/peek` 404 was swallowed).

- [ ] **Step 6: Manual smoke test — Change link works**

Click an intent card, then click "Change" on the credentials form. Expected: returns to the picker.

- [ ] **Step 7: Commit**

```bash
git add pages/sign-up.tsx pages/api/me/profile-status.ts
git commit -m "feat(signup-intent): two-stage signup page with intent routing"
```

---

## Task 12: E2E test infrastructure — `tests/e2e/helpers/signup.ts`

**Files:**
- Create: `tests/e2e/helpers/signup.ts`

- [ ] **Step 1: Write the helper module**

Create `tests/e2e/helpers/signup.ts`:

```ts
import type { Page, BrowserContext, APIRequestContext } from "@playwright/test";
import { expect } from "@playwright/test";

export type SignupIntent =
  | "follower"
  | "coach"
  | "league_operator"
  | "tournament_organizer";

const DEFAULT_PASSWORD = "TestSignup123!";

export function generateTestEmail(intent: SignupIntent): string {
  const stamp = Date.now();
  const suffix = Math.random().toString(36).slice(2, 8);
  return `e2e-${intent}-${stamp}-${suffix}@test.stackedbench.com`;
}

/**
 * Drive the real sign-up UI for the given intent. Starts from a clean
 * (unauthenticated) state — caller is responsible for using a fresh
 * browser context. Resolves after the post-signup redirect completes.
 *
 * Returns the credentials and the resulting user id (read from
 * /api/me/profile-status after redirect — see implementation note below).
 */
export async function signUpWithIntent(
  page: Page,
  intent: SignupIntent
): Promise<{ email: string; password: string; userId: string }> {
  const email = generateTestEmail(intent);
  const password = DEFAULT_PASSWORD;
  const name = `E2E ${intent} ${Date.now()}`;

  await page.goto("/sign-up");
  await page.getByTestId(`intent-${intent}`).click();
  await page.fill('input[type="text"]', name);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.getByTestId("submit-credentials").click();

  // Wait until we leave /sign-up — could land on /tournaments, /leagues/new,
  // /tournaments/new, /welcome/coach, /welcome/pending, or /login?registered=1.
  await page.waitForURL(
    (url) => !url.pathname.startsWith("/sign-up"),
    { timeout: 20000 }
  );

  // The user is now signed in (unless approval mode redirected to /login).
  // Look up their id via the auth client session endpoint.
  const userId = await page.evaluate(async () => {
    const res = await fetch("/api/auth/get-session", { credentials: "include" });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.user?.id ?? data?.data?.user?.id ?? null;
  });
  expect(userId, "expected a user id after signup").toBeTruthy();

  return { email, password, userId: userId as string };
}

/**
 * Delete a user created during a test. Uses an admin-authenticated request
 * context so we don't disturb the page's own auth state.
 */
export async function cleanupTestUser(
  request: APIRequestContext,
  userId: string
): Promise<void> {
  const res = await request.delete(`/api/admin/users/${encodeURIComponent(userId)}`);
  if (!res.ok()) {
    console.warn(
      `[e2e cleanup] delete user ${userId} returned ${res.status()} — leaving row behind`
    );
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/helpers/signup.ts
git commit -m "feat(signup-intent): e2e helpers for fresh-user signup and cleanup"
```

---

## Task 13: E2E spec — happy paths and edge cases

**Files:**
- Create: `tests/e2e/signup-intent.spec.ts`

- [ ] **Step 1: Write the spec**

Create `tests/e2e/signup-intent.spec.ts`:

```ts
import { test, expect, request as playwrightRequest } from "@playwright/test";
import { loginAs, TEST_USERS } from "./helpers/auth";
import { signUpWithIntent, cleanupTestUser } from "./helpers/signup";

// These tests need a brand-new (unauthenticated) browser context per case
// because the default storageState in playwright.config.ts is logged in
// as the regular fixture user.
test.use({ storageState: { cookies: [], origins: [] } });

const createdUserIds: string[] = [];

test.afterAll(async ({ baseURL }) => {
  if (createdUserIds.length === 0) return;
  const ctx = await playwrightRequest.newContext({ baseURL });
  // Log in as admin via the auth client
  await ctx.post("/api/auth/sign-in/email", {
    data: { email: TEST_USERS.admin.email, password: TEST_USERS.admin.password },
    headers: { "Content-Type": "application/json" },
  });
  for (const id of createdUserIds) {
    await cleanupTestUser(ctx, id);
  }
  await ctx.dispose();
});

test("follower signup lands on /tournaments and stores intent", async ({ page }) => {
  const { userId } = await signUpWithIntent(page, "follower");
  createdUserIds.push(userId);

  expect(page.url()).toMatch(/\/tournaments(\?|$)/);

  // Read intent back via the API to confirm it was persisted.
  const intentRes = await page.request.get("/api/me/signup-intent");
  expect(intentRes.ok()).toBeTruthy();
  expect(await intentRes.json()).toEqual({ intent: "follower" });
});

test("coach signup lands on /welcome/coach", async ({ page }) => {
  const { userId, email } = await signUpWithIntent(page, "coach");
  createdUserIds.push(userId);

  await expect(page).toHaveURL(/\/welcome\/coach$/);
  await expect(page.locator("body")).toContainText(email);
});

test("league_operator signup lands on /leagues/new", async ({ page }) => {
  const { userId } = await signUpWithIntent(page, "league_operator");
  createdUserIds.push(userId);

  await expect(page).toHaveURL(/\/leagues\/new$/);
});

test("tournament_organizer signup lands on /tournaments/new", async ({ page }) => {
  const { userId } = await signUpWithIntent(page, "tournament_organizer");
  createdUserIds.push(userId);

  await expect(page).toHaveURL(/\/tournaments\/new$/);
});

test("invite token that 404s falls through to intent picker", async ({ page }) => {
  await page.goto("/sign-up?invite=bogus-token");
  // The picker should render with all four cards visible.
  await expect(page.getByTestId("intent-follower")).toBeVisible();
  await expect(page.getByTestId("intent-coach")).toBeVisible();
  await expect(page.getByTestId("intent-league_operator")).toBeVisible();
  await expect(page.getByTestId("intent-tournament_organizer")).toBeVisible();
});

test("approval mode routes league_operator to /welcome/pending", async ({ page, request }) => {
  // Toggle the approval setting on. This requires an admin session.
  const adminCtx = await playwrightRequest.newContext({ baseURL: page.url().replace(/\/sign-up.*$/, "") });
  await adminCtx.post("/api/auth/sign-in/email", {
    data: { email: TEST_USERS.admin.email, password: TEST_USERS.admin.password },
    headers: { "Content-Type": "application/json" },
  });
  // The settings endpoint path varies by codebase; if /api/admin/settings
  // does not exist, use direct SQL via a small helper. Verify against the
  // admin users page (which already reads/writes app_settings).
  await adminCtx.post("/api/admin/settings", {
    data: { key: "require_user_approval", value: "true" },
    headers: { "Content-Type": "application/json" },
  });

  try {
    const { userId } = await signUpWithIntent(page, "league_operator");
    createdUserIds.push(userId);
    await expect(page).toHaveURL(/\/welcome\/pending$/);
  } finally {
    // Always restore the setting, even if the assertion fails.
    await adminCtx.post("/api/admin/settings", {
      data: { key: "require_user_approval", value: "false" },
      headers: { "Content-Type": "application/json" },
    });
    await adminCtx.dispose();
  }
});
```

- [ ] **Step 2: Verify the admin-settings endpoint path matches reality**

The approval-mode test calls `POST /api/admin/settings`. Check whether that path exists:

Run: `Get-ChildItem pages/api/admin/settings* -ErrorAction SilentlyContinue`

If the endpoint does not exist or has a different path, look at how the admin Users page (`pages/admin/users.tsx`) toggles the setting — find the fetch call it makes — and update the test to match. If the toggle uses direct SQL through a different route, adjust the test accordingly. Do NOT add a new admin-settings endpoint just for this test; use whatever the app already uses.

- [ ] **Step 3: Run the new spec**

Run: `npx playwright test signup-intent.spec.ts --reporter=list`
Expected: all 6 tests pass.

If a test fails for reasons unrelated to F2's logic (e.g., upstream Neon Auth slowness, or the admin-settings path mismatch noted above), fix the test infrastructure rather than the feature. The feature itself should be exercised exactly as the manual smoke tests in Task 11 confirmed.

- [ ] **Step 4: Run the full Playwright suite to confirm no regressions**

Run: `npx playwright test --reporter=list`
Expected: all existing tests still pass, plus the 6 new ones.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/signup-intent.spec.ts
git commit -m "test(signup-intent): e2e specs for all four intents + edge cases"
```

---

## Task 14: Final verification pass

- [ ] **Step 1: Run the full test suite one more time**

Run: `npx playwright test --reporter=list`
Expected: all tests pass.

- [ ] **Step 2: TypeScript clean build**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `npm run lint` (skip if no lint script is defined)
Expected: no new errors.

- [ ] **Step 4: Confirm the dev DB is clean**

Run:

```powershell
psql "$env:DATABASE_URL" -c "SELECT user_id, signup_intent, status, created_at FROM user_profiles WHERE user_id LIKE 'e2e-%' OR created_at > NOW() - INTERVAL '1 hour' ORDER BY created_at DESC LIMIT 20"
```

Confirm there are no leftover `e2e-...` test users from a recent run.

- [ ] **Step 5: Sanity-check the spec one more time**

Re-read [docs/superpowers/specs/2026-05-22-signup-intent-design.md](../specs/2026-05-22-signup-intent-design.md). Confirm every section's claims are now actually in code, with the documented deviation (the `POST /api/me/signup-intent` follow-up call replacing the auth-proxy intent write) being the only change from the spec.

- [ ] **Step 6: Push the branch**

```bash
git push -u origin HEAD
```
