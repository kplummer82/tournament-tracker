-- Walk-up song start time.
--
-- Teams rarely want a song from 0:00 — the recognisable part is usually a chorus
-- or a drop partway in. This stores where playback should begin, in whole
-- seconds from the start of the track.
--
-- Nullable: NULL means "start from the beginning", which is what every existing
-- row means today. The CHECK ceiling is an hour, comfortably past any real song
-- while still rejecting a fat-fingered paste.

ALTER TABLE public.team_roster
  ADD COLUMN IF NOT EXISTS walkup_song_start_seconds INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.team_roster'::regclass
      AND conname = 'team_roster_walkup_song_start_seconds_range'
  ) THEN
    ALTER TABLE public.team_roster
      ADD CONSTRAINT team_roster_walkup_song_start_seconds_range
      CHECK (walkup_song_start_seconds IS NULL
             OR (walkup_song_start_seconds >= 0 AND walkup_song_start_seconds <= 3600));
  END IF;
END $$;

COMMENT ON COLUMN public.team_roster.walkup_song_start_seconds IS
  'Where the walk-up song should start playing, in whole seconds. NULL = from the beginning.';
