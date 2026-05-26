-- Allow same bat name across different sports (e.g., USSSA Baseball + USSSA Softball).
-- Run on: dev (br-billowing-forest-aflgasia), then LDQA (br-dark-paper-afuw26ux), then prod.

ALTER TABLE scrimmage_bats
  DROP CONSTRAINT IF EXISTS scrimmage_bats_name_key;

ALTER TABLE scrimmage_bats
  ADD CONSTRAINT scrimmage_bats_name_sport_key UNIQUE (name, sport_id);
