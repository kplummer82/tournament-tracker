-- Bracket Game Scheduling & Location/Field Support
-- Adds location and field to all game tables, links bracket games to season_games,
-- and allows nullable home/away for TBD later-round bracket games.

-- 1. Location & field on season_games
ALTER TABLE season_games ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE season_games ADD COLUMN IF NOT EXISTS field TEXT;

-- 2. Location & field on tournamentgames
ALTER TABLE tournamentgames ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE tournamentgames ADD COLUMN IF NOT EXISTS field TEXT;

-- 3. Bracket-game link columns on season_games
ALTER TABLE season_games ADD COLUMN IF NOT EXISTS bracket_id INT REFERENCES season_brackets(id) ON DELETE CASCADE;
ALTER TABLE season_games ADD COLUMN IF NOT EXISTS bracket_game_id TEXT;

-- Unique constraint: one season_game per bracket game slot
CREATE UNIQUE INDEX IF NOT EXISTS uq_season_games_bracket_game
  ON season_games (bracket_id, bracket_game_id)
  WHERE bracket_id IS NOT NULL;

-- 4. Allow nullable home/away for TBD bracket games (later rounds)
ALTER TABLE season_games ALTER COLUMN home DROP NOT NULL;
ALTER TABLE season_games ALTER COLUMN away DROP NOT NULL;
