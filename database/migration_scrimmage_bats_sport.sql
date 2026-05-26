-- Add required sport_id to scrimmage_bats.
-- Run on: dev (br-billowing-forest-aflgasia), then LDQA (br-dark-paper-afuw26ux), then prod.
--
-- Bat certifications differ by sport (baseball vs. softball). Existing three
-- rows (USSSA, USA Baseball, Wood) are all baseball certs and backfill there.

ALTER TABLE scrimmage_bats
  ADD COLUMN IF NOT EXISTS sport_id INT REFERENCES sport(id) ON DELETE RESTRICT;

UPDATE scrimmage_bats
SET sport_id = (SELECT id FROM sport WHERE sportname ILIKE 'Baseball' LIMIT 1)
WHERE sport_id IS NULL;

ALTER TABLE scrimmage_bats
  ALTER COLUMN sport_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_scrimmage_bats_sport ON scrimmage_bats(sport_id);
