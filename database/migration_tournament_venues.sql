-- database/migration_tournament_venues.sql
-- Tournament-scoped venues with optional link to global locations,
-- per-venue field/court list, and a one-time auto-promotion flag.

CREATE TABLE IF NOT EXISTS tournament_venues (
  id               serial PRIMARY KEY,
  tournament_id    int NOT NULL REFERENCES tournaments(tournamentid) ON DELETE CASCADE,
  sort_order       int NOT NULL DEFAULT 0,

  location_id      int NULL REFERENCES locations(id) ON DELETE SET NULL,

  custom_name      text NULL,
  custom_address   text NULL,
  custom_city      text NULL,
  custom_state     text NULL,

  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       text NULL,

  CONSTRAINT tournament_venues_kind_xor CHECK (
    (location_id IS NOT NULL AND custom_name IS NULL)
    OR
    (location_id IS NULL AND custom_name IS NOT NULL)
  ),
  CONSTRAINT tournament_venues_unique_predefined UNIQUE (tournament_id, location_id),
  CONSTRAINT tournament_venues_unique_custom UNIQUE (tournament_id, custom_name)
);

CREATE INDEX IF NOT EXISTS idx_tournament_venues_tid
  ON tournament_venues (tournament_id, sort_order);

CREATE TABLE IF NOT EXISTS tournament_venue_fields (
  id                    serial PRIMARY KEY,
  tournament_venue_id   int NOT NULL REFERENCES tournament_venues(id) ON DELETE CASCADE,
  name                  text NOT NULL,
  sort_order            int NOT NULL DEFAULT 0,
  CONSTRAINT tournament_venue_fields_unique_name
    UNIQUE (tournament_venue_id, name)
);

CREATE INDEX IF NOT EXISTS idx_tournament_venue_fields_venue
  ON tournament_venue_fields (tournament_venue_id, sort_order);

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS venues_initialized boolean NOT NULL DEFAULT false;

ALTER TABLE tournamentgames
  ADD COLUMN IF NOT EXISTS tournament_venue_id int NULL
    REFERENCES tournament_venues(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tournamentgames_venue
  ON tournamentgames (tournament_venue_id);
