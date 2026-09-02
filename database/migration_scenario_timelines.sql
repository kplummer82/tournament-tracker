-- Scenario timelines: replay a scenario question at successive as-of dates so the
-- answer can be plotted over the course of a season.
--
-- A timeline is derived from an existing scenario_questions row (same team, question
-- type, target and simulation method) and runs the engine once per sampled date on
-- which a game was actually played. Each run is a normal as-of analysis — the engine
-- already filters both the completed-game set and the remaining-game set by as-of date.

-- ---------------------------------------------------------------------------
-- Run log: distinguish scenario runs from timeline runs so they cap separately.
-- Existing rows default to 'scenario', so the scenario cap is unaffected.
-- ---------------------------------------------------------------------------
ALTER TABLE scenario_run_log
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'scenario';

CREATE INDEX IF NOT EXISTS idx_scenario_run_log_user_kind_time
  ON scenario_run_log (user_id, kind, created_at DESC);

-- ---------------------------------------------------------------------------
-- Timeline header
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scenario_timelines (
  id            SERIAL PRIMARY KEY,
  scenario_id   INT NOT NULL REFERENCES scenario_questions(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','running','completed','error')),
  points_total  INT NOT NULL DEFAULT 0,
  points_done   INT NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One timeline per scenario; re-running replaces its points.
CREATE UNIQUE INDEX IF NOT EXISTS idx_scenario_timelines_scenario
  ON scenario_timelines (scenario_id);

-- ---------------------------------------------------------------------------
-- Timeline points. Columns deliberately mirror the result columns on
-- scenario_questions so the same renderers can read either shape.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scenario_timeline_points (
  id                      SERIAL PRIMARY KEY,
  timeline_id             INT NOT NULL REFERENCES scenario_timelines(id) ON DELETE CASCADE,
  point_index             INT NOT NULL,
  as_of_date              DATE NOT NULL,
  is_possible             BOOLEAN,
  probability             NUMERIC(7,4),   -- 0.0000-100.0000, NULL when impossible
  most_likely_seed        INT,
  most_likely_opponent_id INT,
  seed_distribution       JSONB,
  matchup_distribution    JSONB,
  simulations_run         INT NOT NULL DEFAULT 0,
  -- Set when this single point failed (e.g. Pythagorean prediction is ineligible
  -- early in a season). The rest of the timeline still renders.
  error_message           TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_scenario_timeline_points_idx
  ON scenario_timeline_points (timeline_id, point_index);

-- ---------------------------------------------------------------------------
-- Admin-configurable settings (see /api/admin/settings)
-- ---------------------------------------------------------------------------
INSERT INTO app_settings (key, value, updated_at) VALUES
  ('timeline_daily_run_limit',      '3',    NOW()),   -- timelines per user per rolling 24h
  ('scenario_timeline_max_points',  '12',   NOW()),   -- max plotted dates per timeline
  ('scenario_timeline_simulations', '2000', NOW())    -- sim budget per plotted point
ON CONFLICT (key) DO NOTHING;
