-- Add simulation_method column to scenario_questions
-- Run on dev, LDQA, and prod branches.
ALTER TABLE scenario_questions
  ADD COLUMN IF NOT EXISTS simulation_method TEXT NOT NULL DEFAULT 'monte_carlo'
    CHECK (simulation_method IN ('monte_carlo', 'pythagorean'));
