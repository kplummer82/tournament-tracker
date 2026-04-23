-- Tracks which entities (teams, leagues, divisions, tournaments) a user follows.
-- Replaces the created_by–based "My X" queries on the home page.
CREATE TABLE IF NOT EXISTS user_follows (
  id          SERIAL PRIMARY KEY,
  user_id     TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('team','league','division','tournament')),
  entity_id   INT  NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_user_follows_user   ON user_follows(user_id);
CREATE INDEX IF NOT EXISTS idx_user_follows_entity ON user_follows(entity_type, entity_id);

-- Backfill: auto-follow entities for their creators
INSERT INTO user_follows (user_id, entity_type, entity_id)
SELECT created_by, 'team', teamid FROM teams WHERE created_by IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO user_follows (user_id, entity_type, entity_id)
SELECT created_by, 'league', id FROM leagues WHERE created_by IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO user_follows (user_id, entity_type, entity_id)
SELECT created_by, 'tournament', tournamentid FROM tournaments WHERE created_by IS NOT NULL
ON CONFLICT DO NOTHING;
