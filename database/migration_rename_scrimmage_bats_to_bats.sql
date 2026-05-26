-- Rename scrimmage_bats -> bats (table is now used beyond scrimmages, e.g. tournaments).
-- Also rename associated constraints/indexes so pg_dump stays tidy.
-- Adds optional bat_id FK on tournaments.
--
-- Run on: dev (br-billowing-forest-aflgasia), then LDQA (br-dark-paper-afuw26ux), then prod.
-- FK columns on scrimmage_listing_bats (bat_id) are already neutrally named — no change there.

ALTER TABLE scrimmage_bats RENAME TO bats;

ALTER TABLE bats RENAME CONSTRAINT scrimmage_bats_pkey TO bats_pkey;
ALTER TABLE bats RENAME CONSTRAINT scrimmage_bats_name_sport_key TO bats_name_sport_key;
ALTER TABLE bats RENAME CONSTRAINT scrimmage_bats_sport_id_fkey TO bats_sport_id_fkey;

ALTER INDEX idx_scrimmage_bats_sport RENAME TO idx_bats_sport;

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS bat_id INT REFERENCES bats(id) ON DELETE SET NULL;
