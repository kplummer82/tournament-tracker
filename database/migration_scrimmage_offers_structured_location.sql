-- Scrimmage offers: add structured proposed-location columns.
-- Mirrors the listing shape (location_id + name + field).
-- proposed_location (TEXT) already exists; it becomes the denormalized
-- location name when proposed_location_id is set, and continues to hold
-- free-text otherwise.
-- Run on: dev branch, then LDQA, then prod.

ALTER TABLE scrimmage_offers
  ADD COLUMN IF NOT EXISTS proposed_location_id    INT REFERENCES locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS proposed_location_field TEXT;

CREATE INDEX IF NOT EXISTS idx_scrim_offers_proposed_loc
  ON scrimmage_offers(proposed_location_id)
  WHERE proposed_location_id IS NOT NULL;
