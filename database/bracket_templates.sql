-- Bracket layout templates (system library and, later, per-user).
-- Run in Neon to create the table.

CREATE TABLE IF NOT EXISTS public.bracket_templates (
  id            serial PRIMARY KEY,
  name          text NOT NULL,
  description   text,
  structure     jsonb NOT NULL,
  is_library    boolean NOT NULL DEFAULT true,
  created_at    timestamptz DEFAULT now(),
  created_by    int NULL,  -- NULL = system library; when auth exists, user id for "my library"
  bracket_type  text NULL CHECK (bracket_type IN ('single_elimination', 'double_elimination', 'march_madness', 'round_robin')),
  seed_count    int NULL
);

CREATE INDEX IF NOT EXISTS idx_bracket_templates_is_library ON public.bracket_templates(is_library);
CREATE INDEX IF NOT EXISTS idx_bracket_templates_created_by ON public.bracket_templates(created_by);
CREATE INDEX IF NOT EXISTS idx_bracket_templates_bracket_type ON public.bracket_templates(bracket_type);
CREATE INDEX IF NOT EXISTS idx_bracket_templates_seed_count ON public.bracket_templates(seed_count);

COMMENT ON TABLE public.bracket_templates IS 'Bracket layouts: structure (rounds/games). created_by NULL = system library; non-null = user library (when auth exists).';
COMMENT ON COLUMN public.bracket_templates.bracket_type IS 'One of: single_elimination, double_elimination, march_madness, round_robin.';
COMMENT ON COLUMN public.bracket_templates.seed_count IS 'Number of seeds/teams; denormalized from structure.numTeams for filtering.';

-- For existing tables (already created without bracket_type/seed_count), run instead:
-- database/bracket_templates_add_metadata.sql
-- Or manually:
-- ALTER TABLE public.bracket_templates ADD COLUMN IF NOT EXISTS bracket_type text NULL;
-- ALTER TABLE public.bracket_templates ADD COLUMN IF NOT EXISTS seed_count int NULL;
-- ALTER TABLE public.bracket_templates ADD CONSTRAINT bracket_templates_bracket_type_check CHECK (bracket_type IS NULL OR bracket_type IN ('single_elimination', 'double_elimination', 'march_madness', 'round_robin'));
-- CREATE INDEX IF NOT EXISTS idx_bracket_templates_bracket_type ON public.bracket_templates(bracket_type);
-- CREATE INDEX IF NOT EXISTS idx_bracket_templates_seed_count ON public.bracket_templates(seed_count);
-- Backfill: UPDATE public.bracket_templates SET seed_count = (structure->>'numTeams')::int WHERE structure ? 'numTeams' AND seed_count IS NULL;
-- Backfill type (if all existing are single-elim): UPDATE public.bracket_templates SET bracket_type = 'single_elimination' WHERE bracket_type IS NULL;
