-- ==============================================================
-- Consolidated LDQA migration — 2026-04-30
-- Run against: Neon LDQA branch (br-dark-paper-afuw26ux)
-- All statements are idempotent (IF NOT EXISTS / IF EXISTS).
-- ==============================================================

-- -------------------------------------------------------
-- 1. user_profiles (may already exist from prior deploy)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id    TEXT PRIMARY KEY,
  status     VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TABLE IF EXISTS pending_users;

-- -------------------------------------------------------
-- 2. user_roles + created_by columns (may already exist)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_roles (
  id         SERIAL PRIMARY KEY,
  user_id    TEXT NOT NULL,
  role       TEXT NOT NULL,
  scope_type TEXT NOT NULL,
  scope_id   INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT,
  UNIQUE(user_id, role, scope_type, scope_id)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_scope ON user_roles(scope_type, scope_id);

ALTER TABLE leagues ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS created_by TEXT;

-- -------------------------------------------------------
-- 3. Division game duration
-- -------------------------------------------------------
ALTER TABLE league_divisions
  ADD COLUMN IF NOT EXISTS max_game_minutes INTEGER DEFAULT 120;

-- -------------------------------------------------------
-- 4. Locations & location fields
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS locations (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  address         TEXT,
  city            TEXT,
  state           TEXT,
  zip             TEXT,
  latitude        NUMERIC(10,7),
  longitude       NUMERIC(10,7),
  usps_verified   BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS location_fields (
  id          SERIAL PRIMARY KEY,
  location_id INT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(location_id, name)
);
CREATE INDEX IF NOT EXISTS idx_location_fields_location ON location_fields(location_id);

-- -------------------------------------------------------
-- 5. Link games to locations (location_id FK)
-- -------------------------------------------------------
ALTER TABLE season_games ADD COLUMN IF NOT EXISTS location_id INT REFERENCES locations(id) ON DELETE SET NULL;
ALTER TABLE tournamentgames ADD COLUMN IF NOT EXISTS location_id INT REFERENCES locations(id) ON DELETE SET NULL;
