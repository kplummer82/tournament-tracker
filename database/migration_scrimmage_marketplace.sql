-- Scrimmage Marketplace: listings + offers tables
-- Run on: dev branch, then LDQA, then prod.

-- ── Listings ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS scrimmage_listings (
  id                  SERIAL PRIMARY KEY,
  team_id             INT NOT NULL REFERENCES teams(teamid) ON DELETE CASCADE,
  created_by          TEXT NOT NULL,

  status              TEXT NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open','filled','expired','cancelled')),

  will_travel         BOOLEAN NOT NULL DEFAULT false,
  travel_radius_miles INT,
  location_id         INT REFERENCES locations(id) ON DELETE SET NULL,
  location_name       TEXT,
  location_lat        NUMERIC(10,7),
  location_lng        NUMERIC(10,7),

  available_date      DATE NOT NULL,
  time_earliest       TIME,
  time_latest         TIME,

  opponent_scope      TEXT NOT NULL DEFAULT 'any'
                        CHECK (opponent_scope IN ('division','league','any')),
  age_range_min       INT,
  age_range_max       INT,
  sport_id            INT REFERENCES sport(id) ON DELETE SET NULL,

  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scrim_listings_team   ON scrimmage_listings(team_id);
CREATE INDEX IF NOT EXISTS idx_scrim_listings_status ON scrimmage_listings(status);
CREATE INDEX IF NOT EXISTS idx_scrim_listings_date   ON scrimmage_listings(available_date);
CREATE INDEX IF NOT EXISTS idx_scrim_listings_sport  ON scrimmage_listings(sport_id);
CREATE INDEX IF NOT EXISTS idx_scrim_listings_geo    ON scrimmage_listings(location_lat, location_lng)
  WHERE location_lat IS NOT NULL AND location_lng IS NOT NULL;

-- ── Offers ──────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS scrimmage_offers (
  id                SERIAL PRIMARY KEY,
  listing_id        INT NOT NULL REFERENCES scrimmage_listings(id) ON DELETE CASCADE,
  team_id           INT NOT NULL REFERENCES teams(teamid) ON DELETE CASCADE,
  offered_by        TEXT NOT NULL,

  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','accepted','declined','withdrawn')),

  proposed_location TEXT,
  proposed_time     TIME,
  message           TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at      TIMESTAMPTZ,
  responded_by      TEXT,

  UNIQUE(listing_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_scrim_offers_listing ON scrimmage_offers(listing_id);
CREATE INDEX IF NOT EXISTS idx_scrim_offers_team    ON scrimmage_offers(team_id);
CREATE INDEX IF NOT EXISTS idx_scrim_offers_status  ON scrimmage_offers(status);
