-- Roster positions become per-author: every coach/admin keeps their own set of
-- position ratings for a player, and the roster UI rolls them up into a
-- consensus view. Previously the table was keyed on (roster_id, position) with
-- no author, so whichever coach saved last silently overwrote everyone else.
--
-- The pre-existing rows carry no author and are intentionally discarded.
-- Position ratings are staff-only data (admins + team managers); see the
-- requireTeamAccess gates on the two positions API routes.
--
-- Run on dev branch first, then LDQA, then prod.

-- Only rebuild if the table is still the old authorless shape. Guarded so a
-- re-run never wipes real per-coach data.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'roster_positions')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'roster_positions'
               AND column_name = 'author_user_id')
  THEN
    DROP TABLE public.roster_positions;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.roster_positions (
  roster_id      int  NOT NULL REFERENCES public.team_roster(id) ON DELETE CASCADE,
  author_user_id text NOT NULL,  -- Neon Auth user id; no FK (managed neon_auth schema)
  position       text NOT NULL CHECK (position IN ('P','C','1B','2B','3B','SS','LF','CF','RF')),
  priority       text NOT NULL CHECK (priority IN ('primary','secondary')),
  updated_at     timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (roster_id, author_user_id, position)
);

CREATE INDEX IF NOT EXISTS idx_roster_positions_roster ON public.roster_positions(roster_id);
CREATE INDEX IF NOT EXISTS idx_roster_positions_author ON public.roster_positions(author_user_id);
