-- Add most_likely_seed and seed_distribution columns for the new
-- "most_likely_seed" scenario question type.

ALTER TABLE scenario_questions
  ADD COLUMN IF NOT EXISTS most_likely_seed INT,
  ADD COLUMN IF NOT EXISTS seed_distribution JSONB;

ALTER TABLE scenario_questions
  DROP CONSTRAINT IF EXISTS scenario_questions_question_type_check;

ALTER TABLE scenario_questions
  ADD CONSTRAINT scenario_questions_question_type_check
    CHECK (question_type IN ('seed_achievable', 'first_round_matchup', 'most_likely_seed'));
