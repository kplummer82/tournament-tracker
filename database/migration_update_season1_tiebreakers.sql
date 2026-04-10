-- Swap season 1 tiebreakers: head_to_head → head_to_group, head_to_head_rundiff → head_to_group_rundiff
-- Reason: the 5 Mustang teams haven't all played each other, so the dominant-team fallback
-- in head_to_head was incorrectly resolving the tie instead of skipping to runs scored.
-- head_to_group is strictly Case A only (all pairs must have played) — correct behavior.
--
-- Run against the dev branch first: ep-billowing-dawn-afov8qma
-- Then replay on prod/LDQA branches when releasing.

-- Preview current config before changing (sanity check):
-- SELECT st.priority, tb.tiebreaker FROM season_tiebreakers st
-- JOIN tiebreakers tb ON tb.id = st.tiebreaker_id
-- WHERE st.season_id = 1 ORDER BY st.priority;

UPDATE season_tiebreakers
SET tiebreaker_id = (SELECT id FROM tiebreakers WHERE tiebreaker = 'head_to_group')
WHERE season_id = 1
  AND tiebreaker_id = (SELECT id FROM tiebreakers WHERE tiebreaker = 'head_to_head');

UPDATE season_tiebreakers
SET tiebreaker_id = (SELECT id FROM tiebreakers WHERE tiebreaker = 'head_to_group_rundiff')
WHERE season_id = 1
  AND tiebreaker_id = (SELECT id FROM tiebreakers WHERE tiebreaker = 'head_to_head_rundiff');
