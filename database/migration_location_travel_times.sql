-- Cached driving times between predefined locations, used by the tournament
-- scheduler's travel-time rule (a team can't be at venue B before it could drive
-- there from venue A: game1.start + game duration + 45-min changeover + drive time).
--
-- Global, not tournament-scoped: a location pair's drive time is reusable across
-- tournaments. Both directions are stored (Mapbox may return asymmetric durations).
-- Computed lazily on first need and cached; a newly-added location simply has
-- missing pairs that get filled on the next ensureTravelTimes() call.

CREATE TABLE IF NOT EXISTS location_travel_times (
  origin_location_id INT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  dest_location_id   INT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  driving_minutes    INT NOT NULL,
  computed_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (origin_location_id, dest_location_id)
);
