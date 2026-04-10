-- Add 'or_worse' as a valid seed_mode value in scenario_questions
ALTER TABLE scenario_questions
  DROP CONSTRAINT IF EXISTS scenario_questions_seed_mode_check;

ALTER TABLE scenario_questions
  ADD CONSTRAINT scenario_questions_seed_mode_check
    CHECK (seed_mode IN ('exact', 'or_better', 'or_worse'));
