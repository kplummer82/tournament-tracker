-- Email invites (gap X1) — deferred role assignments targeting an email address.
-- An invite carries the same (role, scope_type, scope_id) as user_roles and, on
-- acceptance, grants that role via assignRole(). Run on: dev branch first, then
-- LDQA, then prod.

CREATE TABLE IF NOT EXISTS invites (
  id              SERIAL PRIMARY KEY,
  token           TEXT NOT NULL UNIQUE,
  email           TEXT NOT NULL,
  intent          VARCHAR(30),                 -- SignupIntent for the signup picker pre-fill
  role            TEXT NOT NULL,               -- AppRole granted on acceptance
  scope_type      TEXT NOT NULL,               -- league | division | tournament | team
  scope_id        INT  NOT NULL,
  invited_by      TEXT NOT NULL,               -- inviter user_id
  invited_by_name TEXT,                        -- display-name snapshot (email + peek)
  status          VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | accepted | revoked
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '14 days',
  accepted_at     TIMESTAMPTZ,
  accepted_by     TEXT
);

CREATE INDEX IF NOT EXISTS idx_invites_token ON invites(token);
CREATE INDEX IF NOT EXISTS idx_invites_scope ON invites(scope_type, scope_id);
CREATE INDEX IF NOT EXISTS idx_invites_email ON invites(LOWER(email));
