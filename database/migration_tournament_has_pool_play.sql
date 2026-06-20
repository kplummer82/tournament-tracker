-- Add a per-tournament flag for whether the tournament runs pool play before
-- bracket play. When false, the tournament goes directly to bracket play and
-- seeds are set manually or randomized (no standings-based auto-seeding).
-- Run on the dev branch first, then prod (per project DB conventions).

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS has_pool_play boolean NOT NULL DEFAULT true;
