-- Structured location + field on scrimmages so the game detail screen can
-- show official location info (with a Google Maps directions link) and the
-- specific field/court, mirroring season_games.
-- Run on: dev (br-billowing-forest-aflgasia), then LDQA (br-dark-paper-afuw26ux), then prod.

ALTER TABLE scrimmages
  ADD COLUMN IF NOT EXISTS location_id INT REFERENCES locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS field       TEXT;

CREATE INDEX IF NOT EXISTS idx_scrimmages_location_id ON scrimmages(location_id);

-- Backfill marketplace-created scrimmages from their linked listing + accepted offer.
-- Listings carry location_id; the accepted offer may carry a more specific
-- location_id and the field name. Prefer the offer when present.
UPDATE scrimmages sc
SET
  location_id = COALESCE(so.proposed_location_id, sl.location_id),
  field       = so.proposed_location_field
FROM scrimmage_listings sl
LEFT JOIN scrimmage_offers so
  ON so.listing_id = sl.id AND so.status = 'accepted'
WHERE sc.listing_id = sl.id
  AND sc.location_id IS NULL;
