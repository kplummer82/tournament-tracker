-- Migration: add pool_play_games_per_team to tournaments
-- Drives the setup-progress "every team has its pool play games" check.
-- When set to N, setup is only complete once every team has exactly N pool play games
-- (in addition to those games having venue/field and a date/time).
-- Safe to re-run.

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS pool_play_games_per_team integer;

COMMENT ON COLUMN public.tournaments.pool_play_games_per_team IS
  'Expected number of pool play games each team plays. Used by setup-progress to verify the full pool schedule has been built.';
