-- Migration: multi-bracket support for tournaments
-- Replaces 1:1 tournament_bracket + bracket_assignments with N:1 tournament_brackets + tournament_bracket_assignments

-- 1. New named brackets table (N:1 with tournament)
CREATE TABLE public.tournament_brackets (
  id          SERIAL PRIMARY KEY,
  tournament_id INT NOT NULL REFERENCES tournaments(tournamentid) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  sort_order  INT  NOT NULL DEFAULT 0,
  template_id INT  REFERENCES bracket_templates(id) ON DELETE SET NULL,
  structure   JSONB,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tournament_id, name)
);

-- 2. New seed assignments table (per-bracket)
CREATE TABLE public.tournament_bracket_assignments (
  bracket_id  INT NOT NULL REFERENCES tournament_brackets(id) ON DELETE CASCADE,
  seed_index  INT NOT NULL CHECK (seed_index >= 1),
  team_id     INT NOT NULL REFERENCES teams(teamid) ON DELETE CASCADE,
  PRIMARY KEY (bracket_id, seed_index)
);

-- 3. Migrate existing data: one row per tournament in tournament_bracket → first bracket named "Championship"
INSERT INTO public.tournament_brackets (tournament_id, name, sort_order, template_id, structure, updated_at)
SELECT tournament_id, 'Championship', 0, template_id, structure, updated_at
FROM public.tournament_bracket;

-- 4. Migrate existing seed assignments
INSERT INTO public.tournament_bracket_assignments (bracket_id, seed_index, team_id)
SELECT tb.id, ba.seed_index, ba.team_id
FROM public.bracket_assignments ba
JOIN public.tournament_brackets tb
  ON tb.tournament_id = ba.tournament_id AND tb.name = 'Championship';

-- 5. Drop old tables
DROP TABLE IF EXISTS public.bracket_assignments;
DROP TABLE IF EXISTS public.tournament_bracket;

-- 6. Index for fast lookups by tournament
CREATE INDEX ON public.tournament_brackets(tournament_id, sort_order);
