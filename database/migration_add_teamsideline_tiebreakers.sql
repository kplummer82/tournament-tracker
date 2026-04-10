-- Add the full TeamSideline tiebreaker suite to the tiebreakers table.
-- Any reference to "points" becomes "runs" per our app convention.
-- Run against the dev branch first: ep-billowing-dawn-afov8qma
-- Then replay on prod/LDQA branches when releasing.

INSERT INTO tiebreakers (tiebreaker, "SortDirection", display_name, tiebreakerdescription)
VALUES
  (
    'head_to_group',
    'DESC',
    'Head-to-Group',
    'Win percentage among tied teams. All teams must have played each other at least once — unlike Head-to-Head, no dominant-team fallback is used.'
  ),
  (
    'head_to_group_rundiff',
    'DESC',
    'H2G Run Differential',
    'Run differential (capped) against tied teams. All teams must have played each other at least once; skips if any pair has not played.'
  ),
  (
    'head_to_head_runs_against',
    'ASC',
    'H2H Runs Against',
    'Runs scored against this team by tied opponents actually played. Lower is better. Uses dominant-team hierarchy when not all pairs have played.'
  ),
  (
    'head_to_group_runs_against',
    'ASC',
    'H2G Runs Against',
    'Runs scored against this team by tied opponents. Lower is better. All teams must have played each other at least once; skips if any pair has not played.'
  ),
  (
    'common_opponents',
    'DESC',
    'Common Opponents',
    'Wins against opponents that every tied team has played at least once. Skips if no common opponents exist.'
  ),
  (
    'strength_of_schedule',
    'DESC',
    'Strength of Schedule',
    'Combined winning percentage of all opponents played. Higher percentage means a harder schedule.'
  ),
  (
    'average_run_differential',
    'DESC',
    'Avg Run Differential',
    'Run differential divided by games played.'
  ),
  (
    'average_runs_scored',
    'DESC',
    'Avg Runs Scored',
    'Runs scored divided by games played.'
  ),
  (
    'average_runs_against',
    'ASC',
    'Avg Runs Against',
    'Runs allowed divided by games played. Lower is better.'
  ),
  (
    'fewest_forfeits',
    'ASC',
    'Fewest Forfeits',
    'Number of games this team was responsible for forfeiting across the entire season. Lower is better.'
  ),
  (
    'coin_toss',
    'DESC',
    'Coin Toss',
    'Deterministic pseudo-random tiebreaker based on team ID. Stable across queries. Typically used as the final tiebreaker of last resort.'
  );
