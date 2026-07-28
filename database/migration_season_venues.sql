-- database/migration_season_venues.sql
-- Season-scoped venues (mirror of migration_tournament_venues.sql, keyed on
-- season_id): optional link to global locations, per-venue field/court list,
-- and a one-time auto-promotion flag on seasons.
-- Season games already carry location/field/location_id; this adds a
-- season_venue_id FK so games can point at a curated season venue.

CREATE TABLE IF NOT EXISTS season_venues (
  id               serial PRIMARY KEY,
  season_id        int NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  sort_order       int NOT NULL DEFAULT 0,

  location_id      int NULL REFERENCES locations(id) ON DELETE SET NULL,

  custom_name      text NULL,
  custom_address   text NULL,
  custom_city      text NULL,
  custom_state     text NULL,

  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       text NULL,

  CONSTRAINT season_venues_kind_xor CHECK (
    (location_id IS NOT NULL AND custom_name IS NULL)
    OR
    (location_id IS NULL AND custom_name IS NOT NULL)
  ),
  CONSTRAINT season_venues_unique_predefined UNIQUE (season_id, location_id),
  CONSTRAINT season_venues_unique_custom UNIQUE (season_id, custom_name)
);

CREATE INDEX IF NOT EXISTS idx_season_venues_sid
  ON season_venues (season_id, sort_order);

CREATE TABLE IF NOT EXISTS season_venue_fields (
  id                serial PRIMARY KEY,
  season_venue_id   int NOT NULL REFERENCES season_venues(id) ON DELETE CASCADE,
  name              text NOT NULL,
  sort_order        int NOT NULL DEFAULT 0
);

-- Case-insensitive uniqueness within a venue: "Field 1" and "field 1"
-- are the same field. Expression index so the constraint is enforced at
-- the DB layer (the API also checks, but this is the backstop).
CREATE UNIQUE INDEX IF NOT EXISTS season_venue_fields_unique_name_ci
  ON season_venue_fields (season_venue_id, LOWER(name));

CREATE INDEX IF NOT EXISTS idx_season_venue_fields_venue
  ON season_venue_fields (season_venue_id, sort_order);

ALTER TABLE seasons
  ADD COLUMN IF NOT EXISTS venues_initialized boolean NOT NULL DEFAULT false;

ALTER TABLE season_games
  ADD COLUMN IF NOT EXISTS season_venue_id int NULL
    REFERENCES season_venues(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_season_games_venue
  ON season_games (season_venue_id);

-- Note: unlike tournaments, season games are inserted directly into
-- season_games (there is no poolgames_view analog), so no view update is needed.
