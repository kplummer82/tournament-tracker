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
  WHEN 'head_to_head_strict' THEN 'Head-to-Head (Strict)'
  WHEN 'head_to_head_permissive' THEN 'Head-to-Head (Permissive)'
  WHEN 'head_to_head_rundiff_strict' THEN 'H2H Run Diff (Strict)'
  WHEN 'head_to_head_rundiff_permissive' THEN 'H2H Run Diff (Permissive)'
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
  WHEN 'head_to_head_strict' THEN 'Win percentage among tied teams only. Requires all tied teams to have played each other.'
  WHEN 'head_to_head_permissive' THEN 'Win percentage among tied teams. Applied even if not all tied teams have played each other.'
  WHEN 'head_to_head_rundiff_strict' THEN 'Run differential among tied teams only. Requires all tied teams to have played each other.'
  WHEN 'head_to_head_rundiff_permissive' THEN 'Run differential among tied teams. Applied even if not all tied teams have played each other.'
END;
