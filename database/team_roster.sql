-- Roster (players and staff) per team.
-- Run in Neon to create the table.

CREATE TABLE IF NOT EXISTS public.team_roster (
  id           serial PRIMARY KEY,
  teamid       int    NOT NULL REFERENCES public.teams(teamid) ON DELETE CASCADE,
  first_name   text   NOT NULL,
  last_name    text,
  role         text   NOT NULL CHECK (role IN ('player', 'staff')),
  jersey_number int,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_roster_teamid ON public.team_roster(teamid);

COMMENT ON TABLE public.team_roster IS 'Players and staff for a team; first_name and role required.';
