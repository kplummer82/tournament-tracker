# Personas and Journeys — Field-Test Readiness

**Date:** 2026-05-21
**Status:** Draft for review
**Author:** Kellan (with Claude)

## Context

The app already has role management, role assignments, parent → child entity relationships (governing body → league → division → season → teams/games), a public browse surface, a `user_follows` system, and an admin approval workflow. What it does *not* have is a coherent story for how a brand-new human moves from "I just heard about this app" to "I am using it the way the team intended." Different people will arrive for very different reasons — a parent looking to follow their kid's team, a coach who was promised the schedule would live here, a league operator standing up a season for the first time — and today they all land on the same home page with the same lack of guidance.

Before field testing, we need three things:

1. A clear written record of who the personas are and what each one's complete path through the app looks like (the "user guide" deliverable).
2. A grounded list of the real gaps that path exposes — every place where the current product makes the journey awkward, broken, or impossible.
3. A prioritized backlog so field-test prep doesn't become a year-long project; we ship the gaps that block field testing and defer the rest.

This document is the umbrella spec for that work. Each significant gap will become its own follow-up brainstorm → spec → plan. The signup-intent change is already chosen as the first downstream spec.

## Personas

Four personas, ordered by the weights the user gave them:

1. **Follower** (parent / fan) — most common by headcount. No admin role. Signs up to find and follow a team, league, or tournament. Reads schedules, standings, brackets. Never creates anything. Success: *"I can find my kid's team in under a minute and see their next game."*

2. **Coach / Team Manager** — most frequent in-app activity per user. Has `team_manager` on one or more teams. Manages roster, sees team schedule across seasons and tournaments. Success: *"I can see everything that affects my team without having to learn the admin UI."*

3. **League Operator** — most business-critical relationship. Today this is one person with `league_admin` doing everything: divisions, seasons, schedules, team assignments, role grants. The role *will* fragment into sub-roles (Scheduler, Registrar, Division Lead) but that fragmentation is **out of scope for field testing**; current `league_admin` is the testable persona. Success: *"I can stand up a season and invite the right people without Kellan on the phone."*

4. **Tournament Organizer** — secondary admin persona. Runs one-off tournaments. Has `tournament_admin`. Often the same human as a League Operator wearing a different hat. Treated as its own persona because the entity model (`tournaments` vs `seasons`) is independent. Success: *"I can create a tournament, set up venues, seed the bracket, and share a public link before opening night."*

**Explicit non-persona:** the platform-level Neon Auth `admin`. Not a field-test persona; relevant only for support and the Roles admin UI.

## Journey template

Every persona section uses the same five-stage skeleton so the document is scannable and comparisons are easy:

1. **Entry** — How they arrive. Direct signup, invite link, public page they found via search. Names the URLs in play today.
2. **First meaningful action** — The one thing that has to work within ~60 seconds of signup or the persona bounces.
3. **Recurring loop** — What they come back to do, day after day. Names the pages and APIs.
4. **Handoffs** — Where this persona depends on another persona having done something first. Most cross-persona gaps live here.
5. **Exit / dormancy** — How they leave gracefully. (Season ends, child ages out, tournament archived, coach hands team off.)

Gaps are tagged inline with **[GAP-XX]** identifiers (`F` for Follower, `C` for Coach, `L` for League Operator, `T` for Tournament Organizer, `X` for cross-cutting). The end of the document collects every tagged gap into a single prioritized table.

---

## Journey 1 — Follower (parent / fan)

### Entry

Two realistic paths today.

- **Path A — Inbound link.** Someone shares a link to a public team or tournament page. The Follower browses anonymously (tournament index, team detail, schedule, standings are all public) and only signs up if they decide they want to follow something across visits. This path works.
- **Path B — Cold signup.** A Follower goes to `/sign-up` directly (heard about the app from a friend). They land in `pages/sign-up.tsx`, fill in name + email + password, and after signup are dropped on `/` — the marketing hero. The home page does have a logged-in "My Teams / My Leagues / My Divisions / My Tournaments" section, but it's empty for a brand-new account and the empty state ("Nothing here yet.") doesn't tell them what to do next.

