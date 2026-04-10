-- Add sample_scenario column to scenario_questions
-- Stores a JSON array of SampleGameOutcome objects captured from the first
-- successful simulation run. Used to display a concrete "winning path" in the UI.

ALTER TABLE scenario_questions
  ADD COLUMN IF NOT EXISTS sample_scenario JSONB;
