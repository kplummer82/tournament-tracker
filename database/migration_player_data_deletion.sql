-- COPPA player-data deletion (anonymize-in-place).
--
-- We must be able to honor requests to delete a child player's personal
-- information. A hard DELETE is unsafe: every table referencing a player
-- (game_batting_order, game_defensive_lineup, game_confirmations,
-- roster_positions, allstar_nominations) has ON DELETE CASCADE on
-- roster_id -> team_roster.id, so deleting the row would erase the child's
-- entire game history along with their PII.
--
-- Instead we anonymize in place: overwrite the PII on the single canonical
-- team_roster row (first_name -> 'Deleted Player {id}', null out last_name /
-- hat_monogram / walkup_song / walkup_song_itunes_id; jersey_number is kept)
-- and stamp deleted_at. Because every downstream view reads the name/jersey
-- through a JOIN on team_roster, the anonymization propagates everywhere.
--
-- Run on: dev branch first, then LDQA, then prod.

-- Tombstone markers on the canonical player row.
ALTER TABLE public.team_roster
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.team_roster
  ADD COLUMN IF NOT EXISTS deleted_by TEXT;  -- Neon Auth user id of the actor

-- Permanent audit record that a deletion happened. Deliberately stores NO
-- PII (no original name/jersey) -- the whole point is to stop retaining the
-- child's personal information. requested_by is a free-text note of who asked
-- (e.g. a parent), kept for the COPPA paper trail.
CREATE TABLE IF NOT EXISTS public.player_deletion_log (
  id               SERIAL PRIMARY KEY,
  roster_id        INT REFERENCES public.team_roster(id) ON DELETE SET NULL,
  teamid           INT,
  deleted_by       TEXT,
  deleted_by_name  TEXT,
  requested_by     TEXT,
  reason           TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_player_deletion_log_roster_id
  ON public.player_deletion_log (roster_id);
