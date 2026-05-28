-- Convert tournament -> bat from single FK (tournaments.bat_id) to many-to-many
-- via a junction table (tournament_bats), mirroring scrimmage_listing_bats.
--
-- Run on: dev (br-billowing-forest-aflgasia), then LDQA (br-dark-paper-afuw26ux), then prod.

CREATE TABLE IF NOT EXISTS tournament_bats (
  tournament_id INT NOT NULL REFERENCES tournaments(tournamentid) ON DELETE CASCADE,
  bat_id        INT NOT NULL REFERENCES bats(id)                  ON DELETE RESTRICT,
  PRIMARY KEY (tournament_id, bat_id)
);

CREATE INDEX IF NOT EXISTS idx_tournament_bats_bat ON tournament_bats(bat_id);

-- Backfill: copy existing single bat_id into the junction.
INSERT INTO tournament_bats (tournament_id, bat_id)
SELECT tournamentid, bat_id
FROM tournaments
WHERE bat_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Drop the now-redundant single FK column.
ALTER TABLE tournaments
  DROP COLUMN IF EXISTS bat_id;
