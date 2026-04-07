-- Indexes to support "mine" filtering by created_by on core entity tables
-- Run on: dev first, then LDQA, then prod
CREATE INDEX IF NOT EXISTS idx_leagues_created_by     ON leagues(created_by);
CREATE INDEX IF NOT EXISTS idx_tournaments_created_by ON tournaments(created_by);
CREATE INDEX IF NOT EXISTS idx_teams_created_by       ON teams(created_by);
