-- Add roster_positions table for player position capabilities
-- Run on dev, LDQA, and prod branches.
CREATE TABLE IF NOT EXISTS public.roster_positions (
  roster_id  int  NOT NULL REFERENCES public.team_roster(id) ON DELETE CASCADE,
  position   text NOT NULL,
  priority   text NOT NULL CHECK (priority IN ('primary', 'secondary')),
  PRIMARY KEY (roster_id, position)
);
