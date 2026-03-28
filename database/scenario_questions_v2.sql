-- Extend scenario_questions for the "first_round_matchup" question type.
-- Run on all DB branches (dev, ldqa, prod) after deploying the app changes.

-- 1. Add opponent_team_id (used by first_round_matchup; NULL for seed_achievable)
ALTER TABLE scenario_questions
  ADD COLUMN IF NOT EXISTS opponent_team_id INT;

-- 2. Make target_seed nullable (first_round_matchup doesn't use it)
ALTER TABLE scenario_questions
  ALTER COLUMN target_seed DROP NOT NULL,
  ALTER COLUMN target_seed DROP DEFAULT;

-- 3. Relax target_seed check to allow NULL
ALTER TABLE scenario_questions
  DROP CONSTRAINT IF EXISTS scenario_questions_target_seed_check;

ALTER TABLE scenario_questions
  ADD CONSTRAINT scenario_questions_target_seed_check
    CHECK (target_seed IS NULL OR target_seed >= 1);

-- 4. Add first_round_matchup to allowed question types
ALTER TABLE scenario_questions
  DROP CONSTRAINT IF EXISTS scenario_questions_question_type_check;

ALTER TABLE scenario_questions
  ADD CONSTRAINT scenario_questions_question_type_check
    CHECK (question_type IN ('seed_achievable', 'first_round_matchup'));
