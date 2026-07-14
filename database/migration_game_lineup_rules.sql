-- Per-game, per-team lineup validation rule toggles (Defense tab).
-- rules JSONB keys: fair_sit (bool), fair_outfield (bool). Designed to
-- later accept league/division-level rule keys that trickle down.
CREATE TABLE IF NOT EXISTS game_lineup_rules (
  game_source TEXT    NOT NULL CHECK (game_source IN ('season', 'tournament', 'scrimmage')),
  game_id     INTEGER NOT NULL,
  team_id     INTEGER NOT NULL,
  rules       JSONB   NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (game_source, game_id, team_id)
);
