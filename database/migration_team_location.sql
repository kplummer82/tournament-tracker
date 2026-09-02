-- Team home location.
--
-- Every team gets a location, entered one of two ways:
--   1. 'home_field' — a venue picked from the shared `locations` directory.
--      Address/coords live on the location row; we only keep the FK.
--   2. 'city' — a city/state typed into the Mapbox typeahead. Mapbox hands
--      back the canonical city name, region code and centroid, which we store
--      inline since there is no directory row to point at.
--
-- Existing teams are backfilled to San Diego, CA and can be edited afterwards.

ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS location_type    TEXT,
  ADD COLUMN IF NOT EXISTS home_location_id INT REFERENCES locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS city             TEXT,
  ADD COLUMN IF NOT EXISTS state            TEXT,
  ADD COLUMN IF NOT EXISTS latitude         NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS longitude        NUMERIC(10,7);

CREATE INDEX IF NOT EXISTS idx_teams_home_location ON teams(home_location_id);

-- Backfill every pre-existing team to San Diego, CA.
UPDATE teams
SET location_type = 'city',
    city          = 'San Diego',
    state         = 'CA',
    latitude      = 32.7157,
    longitude     = -117.1611
WHERE location_type IS NULL
  AND home_location_id IS NULL;

-- A location row must be internally consistent: a home field needs the FK, a
-- city needs a city name. NULL location_type stays legal so programmatic
-- creates (season quick-add, seeds) can defer the choice to the team page.
ALTER TABLE teams DROP CONSTRAINT IF EXISTS teams_location_shape;
ALTER TABLE teams ADD CONSTRAINT teams_location_shape CHECK (
  location_type IS NULL
  OR (location_type = 'home_field' AND home_location_id IS NOT NULL)
  OR (location_type = 'city'       AND city IS NOT NULL AND btrim(city) <> '')
);
