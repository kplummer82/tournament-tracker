-- App-wide settings (key-value store)
CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed defaults
INSERT INTO app_settings (key, value)
VALUES ('max_simulations', '10000')
ON CONFLICT (key) DO NOTHING;

INSERT INTO app_settings (key, value)
VALUES ('require_user_approval', 'false')
ON CONFLICT (key) DO NOTHING;
