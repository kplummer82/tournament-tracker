-- Scenario questions for "Can team X achieve seed #Y?" analysis
CREATE TABLE IF NOT EXISTS scenario_questions (
  id            SERIAL PRIMARY KEY,
  entity_type   TEXT NOT NULL CHECK (entity_type IN ('season','tournament')),
  entity_id     INT NOT NULL,
  question_type TEXT NOT NULL DEFAULT 'seed_achievable'
    CHECK (question_type IN ('seed_achievable')),
  team_id       INT NOT NULL,
  target_seed   INT NOT NULL CHECK (target_seed >= 1),
  seed_mode     TEXT NOT NULL DEFAULT 'or_better'
    CHECK (seed_mode IN ('exact','or_better')),
  is_possible   BOOLEAN,
  probability   NUMERIC(7,4),    -- 0.0000–100.0000
  simulations_run INT NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','running','completed','error')),
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scenario_questions_entity
  ON scenario_questions (entity_type, entity_id);
