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

-- New tiebreakers added with the TeamSideline suite (migration_add_teamsideline_tiebreakers.sql)
UPDATE tiebreakers SET display_name = 'Head-to-Group',        tiebreakerdescription = 'Win percentage among tied teams. All teams must have played each other at least once — unlike Head-to-Head, no dominant-team fallback is used.'                                                   WHERE tiebreaker = 'head_to_group';
UPDATE tiebreakers SET display_name = 'H2G Run Differential', tiebreakerdescription = 'Run differential (capped) against tied teams. All teams must have played each other at least once; skips if any pair has not played.'                                                             WHERE tiebreaker = 'head_to_group_rundiff';
UPDATE tiebreakers SET display_name = 'H2H Runs Against',     tiebreakerdescription = 'Runs scored against this team by tied opponents actually played. Lower is better. Uses dominant-team hierarchy when not all pairs have played.'                                                    WHERE tiebreaker = 'head_to_head_runs_against';
UPDATE tiebreakers SET display_name = 'H2G Runs Against',     tiebreakerdescription = 'Runs scored against this team by tied opponents. Lower is better. All teams must have played each other at least once; skips if any pair has not played.'                                        WHERE tiebreaker = 'head_to_group_runs_against';
UPDATE tiebreakers SET display_name = 'Common Opponents',     tiebreakerdescription = 'Wins against opponents that every tied team has played at least once. Skips if no common opponents exist.'                                                                                        WHERE tiebreaker = 'common_opponents';
UPDATE tiebreakers SET display_name = 'Strength of Schedule', tiebreakerdescription = 'Combined winning percentage of all opponents played. Higher percentage means a harder schedule.'                                                                                                  WHERE tiebreaker = 'strength_of_schedule';
UPDATE tiebreakers SET display_name = 'Avg Run Differential', tiebreakerdescription = 'Run differential divided by games played.'                                                                                                                                                        WHERE tiebreaker = 'average_run_differential';
UPDATE tiebreakers SET display_name = 'Avg Runs Scored',      tiebreakerdescription = 'Runs scored divided by games played.'                                                                                                                                                             WHERE tiebreaker = 'average_runs_scored';
UPDATE tiebreakers SET display_name = 'Avg Runs Against',     tiebreakerdescription = 'Runs allowed divided by games played. Lower is better.'                                                                                                                                          WHERE tiebreaker = 'average_runs_against';
UPDATE tiebreakers SET display_name = 'Fewest Forfeits',      tiebreakerdescription = 'Number of games this team was responsible for forfeiting across the entire season. Lower is better.'                                                                                              WHERE tiebreaker = 'fewest_forfeits';
UPDATE tiebreakers SET display_name = 'Coin Toss',            tiebreakerdescription = 'Deterministic pseudo-random tiebreaker based on team ID. Stable across queries. Typically used as the final tiebreaker of last resort.'                                                          WHERE tiebreaker = 'coin_toss';
