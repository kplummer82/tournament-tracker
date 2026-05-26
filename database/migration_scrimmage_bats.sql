-- Scrimmage Bats: lookup + join table for which bat types a listing allows.
-- Run on: dev branch (br-billowing-forest-aflgasia), then LDQA (br-dark-paper-afuw26ux), then prod.
--
-- Mandatory selection: every listing must have at least one bat. For all
-- pre-existing listings, backfill all three options so they're not silently
-- excluded from any future bat-filtered searches.

-- ── Lookup ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scrimmage_bats (
  id   SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

INSERT INTO scrimmage_bats (name) VALUES
  ('USSSA'),
  ('USA Baseball'),
  ('Wood')
ON CONFLICT (name) DO NOTHING;

-- ── Join ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scrimmage_listing_bats (
  listing_id INT NOT NULL REFERENCES scrimmage_listings(id) ON DELETE CASCADE,
  bat_id     INT NOT NULL REFERENCES scrimmage_bats(id)     ON DELETE RESTRICT,
  PRIMARY KEY (listing_id, bat_id)
);

CREATE INDEX IF NOT EXISTS idx_scrim_listing_bats_bat ON scrimmage_listing_bats(bat_id);

-- ── Backfill existing listings with all three bats ────────────────────────────
INSERT INTO scrimmage_listing_bats (listing_id, bat_id)
SELECT sl.id, sb.id
FROM scrimmage_listings sl
CROSS JOIN scrimmage_bats sb
ON CONFLICT DO NOTHING;
