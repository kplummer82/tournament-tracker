-- Add schedule_config JSONB column to seasons table.
-- Stores auto-scheduling rules: date range, day rules, fields, blackout dates, constraints.
ALTER TABLE seasons
  ADD COLUMN IF NOT EXISTS schedule_config JSONB;
