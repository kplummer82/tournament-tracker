-- RBAC: User Roles & Scoped Permissions
-- Run on: dev branch first, then LDQA, then prod

-- Role assignments table
-- role: 'league_admin','division_admin','tournament_admin','team_manager','team_parent'
-- scope_type: 'league','division','tournament','team'
-- scope_id: FK to the scoped entity (leagues.id, league_divisions.id, tournaments.tournamentid, teams.teamid)
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

-- Add created_by to entities for creator tracking
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS created_by TEXT;
