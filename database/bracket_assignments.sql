-- Which team is assigned to each seed (1..n) for a tournament's bracket.
-- Run in Neon after tournament_bracket exists.

CREATE TABLE IF NOT EXISTS public.bracket_assignments (
  tournament_id int NOT NULL REFERENCES public.tournament_bracket(tournament_id) ON DELETE CASCADE,
  seed_index    int NOT NULL CHECK (seed_index >= 1),
  team_id       int NOT NULL REFERENCES public.teams(teamid) ON DELETE CASCADE,
  PRIMARY KEY (tournament_id, seed_index)
);

CREATE INDEX IF NOT EXISTS idx_bracket_assignments_tournament_id ON public.bracket_assignments(tournament_id);
CREATE INDEX IF NOT EXISTS idx_bracket_assignments_team_id ON public.bracket_assignments(team_id);

COMMENT ON TABLE public.bracket_assignments IS 'Maps seed 1..n to team for a tournament bracket.';
