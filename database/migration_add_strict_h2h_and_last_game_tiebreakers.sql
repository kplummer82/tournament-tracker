-- Migration: add two new tiebreaker codes
--   1. head_to_head_strict_pair   — H2H that only applies when the tied group is
--      exactly 2 teams AND those teams have actually played each other. Otherwise
--      the tiebreaker is skipped. Unlike `head_to_head`, no dominant-team
--      fallback and no support for >2 tied teams.
--   2. last_game_actual_rundiff   — uncapped run differential in the chronologically
--      latest pool/regular-season game the team played. "ACTUAL" = NOT capped by
--      maxrundiff. Forfeits ARE counted (using forfeit_run_diff as the signed diff).
--      Skipped if the team has played zero qualifying games.
--
-- Safe to re-run (INSERT … WHERE NOT EXISTS).
-- Run order:
--   1. dev branch   (ep-billowing-dawn-afov8qma)
--   2. LDQA branch  (ep-calm-base-aft6o2gq)
--   3. prod branch  (ep-holy-moon-afan815c)

INSERT INTO tiebreakers (tiebreaker, "SortDirection", display_name, tiebreakerdescription)
SELECT
  'head_to_head_strict_pair',
  'DESC',
  'Head-to-Head (2 teams only)',
  'Head-to-head win percentage. Only applies when exactly two teams are tied AND those two teams have actually played each other. Skipped (does not affect ranking) for ties of 3+ teams or when the pair has not yet met.'
WHERE NOT EXISTS (
  SELECT 1 FROM tiebreakers WHERE tiebreaker = 'head_to_head_strict_pair'
);

-- Note: tiebreakerdescription column is capped at 250 chars.
INSERT INTO tiebreakers (tiebreaker, "SortDirection", display_name, tiebreakerdescription)
SELECT
  'last_game_actual_rundiff',
  'DESC',
  'Last Game Actual Run Diff',
  'Uncapped run differential in the team''s most recent pool game (by gamedate, then gametime). The max run diff cap does NOT apply. Forfeits ARE included using the season''s forfeit run diff. Skipped if the team played no pool games.'
WHERE NOT EXISTS (
  SELECT 1 FROM tiebreakers WHERE tiebreaker = 'last_game_actual_rundiff'
);
