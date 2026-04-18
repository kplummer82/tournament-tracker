-- All-star nomination settings on seasons
ALTER TABLE seasons
  ADD COLUMN IF NOT EXISTS allstar_nominations_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS allstar_max_per_team INT;

-- All-star nominations junction table
CREATE TABLE IF NOT EXISTS allstar_nominations (
  id           SERIAL PRIMARY KEY,
  season_id    INT  NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  roster_id    INT  NOT NULL REFERENCES team_roster(id) ON DELETE CASCADE,
  nominated_by TEXT NOT NULL,
  nominated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(season_id, roster_id)
);

CREATE INDEX IF NOT EXISTS idx_allstar_noms_season ON allstar_nominations(season_id);
CREATE INDEX IF NOT EXISTS idx_allstar_noms_roster ON allstar_nominations(roster_id);
