-- Track which scrimmages came from a marketplace listing, so we can hide
-- Delete (and force Cancel) on those games.
-- Run on: dev (br-billowing-forest-aflgasia), then LDQA (br-dark-paper-afuw26ux), then prod.

ALTER TABLE scrimmages
  ADD COLUMN IF NOT EXISTS listing_id INT REFERENCES scrimmage_listings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_scrimmages_listing_id ON scrimmages(listing_id);
