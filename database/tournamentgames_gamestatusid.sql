-- Add game status to tournamentgames so Edit Game can persist status.
-- Run once in Neon SQL editor.

ALTER TABLE public.tournamentgames
  ADD COLUMN IF NOT EXISTS gamestatusid integer;

COMMENT ON COLUMN public.tournamentgames.gamestatusid IS 'References gamestatusoptions.id or gamestatus lookup for Scheduled/In Progress/Completed etc.';
