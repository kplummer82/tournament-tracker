-- Nullable lat/lng for tournaments so the Mapbox city picker can persist
-- coordinates of the main city without re-geocoding later (e.g. for a future
-- "tournaments near me" view). Free-text entries leave these NULL.

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS latitude  numeric(9,6),
  ADD COLUMN IF NOT EXISTS longitude numeric(9,6);
