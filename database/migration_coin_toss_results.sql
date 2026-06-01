-- Manual coin-toss tiebreaker results.
--
-- When teams remain tied after every configured tiebreaker except `coin_toss`,
-- a real-world coin toss (or equivalent) is performed to seed them. This table
-- stores the entered finishing order so displayed standings match reality.
-- Simulations keep using the deterministic coin toss and never read this table.
--
-- One row per team within a resolved group. `group_sig` is a stable signature of
-- the tied group's member team IDs (sorted ascending, joined by '-'), used to
-- auto-invalidate a saved result when later score edits change group membership.

CREATE TABLE IF NOT EXISTS coin_toss_results (
  id            SERIAL PRIMARY KEY,
  scope         TEXT NOT NULL CHECK (scope IN ('season','tournament')),
  scope_id      INTEGER NOT NULL,        -- season_id or tournamentid
  group_sig     TEXT NOT NULL,           -- stable signature of sorted member teamids
  teamid        INTEGER NOT NULL,
  seed_order    INTEGER NOT NULL,        -- 1 = best finish within the group
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scope, scope_id, group_sig, teamid)
);

CREATE INDEX IF NOT EXISTS idx_coin_toss_results_scope
  ON coin_toss_results (scope, scope_id);
