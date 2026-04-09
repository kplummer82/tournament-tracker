-- Add display_name column for user-friendly labels
ALTER TABLE tiebreakers ADD COLUMN IF NOT EXISTS display_name TEXT;

UPDATE tiebreakers SET display_name = CASE tiebreaker
  WHEN 'wltpct' THEN 'Win-Loss Percentage'
  WHEN 'rundifferential' THEN 'Run Differential'
  WHEN 'runsscored' THEN 'Runs Scored'
  WHEN 'runsagainst' THEN 'Runs Allowed'
  WHEN 'adjusted_runs_scored' THEN 'Adjusted Runs Scored'
  WHEN 'adjusted_runs_against' THEN 'Adjusted Runs Allowed'
  WHEN 'adjusted_run_differential' THEN 'Adjusted Run Differential'
  WHEN 'head_to_head' THEN 'Head-to-Head'
  WHEN 'head_to_head_rundiff' THEN 'H2H Run Differential'
END;

-- Clean up descriptions to be concise one-liners
UPDATE tiebreakers SET tiebreakerdescription = CASE tiebreaker
  WHEN 'wltpct' THEN 'Wins count as 1, ties as 0.5, losses as 0 — divided by total games.'
  WHEN 'rundifferential' THEN 'Total runs scored minus total runs allowed.'
  WHEN 'runsscored' THEN 'Total runs scored across all games.'
  WHEN 'runsagainst' THEN 'Total runs allowed across all games. Lower is better.'
  WHEN 'adjusted_runs_scored' THEN 'Runs scored, capped at the max run differential limit per game.'
  WHEN 'adjusted_runs_against' THEN 'Runs allowed, capped at the max run differential limit per game. Lower is better.'
  WHEN 'adjusted_run_differential' THEN 'Run differential using capped scores per the max run diff limit.'
  WHEN 'head_to_head' THEN 'Win percentage among tied teams. Uses dominant-team transitive hierarchy when not all pairs have played each other.'
  WHEN 'head_to_head_rundiff' THEN 'Run differential (capped) against tied teams actually played. Skips only if no H2H games played.'
END;
