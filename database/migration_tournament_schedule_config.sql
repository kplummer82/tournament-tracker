-- Persisted auto-schedule configuration for tournaments.
--
-- Stores the full TournamentScheduleConfig object (date range, blackout dates,
-- per-date time slots, and pool-play matchup rules) as JSON, mirroring the
-- seasons.schedule_config column. Read/written via the tournament GET/PATCH
-- route and consumed by the Scheduling tab + auto-schedule endpoint.

ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS schedule_config JSONB;
