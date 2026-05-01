-- Add matchup_distribution and most_likely_opponent_id columns for the new
-- "most_likely_matchup" scenario question type.

ALTER TABLE scenario_questions
  ADD COLUMN IF NOT EXISTS matchup_distribution JSONB,
  ADD COLUMN IF NOT EXISTS most_likely_opponent_id INT;

ALTER TABLE scenario_questions
  DROP CONSTRAINT IF EXISTS scenario_questions_question_type_check;

ALTER TABLE scenario_questions
  ADD CONSTRAINT scenario_questions_question_type_check
    CHECK (question_type IN ('seed_achievable', 'first_round_matchup', 'most_likely_seed', 'most_likely_matchup'));
