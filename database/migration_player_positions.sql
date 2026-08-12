-- Add roster_positions table for player position capabilities
-- Run on dev, LDQA, and prod branches.
--
-- SUPERSEDED by database/migration_roster_positions_per_coach.sql, which
-- rebuilds this table with an author_user_id so each coach keeps their own set
-- of ratings. Apply that file after this one on any fresh branch.
CREATE TABLE IF NOT EXISTS public.roster_positions (
  roster_id  int  NOT NULL REFERENCES public.team_roster(id) ON DELETE CASCADE,
  position   text NOT NULL,
  priority   text NOT NULL CHECK (priority IN ('primary', 'secondary')),
  PRIMARY KEY (roster_id, position)
);
