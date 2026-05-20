-- Indexes to keep ILIKE searches on /api/locations cheap as the table grows.
-- Btree on LOWER(col) helps prefix matches (LOWER(col) LIKE 'foo%') but not
-- arbitrary substring matches. If perf degrades past ~10k rows, follow up with
-- pg_trgm + GIN indexes.

CREATE INDEX IF NOT EXISTS idx_locations_name_lower ON locations (LOWER(name));
CREATE INDEX IF NOT EXISTS idx_locations_city_lower ON locations (LOWER(city));
CREATE INDEX IF NOT EXISTS idx_locations_state ON locations (state);
