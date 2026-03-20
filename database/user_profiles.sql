-- Per-user profile tracked in our own DB (independent of Neon Auth roles).
-- status: 'active' (can use app) or 'inactive' (awaiting admin approval).
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id    TEXT PRIMARY KEY,
  status     VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Replace the old single-purpose pending_users table
DROP TABLE IF EXISTS pending_users;
