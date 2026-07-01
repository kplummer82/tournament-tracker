-- Adds an opt-in "include in-progress games" flag to scenario questions.
-- Used by tournament scenarios (and available to seasons): when false (default),
-- in-progress (status 3) games are treated as undecided and simulated; when true,
-- their current score is locked in as the result and counted in standings.
ALTER TABLE scenario_questions
  ADD COLUMN IF NOT EXISTS include_in_progress BOOLEAN NOT NULL DEFAULT false;
