-- Add as_of_date column to scenario_questions
-- Allows scenarios to be run against historical game state
-- Run on dev, LDQA, and prod Neon branches

ALTER TABLE scenario_questions ADD COLUMN IF NOT EXISTS as_of_date DATE;
