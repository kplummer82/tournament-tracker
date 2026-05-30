-- Migration: tournament bracket game support
-- Adds bracket_id + bracket_game_id link columns to tournamentgames so bracket games
-- can be stored alongside pool games. Mirrors the seasons bracket-game schema.

-- 1. Link columns
ALTER TABLE public.tournamentgames
  ADD COLUMN IF NOT EXISTS bracket_id INT REFERENCES public.tournament_brackets(id) ON DELETE CASCADE;

ALTER TABLE public.tournamentgames
  ADD COLUMN IF NOT EXISTS bracket_game_id TEXT;

-- 2. Allow nullable home/away so TBD later-round bracket games can exist as rows
ALTER TABLE public.tournamentgames ALTER COLUMN home DROP NOT NULL;
ALTER TABLE public.tournamentgames ALTER COLUMN away DROP NOT NULL;

-- 3. One tournamentgames row per (bracket, bracket_game_id)
CREATE UNIQUE INDEX IF NOT EXISTS uq_tournamentgames_bracket_game
  ON public.tournamentgames (bracket_id, bracket_game_id)
  WHERE bracket_id IS NOT NULL;

-- 4. Helpful lookup index
CREATE INDEX IF NOT EXISTS idx_tournamentgames_bracket
  ON public.tournamentgames (bracket_id);
