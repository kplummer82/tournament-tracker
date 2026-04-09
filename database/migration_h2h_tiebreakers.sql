-- Migration: Replace 4 H2H tiebreaker codes with 2 new ones using dominant-team algorithm.
--
-- Run order:
--   1. dev branch   (ep-billowing-dawn-afov8qma)
--   2. LDQA branch  (ep-calm-base-aft6o2gq)
--   3. prod branch  (ep-holy-moon-afan815c)
--
-- Steps:
--   a) Insert the two new tiebreaker codes (safe no-op if already present)
--   b) Migrate season references from old codes to new codes
--   c) Migrate tournament references from old codes to new codes
--   d) Delete old codes (cascade-safe: references already migrated)

-- ── a) Insert new codes ────────────────────────────────────────────────────────
INSERT INTO tiebreakers (tiebreaker, "SortDirection", tiebreakerdescription, display_name)
SELECT 'head_to_head', 'DESC',
  'Win percentage among tied teams. Uses dominant-team transitive hierarchy when not all pairs have played each other.',
  'Head-to-Head'
WHERE NOT EXISTS (SELECT 1 FROM tiebreakers WHERE tiebreaker = 'head_to_head');

INSERT INTO tiebreakers (tiebreaker, "SortDirection", tiebreakerdescription, display_name)
SELECT 'head_to_head_rundiff', 'DESC',
  'Run differential (capped) against tied teams actually played. Skips only if no H2H games played.',
  'H2H Run Differential'
WHERE NOT EXISTS (SELECT 1 FROM tiebreakers WHERE tiebreaker = 'head_to_head_rundiff');

-- ── b) Migrate season_tiebreakers ────────────────────────────────────────────
UPDATE season_tiebreakers
SET tiebreaker_id = (SELECT id FROM tiebreakers WHERE tiebreaker = 'head_to_head')
WHERE tiebreaker_id IN (
  SELECT id FROM tiebreakers
  WHERE tiebreaker IN ('head_to_head_strict', 'head_to_head_permissive')
);

UPDATE season_tiebreakers
SET tiebreaker_id = (SELECT id FROM tiebreakers WHERE tiebreaker = 'head_to_head_rundiff')
WHERE tiebreaker_id IN (
  SELECT id FROM tiebreakers
  WHERE tiebreaker IN ('head_to_head_rundiff_strict', 'head_to_head_rundiff_permissive')
);

-- ── c) Migrate tournamenttiebreakers ─────────────────────────────────────────
UPDATE tournamenttiebreakers
SET tiebreakerid = (SELECT id FROM tiebreakers WHERE tiebreaker = 'head_to_head')
WHERE tiebreakerid IN (
  SELECT id FROM tiebreakers
  WHERE tiebreaker IN ('head_to_head_strict', 'head_to_head_permissive')
);

UPDATE tournamenttiebreakers
SET tiebreakerid = (SELECT id FROM tiebreakers WHERE tiebreaker = 'head_to_head_rundiff')
WHERE tiebreakerid IN (
  SELECT id FROM tiebreakers
  WHERE tiebreaker IN ('head_to_head_rundiff_strict', 'head_to_head_rundiff_permissive')
);

-- ── d) Delete old codes ────────────────────────────────────────────────────────
DELETE FROM tiebreakers
WHERE tiebreaker IN (
  'head_to_head_strict',
  'head_to_head_permissive',
  'head_to_head_rundiff_strict',
  'head_to_head_rundiff_permissive'
);
