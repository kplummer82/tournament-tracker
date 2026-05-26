-- Cascade-style cleanup of user_roles when a scoped entity is deleted.
--
-- user_roles.scope_id is a single column reused across 4 scope_types
-- ('league','division','tournament','team') referencing different PKs, so a
-- normal FK with ON DELETE CASCADE isn't possible. Triggers on each scoped
-- table delete matching user_roles rows after the entity is removed.
--
-- Also removes any pre-existing orphan rows where scope_id points at a
-- no-longer-existing entity.

-- 1) Backfill: remove existing orphans
DELETE FROM public.user_roles ur
WHERE
  (ur.scope_type = 'tournament' AND NOT EXISTS (SELECT 1 FROM public.tournaments t WHERE t.tournamentid = ur.scope_id))
  OR (ur.scope_type = 'league'   AND NOT EXISTS (SELECT 1 FROM public.leagues l WHERE l.id = ur.scope_id))
  OR (ur.scope_type = 'division' AND NOT EXISTS (SELECT 1 FROM public.league_divisions d WHERE d.id = ur.scope_id))
  OR (ur.scope_type = 'team'     AND NOT EXISTS (SELECT 1 FROM public.teams tm WHERE tm.teamid = ur.scope_id));

-- 2) Trigger functions
CREATE OR REPLACE FUNCTION public.cleanup_user_roles_tournament()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM public.user_roles
   WHERE scope_type = 'tournament' AND scope_id = OLD.tournamentid;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_user_roles_league()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM public.user_roles
   WHERE scope_type = 'league' AND scope_id = OLD.id;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_user_roles_division()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM public.user_roles
   WHERE scope_type = 'division' AND scope_id = OLD.id;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_user_roles_team()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM public.user_roles
   WHERE scope_type = 'team' AND scope_id = OLD.teamid;
  RETURN OLD;
END;
$$;

-- 3) Triggers (drop-then-create for idempotency)
DROP TRIGGER IF EXISTS trg_cleanup_user_roles_tournament ON public.tournaments;
CREATE TRIGGER trg_cleanup_user_roles_tournament
AFTER DELETE ON public.tournaments
FOR EACH ROW EXECUTE FUNCTION public.cleanup_user_roles_tournament();

DROP TRIGGER IF EXISTS trg_cleanup_user_roles_league ON public.leagues;
CREATE TRIGGER trg_cleanup_user_roles_league
AFTER DELETE ON public.leagues
FOR EACH ROW EXECUTE FUNCTION public.cleanup_user_roles_league();

DROP TRIGGER IF EXISTS trg_cleanup_user_roles_division ON public.league_divisions;
CREATE TRIGGER trg_cleanup_user_roles_division
AFTER DELETE ON public.league_divisions
FOR EACH ROW EXECUTE FUNCTION public.cleanup_user_roles_division();

DROP TRIGGER IF EXISTS trg_cleanup_user_roles_team ON public.teams;
CREATE TRIGGER trg_cleanup_user_roles_team
AFTER DELETE ON public.teams
FOR EACH ROW EXECUTE FUNCTION public.cleanup_user_roles_team();
