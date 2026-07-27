-- Cross-team player search + bulk COPPA anonymize.
--
-- A child is often rostered on many teams (a league team + several tournament
-- teams), and each is an independent team_roster row — there is no person_id
-- linking them. When a parent asks us to delete their kid, an admin needs to
-- find every roster row for that child across all teams and anonymize them
-- together. This migration supports that:
--
--   1. request_id on player_deletion_log, so all rows anonymized in a single
--      bulk request share one id and the cross-team deletion is auditable as
--      one event (the single-team endpoint leaves it NULL).
--   2. admin_player_search view, a Neon backstop so a DBA can search players by
--      name across every team directly in the console, independent of the app.
--
-- Run on: dev branch first, then LDQA, then prod.

-- 1. Batch grouping for the audit log.
ALTER TABLE public.player_deletion_log
  ADD COLUMN IF NOT EXISTS request_id TEXT;

CREATE INDEX IF NOT EXISTS idx_player_deletion_log_request_id
  ON public.player_deletion_log (request_id);

-- 2. Read-only cross-team player search view (Neon backstop).
-- Usage:
--   SELECT * FROM admin_player_search
--   WHERE (first_name || ' ' || coalesce(last_name,'')) ILIKE '%smith%'
--   ORDER BY last_name, first_name;
CREATE OR REPLACE VIEW public.admin_player_search AS
SELECT r.id            AS roster_id,
       r.teamid        AS team_id,
       t.name          AS team_name,
       r.first_name,
       r.last_name,
       r.jersey_number,
       r.role,
       r.deleted_at,
       r.created_at
FROM public.team_roster r
JOIN public.teams t ON t.teamid = r.teamid
WHERE r.role = 'player';