**[GAP-F1: cold-signup Followers have no onboarding step]** — After signup they land on `/` with no clear "find your team" affordance. The "Nothing here yet." empty state is informational, not actionable.

**[GAP-F2: signup doesn't ask intent]** — Already chosen as the umbrella signup-intent change. The Follower path through it should end with a "Find your team" search rather than the marketing home page.

### First meaningful action

Follow a team. The follow API exists (`POST /api/me/follows` for entity_type ∈ `team | league | division | tournament`). Search exists on `/pages/tournaments/index.tsx` and (per the Explore agent) on teams/leagues. What's missing is a single high-confidence "find what to follow" surface that searches across all four follow-able entity types at once — because the way a parent thinks ("my kid plays for the Hawks in the spring league") doesn't map cleanly to a single entity type.

**[GAP-F3: no unified "find what to follow" search]** — Today you must already know whether the thing you're looking for is a team, a league, or a tournament before you can search for it. A unified search (one input, results grouped by entity type, each result has a "Follow" button) collapses the journey from three searches into one.

### Recurring loop

Home page (`pages/index.tsx`) already shows followed entities, grouped by type, with expand/collapse and links. This is good. What a Follower wants *next* is what changed since their last visit:

- the next upcoming game for each followed team,
- the score from the last completed game,
- a single-tap path to the current standings or bracket for a followed league/tournament.

Today the home page only lists names — to see anything dynamic you must click into the team or league.

**[GAP-F4: home page lists followed entities but doesn't surface "next game / last result"]** — Followers have to drill into each entity to see what changed. A small "next: vs. Bears, Sat 10am @ Field 3" row under each team would carry most of the value.

**[GAP-F5: no notifications]** — Schedule changes, scores posted, bracket advances all happen silently. Out of scope for initial field testing but flagged because Followers will ask about it within a week of using the app.

### Handoffs

A Follower can only follow things that exist and have content. They depend on:

- **Coaches** having created/rostered the team they want to follow.
- **League Operators** having published the season and its schedule.
- **Tournament Organizers** having built the bracket they want to watch.

If any of these upstream steps is incomplete, the Follower sees an empty team page or a league with no games — which reads as a broken app, not a not-yet-ready season.

**[GAP-F6: followed team with no upcoming games shows as empty]** — Needs an empty state explaining "season not yet scheduled" vs "all games played" vs "team not currently in a season." Today these all render the same way.

### Exit / dormancy

Their kid ages out, the season ends, the tournament wraps. Unfollow exists (`DELETE /api/me/follows`) but there's no nudge. Followed completed seasons stay in the list forever.

**[GAP-F7: no archive/dormancy cue for completed seasons and tournaments]** — Completed entities should visually de-emphasize (greyed out, "Completed" badge) and offer a one-click unfollow. Out of scope for field testing but listed for the backlog.

---

## Journey 2 — Coach / Team Manager

### Entry

Coaches almost never arrive by cold signup. Realistic paths:

- **Path A — Invited by a League Operator.** Today this is verbal: "Hey, go to stackedbench.com and sign up, then I'll add you to the team." There is no in-app invite, no link, no email. The Coach signs up the same way a Follower would (name + email + password) and then waits for the operator to grant `team_manager`.
- **Path B — Cold signup.** Rare, but possible — someone heard about the app and thinks they'll manage their team here. They have no role until an operator assigns one. There is currently no way for them to *request* a role.

**[GAP-C1: no email invite flow]** — A League Operator cannot pre-create an invitation tied to a specific role + scope (e.g. "team_manager on team #42") that an unregistered Coach can accept by signing up via the invite link. Today the operator must wait for the Coach to sign up, then manually find them by email in the admin UI and assign the role. This is **[GAP-X1]** in the cross-cutting list because it affects multiple personas.

**[GAP-C2: no "request a role" path for cold-signup Coaches]** — After signup, a Coach has no way to say "I think I should be the manager of the Hawks U12" and have that route to the appropriate operator for approval.

### First meaningful action

See their team. The team detail page exists and is public, but a Coach wants more than a Follower does — they want a team-centric dashboard that shows roster + cross-season schedule + management actions, not just the public read-only view.

**[GAP-C3: no team-manager dashboard distinct from public team page]** — The team detail page today is one view for everyone. A Coach who has `team_manager` on a team should see additional affordances (edit roster, view games across multiple seasons/tournaments, see internal notes if we add them) without being dropped into the league-admin UI.

### Recurring loop

What Coaches do repeatedly:

- check the team schedule for the next game,
- update the roster (add/remove players),
- (potentially) report scores after their games,
- communicate with parents (out of scope; would belong to a future messaging feature).

Roster and schedule reads work today. Score reporting is the open question.

**[GAP-C4: no Coach-scoped score reporting flow]** — Today scores are entered by whoever has admin access to the season. If we want Coaches to enter their own game scores, we need a flow that lets `team_manager` on either the home or away team submit a score for verification. This is a real product decision (do we want this? who confirms?) and may be deferred until after field testing.

**[GAP-C5: no cross-season "my team across all contexts" view]** — A team in a spring season, a summer tournament, and a fall season currently has three disconnected pages. A Coach managing the team year-round wants one timeline.

### Handoffs

Coaches depend on:

- **League Operators** having created the team and assigned them `team_manager`.
- **League/Tournament admins** having scheduled their games.
- **Followers** (parents) following the team to receive any future notifications.

The biggest handoff break is the missing invite flow (**[GAP-C1 / GAP-X1]**). The second is that today there's no way for a Coach to *see* who follows their team — relevant for future communication features but not field-test critical.

### Exit / dormancy

A Coach who hands the team off needs to (a) lose `team_manager` on that team, and (b) hand it to the next coach. The Roles admin UI supports revoke, but only an operator can do it; a Coach cannot resign and nominate a successor from the team page.

**[GAP-C6: no Coach-initiated handoff]** — Resigning a `team_manager` role and proposing a successor must go through an operator. Acceptable for field testing; flagged for later.

---

## Journey 3 — League Operator

### Entry

Cold signup is the expected path. The operator hears about the app (likely from us), goes to `/sign-up`, and creates an account. Two issues immediately:

- The signup form doesn't know they intend to operate a league, so they land on the marketing home page with no obvious "create a league" CTA.
- If `require_user_approval` is on, they're inactive until an admin (us) approves them. For the launch operators this is fine and probably intended; we'll approve manually.

**[GAP-L1: post-signup, League Operator has no obvious "create your first league" affordance]** — Covered by the umbrella signup-intent change (**[GAP-F2]**): the League Operator answer should route to a "Create your league" screen.

### First meaningful action

Create a league. `POST /api/leagues` works today, creator becomes `league_admin`, auto-followed. The form collects the basics. This works.

The *next* action — divisions, seasons, scheduling — is where the operator hits the long tail. Each step works in isolation but the journey from "I just created a league" to "we have a published schedule" involves at least:

1. Create one or more divisions under the league
2. Create a governing body if none exists (likely already present, but worth verifying)
3. Create a season under a division
4. Add teams to the season
5. Generate or hand-enter the schedule
6. (Optionally) configure tiebreakers, brackets, etc.

**[GAP-L2: no guided "set up your first season" flow]** — Each step has its own page and form, but there is no checklist or wizard tying them together. A new operator must learn the conceptual hierarchy before they can finish step 1. A simple persistent "Next step: add divisions" banner on the league page would carry most of the value without a full wizard.

### Recurring loop

Once the league is running, the operator's day-to-day is:

- create the next season,
- assign teams to divisions,
- enter or correct schedules,
- watch standings and tiebreakers resolve,
- handle bracket play.

These pages all exist. The recurring-loop gaps are mostly about scale rather than capability:

**[GAP-L3: no bulk team assignment]** — Adding 20 teams to a season is a 20-click exercise. (Verify against the actual UI — there may be a multi-select today; if so, this gap is downgraded.)

**[GAP-L4: no schedule-conflict detection across seasons]** — Two seasons in the same league booking the same venue at the same time is allowed silently. May be out of scope for v1; flagged.

### Handoffs

Operators depend on:

- **Coaches** being signed up so they can be assigned `team_manager` — blocked by the missing invite flow (**[GAP-X1]**).
- **Tournament Organizers**, in the case where a league runs a year-end tournament — but since the same human typically wears both hats, this is usually internal.

The big operator → operator handoff is delegation. Today `league_admin` is monolithic. A "Scheduler" who can edit games but not roles, or a "Registrar" who can add teams but not change tiebreakers, doesn't exist.

**[GAP-L5: monolithic league_admin role]** — Acknowledged as out of scope for field testing, but the role model should be designed with this fragmentation in mind so the eventual change isn't a migration nightmare. Concretely: avoid hard-coding "league_admin can do X" checks where a more granular permission check would be more durable.

### Exit / dormancy

A league that runs out of seasons should not appear active. An operator who stops running their league needs a way to either archive it or hand it to a successor. Neither exists today.

**[GAP-L6: no league archive / successor flow]** — Out of scope for field testing.

---

## Journey 4 — Tournament Organizer

### Entry

Two paths:

- **Path A — Already a League Operator.** Most likely. They've already signed up; they just need to create a tournament. No new onboarding required.
- **Path B — Cold signup specifically to run a tournament.** Goes through `/sign-up`, then via the signup-intent change picks "I'm here to run a tournament." Lands on a "Create your tournament" screen.

**[GAP-T1: signup intent must route Tournament Organizers correctly]** — Sub-case of the umbrella signup-intent change (**[GAP-F2]**), called out so it isn't forgotten.

### First meaningful action

Create a tournament. `POST /api/tournaments` works, creator gets `tournament_admin`, auto-follow. Works.

The next steps — venues, teams, pool, bracket — are partially supported by the recent `tournament_venues` work (visible in the user's IDE selection) and the existing pool/bracket pages.

**[GAP-T2: no guided "set up your tournament" flow]** — Parallel to **[GAP-L2]** for leagues. The same kind of persistent next-step banner on the tournament overview page would work.

### Recurring loop

For a Tournament Organizer the loop is compressed into the days surrounding the event:

- assign teams to pools,
- enter pool-play scores,
- finalize seeding,
- run the bracket,
- update scores live.

These all exist. The most likely live-event pain is speed:

**[GAP-T3: live-event score entry is form-based, not optimized for in-venue use]** — A phone-friendly "enter this score now" surface for tournament_admins would matter on event day. Verify whether existing pages already work well on mobile before scoping.

### Handoffs

Tournament Organizers depend on:

- **Coaches** being aware of the tournament. If teams are pulled from a league context, they inherit Coaches. If teams are tournament-only, no Coach exists.
- **Followers** finding the public tournament page — handled by existing public surfaces.
- **Other tournament_admins** — same delegation issue as League Operators (**[GAP-L5]** parallel), but smaller in practice because tournaments are short.

**[GAP-T4: tournament-only teams have no managers]** — A team created inside a tournament context (no league_id) has no team_manager unless one is explicitly assigned. This is an edge case but matters for live-event communication; flagged.

### Exit / dormancy

The tournament ends. Today the data persists with no "completed" treatment beyond whatever the bracket UI shows. Same archive issue as leagues (**[GAP-L6]**), at smaller scale.

---

## Cross-cutting gaps

These span more than one persona. The persona sections reference them rather than duplicating the description.

**[GAP-X1: email-based invite flow]** — Mentioned in Coach (C1) and League Operator (L for delegation). An operator should be able to enter an email address and a target role+scope, send an invite link, and have the recipient's signup automatically apply the role. Field-test critical because without it every Coach onboarding requires manual coordination.

**[GAP-X2: persona-aware home page]** — Today `pages/index.tsx` is the same hero + marketing strip + "My X" sections for everyone logged in. Each persona wants something different above the fold. Likely fixable with conditional sections rather than separate pages; the signup-intent change provides the signal.

**[GAP-X3: persona-aware navigation]** — A Follower doesn't need the admin nav; a League Operator does. Today there's no separation. Verify what the header actually shows for non-admin users before scoping.

**[GAP-X4: written user guide]** — Independent of any code change. A short doc (one page per persona) that mirrors the journeys above and points at the actual URLs. Lives in `docs/user-guide/` and is shared with field testers.

---

## Gap list (prioritized)

Severity: **High** = blocks field testing or breaks the journey. **Med** = noticeable friction. **Low** = nice-to-have / post-field-test.
Effort: S (≤1 day), M (≤1 week), L (multi-week).

| ID | Persona | Title | Severity | Effort |
|----|---------|-------|----------|--------|
| F2 | Follower / all | Ask intent at signup; route to persona-specific landing | High | M |
| X1 | Cross (Coach, League Op) | Email-based invite flow (role + scope pre-assigned) | High | M |
| F3 | Follower | Unified "find what to follow" search | High | S |
| L2 | League Operator | "Set up your first season" guided next-step banner | High | S |
| T2 | Tournament Organizer | "Set up your tournament" guided next-step banner | High | S |
| C3 | Coach | Coach-specific team dashboard (manager affordances) | High | M |
| X4 | Cross | Written user guide (one page per persona) | High | S |
| F4 | Follower | Surface "next game / last result" on home page | Med | S |
| F6 | Follower | Empty-state copy for followed team with no games | Med | S |
| X2 | Cross | Persona-aware home page sections | Med | S |
| X3 | Cross | Persona-aware navigation | Med | S |
| C2 | Coach | "Request a role" path for cold-signup Coaches | Med | M |
| L3 | League Operator | Bulk team assignment (verify gap exists first) | Med | S |
| C5 | Coach | Cross-season "my team everywhere" view | Med | M |
| T3 | Tournament Organizer | Mobile-friendly live score entry (verify gap exists first) | Med | M |
| F1 | Follower | Replace passive empty state with actionable one | Med | S |
| F7 | Follower | Archive/dormancy cue for completed entities | Low | S |
| C4 | Coach | Coach-scoped score reporting (product decision first) | Low | M |
| C6 | Coach | Coach-initiated handoff of `team_manager` | Low | M |
| L4 | League Operator | Schedule-conflict detection across seasons | Low | M |
| L5 | League Operator | Plan for monolithic-role fragmentation (design, not build) | Low | S |
| L6 | League Operator | League archive / successor flow | Low | M |
| T4 | Tournament Organizer | Tournament-only teams have no managers | Low | S |
| F5 | Follower | Notifications (any channel) | Low | L |

## Verification

This is a design/strategy document, not code. "Verification" here means:

1. **Read-through with the user.** The user reads the doc end-to-end and either approves or marks specific sections / gaps for revision. The doc must accurately describe what's in the codebase today; any line that misstates current behavior is a bug in the doc.
2. **Sanity-check the "verify gap exists first" items.** Three gaps (L3, T3, and the "what does the nav actually show" question in X3) are tagged as needing a quick UI check before they're scoped — they may already be partially solved. Confirm against the running app.
3. **Downstream specs.** Each High-severity gap becomes its own brainstorm → spec → plan. The first downstream spec, by prior agreement, is the signup-intent change (F2). The doc itself is the verification source for *that* spec's scope.

## Out of scope (named)

- **Building** any of the gaps in this doc. This is the umbrella spec only.
- **Role-model refactor** (granular permissions, sub-roles like Scheduler/Registrar). Acknowledged in L5; deferred until after field testing.
- **Notifications** (F5). Will be its own large project.
- **Messaging between Coaches and Followers.** Mentioned in passing under Coach's recurring loop; explicitly not in this plan.
- **Platform-level admin (Neon Auth `admin`) experience.** Named as a non-persona above.
