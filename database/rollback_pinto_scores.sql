-- Rollback SMYB Pinto Spring 2026 scores (season_id = 2)
-- Resets all 51 completed games back to NULL scores and gamestatusid=1 (Scheduled)

UPDATE season_games SET homescore = NULL, awayscore = NULL, gamestatusid = 1
WHERE season_id = 2 AND game_type = 'regular'
  AND gamestatusid = 4
  AND gamedate IN (
    '2026-02-24', '2026-02-26', '2026-02-28',
    '2026-03-03', '2026-03-05', '2026-03-07',
    '2026-03-10', '2026-03-12', '2026-03-14',
    '2026-03-17', '2026-03-19', '2026-03-21'
  );
