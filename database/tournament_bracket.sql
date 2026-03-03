-- One bracket per tournament: structure (from template or custom) and optional template link.
-- Run in Neon after bracket_templates and tournaments exist.

CREATE TABLE IF NOT EXISTS public.tournament_bracket (
  tournament_id int NOT NULL PRIMARY KEY REFERENCES public.tournaments(tournamentid) ON DELETE CASCADE,
  template_id   int NULL REFERENCES public.bracket_templates(id) ON DELETE SET NULL,
  structure     jsonb NOT NULL,
  updated_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tournament_bracket_template_id ON public.tournament_bracket(template_id);

COMMENT ON TABLE public.tournament_bracket IS 'Bracket applied to a tournament; structure copied from template or custom.';
