-- Run this once if bracket_templates already exists without bracket_type/seed_count.
-- Safe to run: uses IF NOT EXISTS / ADD CONSTRAINT only if needed.

ALTER TABLE public.bracket_templates ADD COLUMN IF NOT EXISTS bracket_type text NULL;
ALTER TABLE public.bracket_templates ADD COLUMN IF NOT EXISTS seed_count int NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bracket_templates_bracket_type_check'
  ) THEN
    ALTER TABLE public.bracket_templates
      ADD CONSTRAINT bracket_templates_bracket_type_check
      CHECK (bracket_type IS NULL OR bracket_type IN ('single_elimination', 'double_elimination', 'march_madness', 'round_robin'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_bracket_templates_bracket_type ON public.bracket_templates(bracket_type);
CREATE INDEX IF NOT EXISTS idx_bracket_templates_seed_count ON public.bracket_templates(seed_count);

-- Backfill from structure
UPDATE public.bracket_templates
SET seed_count = (structure->>'numTeams')::int
WHERE structure ? 'numTeams' AND (seed_count IS NULL OR seed_count <> (structure->>'numTeams')::int);

-- Optional: set bracket_type for existing single-elim templates
-- UPDATE public.bracket_templates SET bracket_type = 'single_elimination' WHERE bracket_type IS NULL;
