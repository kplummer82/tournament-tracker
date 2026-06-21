-- Add an optional free-text notes field to teams. Notes may contain a URL,
-- which the team detail UI auto-links to an external site.
-- Run on the dev branch first, then ldqa + prod (per project DB conventions).

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS notes text;
