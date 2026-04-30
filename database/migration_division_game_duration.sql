-- Add max_game_minutes to league_divisions.
-- Controls how long games last in each division for scheduling conflict detection.
-- Default 120 = 2 hours. NULL is treated as 120 by the conflict query.
ALTER TABLE league_divisions
  ADD COLUMN IF NOT EXISTS max_game_minutes INTEGER DEFAULT 120;
