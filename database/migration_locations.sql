-- Global locations table.
-- Locations are shared across all leagues and tournaments.
CREATE TABLE IF NOT EXISTS locations (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,             -- "Mission Sports Park"
  address         TEXT,                      -- "1234 Main St"
  city            TEXT,
  state           TEXT,
  zip             TEXT,
  latitude        NUMERIC(10,7),             -- for future geocoding/routing
  longitude       NUMERIC(10,7),
  usps_verified   BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fields/courts within a location (e.g., "Field 1", "Diamond A").
CREATE TABLE IF NOT EXISTS location_fields (
  id          SERIAL PRIMARY KEY,
  location_id INT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(location_id, name)
);
CREATE INDEX IF NOT EXISTS idx_location_fields_location ON location_fields(location_id);
