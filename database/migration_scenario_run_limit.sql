-- Per-user daily cap on scenario simulation runs (abuse / cost throttle).
-- Scenarios stay open to all logged-in users; admins are uncapped. The cap is
-- admin-configurable via app_settings.scenario_daily_run_limit (default 20).

-- One row per non-admin scenario run; the cap counts rows in a rolling 24h window.
CREATE TABLE IF NOT EXISTS scenario_run_log (
  id         BIGSERIAL PRIMARY KEY,
  user_id    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scenario_run_log_user_time
  ON scenario_run_log (user_id, created_at DESC);

-- Configurable daily limit (per user). Admins ignore it entirely.
INSERT INTO app_settings (key, value, updated_at)
VALUES ('scenario_daily_run_limit', '20', NOW())
ON CONFLICT (key) DO NOTHING;
