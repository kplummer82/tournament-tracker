-- MFA (email OTP) — per-user opt-in second factor layered on Neon Auth.
-- Neon Auth issues its session cookie on password success; the app gates
-- "MFA-pending" sessions itself (see lib/auth/requireSession.ts). Codes are
-- plaintext like invites.token — guarded by a 10-minute TTL, a 5-attempt cap,
-- and a resend cooldown rather than hashing (a 6-digit code has no useful
-- offline-attack resistance either way).
-- Run on: dev branch first, then LDQA, then prod.

-- ── Per-user MFA settings ─────────────────────────────────────────────────────
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS mfa_enabled    BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS mfa_method     TEXT    NOT NULL DEFAULT 'email'; -- 'email' now, 'sms' later
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS mfa_enabled_at TIMESTAMPTZ;

-- ── One-time codes ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mfa_challenges (
  id          SERIAL PRIMARY KEY,
  user_id     TEXT NOT NULL,                       -- Neon Auth user id
  method      TEXT NOT NULL DEFAULT 'email',
  purpose     TEXT NOT NULL DEFAULT 'login',       -- 'login' | 'enable'
  code        TEXT NOT NULL,                       -- 6-digit numeric
  attempts    INT  NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '10 minutes',
  consumed_at TIMESTAMPTZ                          -- set on success OR invalidation
);

CREATE INDEX IF NOT EXISTS idx_mfa_challenges_user
  ON mfa_challenges(user_id, purpose, created_at DESC);

-- ── Sessions that completed MFA ───────────────────────────────────────────────
-- Keyed by the Neon Auth session id so requireSession can tell whether this
-- particular sign-in already passed the second factor.
CREATE TABLE IF NOT EXISTS mfa_verified_sessions (
  session_id  TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL                 -- mirrors the Neon Auth session expiresAt
);

CREATE INDEX IF NOT EXISTS idx_mfa_verified_sessions_expires
  ON mfa_verified_sessions(expires_at);

-- ── Trusted devices ("remember this device for 30 days") ─────────────────────
CREATE TABLE IF NOT EXISTS mfa_trusted_devices (
  id           SERIAL PRIMARY KEY,
  token        TEXT NOT NULL UNIQUE,               -- randomBytes(32) base64url, held in an httpOnly cookie
  user_id      TEXT NOT NULL,
  label        TEXT,                               -- user-agent snapshot at creation
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days',
  revoked_at   TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_mfa_trusted_devices_user
  ON mfa_trusted_devices(user_id);
