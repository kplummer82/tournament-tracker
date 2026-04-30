-- Phase 2: Link games to pre-defined locations.
-- location/field TEXT columns remain for display; location_id adds the "official" link.
-- ON DELETE SET NULL: if a location is removed, games keep their text but lose the badge.

ALTER TABLE season_games ADD COLUMN IF NOT EXISTS location_id INT REFERENCES locations(id) ON DELETE SET NULL;
ALTER TABLE tournamentgames ADD COLUMN IF NOT EXISTS location_id INT REFERENCES locations(id) ON DELETE SET NULL;
