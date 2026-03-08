-- ============================================================
-- Forfeit support migrations
-- Run once against the target database.
-- ============================================================

-- New game status options (IDs 6 and 7)
INSERT INTO gamestatusoptions (gamestatus, gamestatusdescription)
VALUES
  ('Home Team Forfeit', 'Home team forfeited; away team wins 0-0'),
  ('Away Team Forfeit', 'Away team forfeited; home team wins 0-0');

-- Forfeit run differential credit (optional, defaults to 0 when NULL)
ALTER TABLE seasons     ADD COLUMN IF NOT EXISTS forfeit_run_diff INT;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS forfeit_run_diff INT;
