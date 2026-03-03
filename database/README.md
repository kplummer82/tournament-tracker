# Database scripts (Neon)

This folder holds SQL that defines or documents the Neon schema and routines. It is the source of truth for what the app expects to exist in the database.

- **`fn_pool_standings_lexi_noorder.sql`** – Pool standings with lexicographic tiebreaking. Used by the Pre-Bracket Standings page and (with `p_simulate`/`p_simulated`) for Monte Carlo. Run in Neon to create or update the function.
- **`team_roster.sql`** – Table for team roster (players and staff). Used by the team detail Roster tab. Run in Neon to create the table.
- **`bracket_templates.sql`** – Bracket layout templates (system library; later per-user via `created_by`). Used by Bracket Builder and tournament Bracket tab. **Run this in Neon to enable saving brackets from Bracket Builder** (copy the file contents into Neon SQL Editor and execute).
- **`tournament_bracket.sql`** – One bracket per tournament (structure + optional template link). Run after bracket_templates.
- **`bracket_assignments.sql`** – Seed-to-team assignment per tournament. Run after tournament_bracket.

## Auth (Neon Auth / Better Auth)

Authentication is provided by **Neon Auth** (Better Auth). Users and sessions live in Neon (managed `neon_auth` schema); no app-level user tables are required for login or sign-up.

- **Roles:** Two roles—**admin** (can access User management and add/remove admin for others) and **user** (default for new sign-ups).
- **First admin:** The first admin must be set outside the app: in the Neon Console (Auth → admin user ids) or via a one-off script that calls the Neon Auth admin API to set a user’s role to `admin`. After that, admins can use the **User management** page (link in the header when logged in as admin) to grant or revoke admin for other users.
- **Env vars:** `NEON_AUTH_BASE_URL` (from Neon Console → Project → Branch → Auth → Configuration), `NEON_AUTH_COOKIE_SECRET` (e.g. `openssl rand -base64 32`). Add these to `.env.local`.
