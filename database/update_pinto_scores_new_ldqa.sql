-- Update SMYB Pinto Spring 2026 scores + locations (LDQA)
-- Source: sanmarcosyouthbaseball.com/schedule/649539/pinto
-- Comprehensive — all completed weeks (Weeks 2–6, 8–11 partial), 115 games total.
-- Run in Neon SQL console against the LDQA branch.
--
-- Uses a DO block so season_id is resolved by division name,
-- not hardcoded (IDs differ between dev/LDQA/prod).
--
-- Weeks 2–5 (home/away known): simple form.
-- Missing Week 5 + Weeks 6, 8, 9, 10, 11 (home/away uncertain): CASE form so
-- scores are assigned correctly regardless of which team the schedule made home.

DO $$
DECLARE
  v_sid INT;   -- season_id for Pinto Spring 2026
  v_lid INT;   -- location_id for Mission Sports Park
BEGIN
  -- Find Pinto Spring 2026 season
  SELECT s.id INTO v_sid
    FROM seasons s
    JOIN league_divisions ld ON s.league_division_id = ld.id
  WHERE ld.name = 'Pinto'
    AND s.year = 2026
    AND s.season_type = 'spring';

  IF v_sid IS NULL THEN RAISE EXCEPTION 'Pinto spring 2026 season not found'; END IF;
  RAISE NOTICE 'Pinto season_id = %', v_sid;

  -- Find Mission Sports Park location
  SELECT id INTO v_lid FROM locations WHERE name = 'Mission Sports Park';
  IF v_lid IS NULL THEN RAISE EXCEPTION 'Mission Sports Park location not found'; END IF;
  RAISE NOTICE 'Mission Sports Park location_id = %', v_lid;

  -- ============================================================
  -- Week 2 (Feb 24–28)
  -- ============================================================

  UPDATE season_games SET homescore = 15, awayscore =  5, gamestatusid = 4, location_id = v_lid
  WHERE season_id = v_sid AND gamedate = '2026-02-24'
    AND home = (SELECT teamid FROM teams WHERE name = 'Blue Jays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Astros'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore =  4, awayscore =  3, gamestatusid = 4, location_id = v_lid
  WHERE season_id = v_sid AND gamedate = '2026-02-24'
    AND home = (SELECT teamid FROM teams WHERE name = 'Mariners' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Cubs'     AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore =  8, awayscore =  9, gamestatusid = 4, location_id = v_lid
  WHERE season_id = v_sid AND gamedate = '2026-02-26'
    AND home = (SELECT teamid FROM teams WHERE name = 'Yankees' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Red Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore =  7, awayscore = 11, gamestatusid = 4, location_id = v_lid
  WHERE season_id = v_sid AND gamedate = '2026-02-26'
    AND home = (SELECT teamid FROM teams WHERE name = 'Athletics' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Braves'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore =  5, awayscore =  0, gamestatusid = 4, location_id = v_lid
  WHERE season_id = v_sid AND gamedate = '2026-02-28'
    AND home = (SELECT teamid FROM teams WHERE name = 'Rays'     AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Mariners' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 10, awayscore = 12, gamestatusid = 4, location_id = v_lid
  WHERE season_id = v_sid AND gamedate = '2026-02-28'
    AND home = (SELECT teamid FROM teams WHERE name = 'Dodgers' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Red Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore =  9, awayscore = 10, gamestatusid = 4, location_id = v_lid
  WHERE season_id = v_sid AND gamedate = '2026-02-28'
    AND home = (SELECT teamid FROM teams WHERE name = 'Athletics' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Astros'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore =  2, awayscore = 17, gamestatusid = 4, location_id = v_lid
  WHERE season_id = v_sid AND gamedate = '2026-02-28'
    AND home = (SELECT teamid FROM teams WHERE name = 'Orioles'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Blue Jays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore =  7, awayscore =  4, gamestatusid = 4, location_id = v_lid
  WHERE season_id = v_sid AND gamedate = '2026-02-28'
    AND home = (SELECT teamid FROM teams WHERE name = 'Braves' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Padres' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 12, awayscore =  8, gamestatusid = 4, location_id = v_lid
  WHERE season_id = v_sid AND gamedate = '2026-02-28'
    AND home = (SELECT teamid FROM teams WHERE name = 'Yankees' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Giants'  AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore =  8, awayscore =  9, gamestatusid = 4, location_id = v_lid
  WHERE season_id = v_sid AND gamedate = '2026-02-28'
    AND home = (SELECT teamid FROM teams WHERE name = 'Brewers'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'White Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore =  6, awayscore = 10, gamestatusid = 4, location_id = v_lid
  WHERE season_id = v_sid AND gamedate = '2026-02-28'
    AND home = (SELECT teamid FROM teams WHERE name = 'Angels'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Nationals' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 10, awayscore =  9, gamestatusid = 4, location_id = v_lid
  WHERE season_id = v_sid AND gamedate = '2026-02-28'
    AND home = (SELECT teamid FROM teams WHERE name = 'Rockies' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Marlins' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 14, awayscore =  4, gamestatusid = 4, location_id = v_lid
  WHERE season_id = v_sid AND gamedate = '2026-02-28'
    AND home = (SELECT teamid FROM teams WHERE name = 'Cubs'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Pirates' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- ============================================================
  -- Week 3 (Mar 3–7)
  -- ============================================================

  UPDATE season_games SET homescore = 16, awayscore =  9, gamestatusid = 4, location_id = v_lid
  WHERE season_id = v_sid AND gamedate = '2026-03-03'
    AND home = (SELECT teamid FROM teams WHERE name = 'Nationals' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Orioles'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 10, awayscore =  6, gamestatusid = 4, location_id = v_lid
  WHERE season_id = v_sid AND gamedate = '2026-03-03'
    AND home = (SELECT teamid FROM teams WHERE name = 'Padres'  AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Marlins' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore =  9, awayscore = 12, gamestatusid = 4, location_id = v_lid
  WHERE season_id = v_sid AND gamedate = '2026-03-05'
    AND home = (SELECT teamid FROM teams WHERE name = 'Dodgers' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Giants'  AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 10, awayscore =  8, gamestatusid = 4, location_id = v_lid
  WHERE season_id = v_sid AND gamedate = '2026-03-05'
    AND home = (SELECT teamid FROM teams WHERE name = 'White Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Rays'      AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore =  9, awayscore = 11, gamestatusid = 4, location_id = v_lid
  WHERE season_id = v_sid AND gamedate = '2026-03-07'
    AND home = (SELECT teamid FROM teams WHERE name = 'Giants'  AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Orioles' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore =  9, awayscore = 13, gamestatusid = 4, location_id = v_lid
  WHERE season_id = v_sid AND gamedate = '2026-03-07'
    AND home = (SELECT teamid FROM teams WHERE name = 'Mariners' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Braves'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore =  1, awayscore = 14, gamestatusid = 4, location_id = v_lid
  WHERE season_id = v_sid AND gamedate = '2026-03-07'
    AND home = (SELECT teamid FROM teams WHERE name = 'Marlins' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Brewers' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- Red Sox 7, Athletics 7 — TIE (2026-03-07)
  UPDATE season_games SET homescore =  7, awayscore =  7, gamestatusid = 4, location_id = v_lid
  WHERE season_id = v_sid AND gamedate = '2026-03-07'
    AND home = (SELECT teamid FROM teams WHERE name = 'Red Sox'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Athletics' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 12, awayscore =  9, gamestatusid = 4, location_id = v_lid
  WHERE season_id = v_sid AND gamedate = '2026-03-07'
    AND home = (SELECT teamid FROM teams WHERE name = 'Padres'  AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Dodgers' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 15, awayscore =  6, gamestatusid = 4, location_id = v_lid
  WHERE season_id = v_sid AND gamedate = '2026-03-07'
    AND home = (SELECT teamid FROM teams WHERE name = 'White Sox'  AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Nationals'  AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 11, awayscore = 20, gamestatusid = 4, location_id = v_lid
  WHERE season_id = v_sid AND gamedate = '2026-03-07'
    AND home = (SELECT teamid FROM teams WHERE name = 'Astros'  AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Pirates' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore =  7, awayscore =  9, gamestatusid = 4, location_id = v_lid
  WHERE season_id = v_sid AND gamedate = '2026-03-07'
    AND home = (SELECT teamid FROM teams WHERE name = 'Rockies' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Rays'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 10, awayscore =  6, gamestatusid = 4, location_id = v_lid
  WHERE season_id = v_sid AND gamedate = '2026-03-07'
    AND home = (SELECT teamid FROM teams WHERE name = 'Blue Jays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Cubs'      AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore =  7, awayscore =  3, gamestatusid = 4, location_id = v_lid
  WHERE season_id = v_sid AND gamedate = '2026-03-07'
    AND home = (SELECT teamid FROM teams WHERE name = 'Angels'  AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Yankees' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- ============================================================
  -- Week 4 (Mar 10–14)
  -- ============================================================

  UPDATE season_games SET homescore = 11, awayscore =  2, gamestatusid = 4, location_id = v_lid
  WHERE season_id = v_sid AND gamedate = '2026-03-10'
    AND home = (SELECT teamid FROM teams WHERE name = 'Pirates' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Angels'  AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore =  7, awayscore =  1, gamestatusid = 4, location_id = v_lid
  WHERE season_id = v_sid AND gamedate = '2026-03-10'
    AND home = (SELECT teamid FROM teams WHERE name = 'Brewers'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Athletics' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 12, awayscore = 11, gamestatusid = 4, location_id = v_lid
  WHERE season_id = v_sid AND gamedate = '2026-03-12'
    AND home = (SELECT teamid FROM teams WHERE name = 'Rockies' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Cubs'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 15, awayscore = 10, gamestatusid = 4, location_id = v_lid
  WHERE season_id = v_sid AND gamedate = '2026-03-12'
    AND home = (SELECT teamid FROM teams WHERE name = 'Braves'     AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Blue Jays'  AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore =  6, awayscore = 10, gamestatusid = 4, location_id = v_lid
  WHERE season_id = v_sid AND gamedate = '2026-03-14'
    AND home = (SELECT teamid FROM teams WHERE name = 'Red Sox'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Blue Jays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore =  6, awayscore = 19, gamestatusid = 4, location_id = v_lid
  WHERE season_id = v_sid AND gamedate = '2026-03-14'
    AND home = (SELECT teamid FROM teams WHERE name = 'Athletics' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Pirates'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore =  4, awayscore = 21, gamestatusid = 4, location_id = v_lid
  WHERE season_id = v_sid AND gamedate = '2026-03-14'
    AND home = (SELECT teamid FROM teams WHERE name = 'Dodgers'  AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Mariners' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 12, awayscore =  9, gamestatusid = 4, location_id = v_lid
  WHERE season_id = v_sid AND gamedate = '2026-03-14'
    AND home = (SELECT teamid FROM teams WHERE name = 'Astros' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Padres' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore =  9, awayscore = 15, gamestatusid = 4, location_id = v_lid
  WHERE season_id = v_sid AND gamedate = '2026-03-14'
    AND home = (SELECT teamid FROM teams WHERE name = 'Rays'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Brewers' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 10, awayscore = 18, gamestatusid = 4, location_id = v_lid
  WHERE season_id = v_sid AND gamedate = '2026-03-14'
    AND home = (SELECT teamid FROM teams WHERE name = 'Orioles' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Angels'  AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 13, awayscore =  8, gamestatusid = 4, location_id = v_lid
  WHERE season_id = v_sid AND gamedate = '2026-03-14'
    AND home = (SELECT teamid FROM teams WHERE name = 'Braves'  AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Rockies' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 10, awayscore = 26, gamestatusid = 4, location_id = v_lid
  WHERE season_id = v_sid AND gamedate = '2026-03-14'
    AND home = (SELECT teamid FROM teams WHERE name = 'Yankees'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'White Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore =  8, awayscore = 19, gamestatusid = 4, location_id = v_lid
  WHERE season_id = v_sid AND gamedate = '2026-03-14'
    AND home = (SELECT teamid FROM teams WHERE name = 'Cubs'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Giants' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 24, awayscore = 15, gamestatusid = 4, location_id = v_lid
  WHERE season_id = v_sid AND gamedate = '2026-03-14'
    AND home = (SELECT teamid FROM teams WHERE name = 'Nationals' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Marlins'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- ============================================================
  -- Week 5 (Mar 17–21) — all games including previously missing ones
  -- ============================================================

  UPDATE season_games SET homescore = 10, awayscore = 12, gamestatusid = 4, location_id = v_lid
  WHERE season_id = v_sid AND gamedate = '2026-03-17'
    AND home = (SELECT teamid FROM teams WHERE name = 'Astros'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'White Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore =  8, awayscore =  7, gamestatusid = 4, location_id = v_lid
  WHERE season_id = v_sid AND gamedate = '2026-03-17'
    AND home = (SELECT teamid FROM teams WHERE name = 'Giants'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Mariners' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 11, awayscore = 10, gamestatusid = 4, location_id = v_lid
  WHERE season_id = v_sid AND gamedate = '2026-03-19'
    AND home = (SELECT teamid FROM teams WHERE name = 'Yankees' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Orioles' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- Padres 11, Red Sox 5 (2026-03-19) — CASE: home/away unknown
  UPDATE season_games SET gamestatusid = 4, location_id = v_lid,
    homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Padres'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 11 ELSE  5 END,
    awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Padres'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN  5 ELSE 11 END
  WHERE season_id = v_sid AND gamedate = '2026-03-19'
    AND home IN (SELECT teamid FROM teams WHERE name IN ('Padres','Red Sox') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away IN (SELECT teamid FROM teams WHERE name IN ('Padres','Red Sox') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 11, awayscore = 14, gamestatusid = 4, location_id = v_lid
  WHERE season_id = v_sid AND gamedate = '2026-03-21'
    AND home = (SELECT teamid FROM teams WHERE name = 'Marlins' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Yankees' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- Orioles 13, White Sox 4 (2026-03-21) — CASE
  UPDATE season_games SET gamestatusid = 4, location_id = v_lid,
    homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Orioles'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 13 ELSE  4 END,
    awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Orioles'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN  4 ELSE 13 END
  WHERE season_id = v_sid AND gamedate = '2026-03-21'
    AND home IN (SELECT teamid FROM teams WHERE name IN ('Orioles','White Sox') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away IN (SELECT teamid FROM teams WHERE name IN ('Orioles','White Sox') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- Nationals 15, Rays 11 (2026-03-21) — CASE
  UPDATE season_games SET gamestatusid = 4, location_id = v_lid,
    homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Nationals' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 15 ELSE 11 END,
    awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Nationals' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 11 ELSE 15 END
  WHERE season_id = v_sid AND gamedate = '2026-03-21'
    AND home IN (SELECT teamid FROM teams WHERE name IN ('Nationals','Rays') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away IN (SELECT teamid FROM teams WHERE name IN ('Nationals','Rays') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- Cubs 11, Angels 7 (2026-03-21) — CASE
  UPDATE season_games SET gamestatusid = 4, location_id = v_lid,
    homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Cubs'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 11 ELSE  7 END,
    awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Cubs'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN  7 ELSE 11 END
  WHERE season_id = v_sid AND gamedate = '2026-03-21'
    AND home IN (SELECT teamid FROM teams WHERE name IN ('Cubs','Angels') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away IN (SELECT teamid FROM teams WHERE name IN ('Cubs','Angels') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- Athletics 15, Blue Jays 15 — TIE (2026-03-21)
  UPDATE season_games SET homescore = 15, awayscore = 15, gamestatusid = 4, location_id = v_lid
  WHERE season_id = v_sid AND gamedate = '2026-03-21'
    AND home = (SELECT teamid FROM teams WHERE name = 'Athletics' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Blue Jays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 15, awayscore =  7, gamestatusid = 4, location_id = v_lid
  WHERE season_id = v_sid AND gamedate = '2026-03-21'
    AND home = (SELECT teamid FROM teams WHERE name = 'Dodgers' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Rockies' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- Astros 11, Mariners 4 (2026-03-21) — CASE
  UPDATE season_games SET gamestatusid = 4, location_id = v_lid,
    homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Astros'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 11 ELSE  4 END,
    awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Astros'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN  4 ELSE 11 END
  WHERE season_id = v_sid AND gamedate = '2026-03-21'
    AND home IN (SELECT teamid FROM teams WHERE name IN ('Astros','Mariners') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away IN (SELECT teamid FROM teams WHERE name IN ('Astros','Mariners') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 20, awayscore =  8, gamestatusid = 4, location_id = v_lid
  WHERE season_id = v_sid AND gamedate = '2026-03-21'
    AND home = (SELECT teamid FROM teams WHERE name = 'Giants'  AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Red Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore =  9, awayscore =  7, gamestatusid = 4, location_id = v_lid
  WHERE season_id = v_sid AND gamedate = '2026-03-21'
    AND home = (SELECT teamid FROM teams WHERE name = 'Pirates' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Padres'  AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 15, awayscore = 14, gamestatusid = 4, location_id = v_lid
  WHERE season_id = v_sid AND gamedate = '2026-03-21'
    AND home = (SELECT teamid FROM teams WHERE name = 'Brewers' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Braves'  AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- ============================================================
  -- Week 6 (Mar 24–28)
  -- ============================================================

  -- Nationals 13, Brewers 4 (2026-03-24)
  UPDATE season_games SET gamestatusid = 4, location_id = v_lid,
    homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Nationals' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 13 ELSE  4 END,
    awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Nationals' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN  4 ELSE 13 END
  WHERE season_id = v_sid AND gamedate = '2026-03-24'
    AND home IN (SELECT teamid FROM teams WHERE name IN ('Nationals','Brewers') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away IN (SELECT teamid FROM teams WHERE name IN ('Nationals','Brewers') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- Pirates 18, Dodgers 3 (2026-03-24)
  UPDATE season_games SET gamestatusid = 4, location_id = v_lid,
    homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Pirates'  AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 18 ELSE  3 END,
    awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Pirates'  AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN  3 ELSE 18 END
  WHERE season_id = v_sid AND gamedate = '2026-03-24'
    AND home IN (SELECT teamid FROM teams WHERE name IN ('Pirates','Dodgers') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away IN (SELECT teamid FROM teams WHERE name IN ('Pirates','Dodgers') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- Angels 15, Rockies 5 (2026-03-26)
  UPDATE season_games SET gamestatusid = 4, location_id = v_lid,
    homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Angels'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 15 ELSE  5 END,
    awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Angels'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN  5 ELSE 15 END
  WHERE season_id = v_sid AND gamedate = '2026-03-26'
    AND home IN (SELECT teamid FROM teams WHERE name IN ('Angels','Rockies') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away IN (SELECT teamid FROM teams WHERE name IN ('Angels','Rockies') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- Rays 16, Marlins 13 (2026-03-26)
  UPDATE season_games SET gamestatusid = 4, location_id = v_lid,
    homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Rays'     AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 16 ELSE 13 END,
    awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Rays'     AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 13 ELSE 16 END
  WHERE season_id = v_sid AND gamedate = '2026-03-26'
    AND home IN (SELECT teamid FROM teams WHERE name IN ('Rays','Marlins') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away IN (SELECT teamid FROM teams WHERE name IN ('Rays','Marlins') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- Nationals 11, Braves 5 (2026-03-28)
  UPDATE season_games SET gamestatusid = 4, location_id = v_lid,
    homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Nationals' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 11 ELSE  5 END,
    awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Nationals' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN  5 ELSE 11 END
  WHERE season_id = v_sid AND gamedate = '2026-03-28'
    AND home IN (SELECT teamid FROM teams WHERE name IN ('Nationals','Braves') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away IN (SELECT teamid FROM teams WHERE name IN ('Nationals','Braves') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- Blue Jays 13, Giants 10 (2026-03-28)
  UPDATE season_games SET gamestatusid = 4, location_id = v_lid,
    homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Blue Jays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 13 ELSE 10 END,
    awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Blue Jays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 10 ELSE 13 END
  WHERE season_id = v_sid AND gamedate = '2026-03-28'
    AND home IN (SELECT teamid FROM teams WHERE name IN ('Blue Jays','Giants') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away IN (SELECT teamid FROM teams WHERE name IN ('Blue Jays','Giants') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- Yankees 14, Rays 8 (2026-03-28)
  UPDATE season_games SET gamestatusid = 4, location_id = v_lid,
    homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Yankees'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 14 ELSE  8 END,
    awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Yankees'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN  8 ELSE 14 END
  WHERE season_id = v_sid AND gamedate = '2026-03-28'
    AND home IN (SELECT teamid FROM teams WHERE name IN ('Yankees','Rays') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away IN (SELECT teamid FROM teams WHERE name IN ('Yankees','Rays') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- Brewers 12, Dodgers 11 (2026-03-28)
  UPDATE season_games SET gamestatusid = 4, location_id = v_lid,
    homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Brewers'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 12 ELSE 11 END,
    awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Brewers'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 11 ELSE 12 END
  WHERE season_id = v_sid AND gamedate = '2026-03-28'
    AND home IN (SELECT teamid FROM teams WHERE name IN ('Brewers','Dodgers') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away IN (SELECT teamid FROM teams WHERE name IN ('Brewers','Dodgers') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- Cubs 12, White Sox 7 (2026-03-28)
  UPDATE season_games SET gamestatusid = 4, location_id = v_lid,
    homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Cubs'      AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 12 ELSE  7 END,
    awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Cubs'      AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN  7 ELSE 12 END
  WHERE season_id = v_sid AND gamedate = '2026-03-28'
    AND home IN (SELECT teamid FROM teams WHERE name IN ('Cubs','White Sox') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away IN (SELECT teamid FROM teams WHERE name IN ('Cubs','White Sox') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- Pirates 21, Mariners 8 (2026-03-28)
  UPDATE season_games SET gamestatusid = 4, location_id = v_lid,
    homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Pirates'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 21 ELSE  8 END,
    awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Pirates'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN  8 ELSE 21 END
  WHERE season_id = v_sid AND gamedate = '2026-03-28'
    AND home IN (SELECT teamid FROM teams WHERE name IN ('Pirates','Mariners') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away IN (SELECT teamid FROM teams WHERE name IN ('Pirates','Mariners') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- Padres 13, Athletics 12 (2026-03-28)
  UPDATE season_games SET gamestatusid = 4, location_id = v_lid,
    homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Padres'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 13 ELSE 12 END,
    awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Padres'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 12 ELSE 13 END
  WHERE season_id = v_sid AND gamedate = '2026-03-28'
    AND home IN (SELECT teamid FROM teams WHERE name IN ('Padres','Athletics') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away IN (SELECT teamid FROM teams WHERE name IN ('Padres','Athletics') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- Rockies 12, Red Sox 4 (2026-03-28)
  UPDATE season_games SET gamestatusid = 4, location_id = v_lid,
    homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Rockies'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 12 ELSE  4 END,
    awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Rockies'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN  4 ELSE 12 END
  WHERE season_id = v_sid AND gamedate = '2026-03-28'
    AND home IN (SELECT teamid FROM teams WHERE name IN ('Rockies','Red Sox') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away IN (SELECT teamid FROM teams WHERE name IN ('Rockies','Red Sox') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- Angels 6, Astros 6 — TIE (2026-03-28)
  UPDATE season_games SET homescore = 6, awayscore = 6, gamestatusid = 4, location_id = v_lid
  WHERE season_id = v_sid AND gamedate = '2026-03-28'
    AND home IN (SELECT teamid FROM teams WHERE name IN ('Angels','Astros') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away IN (SELECT teamid FROM teams WHERE name IN ('Angels','Astros') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- Orioles 21, Marlins 8 (2026-03-28)
  UPDATE season_games SET gamestatusid = 4, location_id = v_lid,
    homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Orioles'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 21 ELSE  8 END,
    awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Orioles'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN  8 ELSE 21 END
  WHERE season_id = v_sid AND gamedate = '2026-03-28'
    AND home IN (SELECT teamid FROM teams WHERE name IN ('Orioles','Marlins') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away IN (SELECT teamid FROM teams WHERE name IN ('Orioles','Marlins') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- ============================================================
  -- Week 8 (Apr 7–11)  [Week 7 = spring break]
  -- ============================================================

  -- Athletics 14, Yankees 13 (2026-04-07)
  UPDATE season_games SET gamestatusid = 4, location_id = v_lid,
    homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Athletics' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 14 ELSE 13 END,
    awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Athletics' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 13 ELSE 14 END
  WHERE season_id = v_sid AND gamedate = '2026-04-07'
    AND home IN (SELECT teamid FROM teams WHERE name IN ('Athletics','Yankees') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away IN (SELECT teamid FROM teams WHERE name IN ('Athletics','Yankees') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- Padres 14, Orioles 8 (2026-04-07)
  UPDATE season_games SET gamestatusid = 4, location_id = v_lid,
    homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Padres'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 14 ELSE  8 END,
    awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Padres'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN  8 ELSE 14 END
  WHERE season_id = v_sid AND gamedate = '2026-04-07'
    AND home IN (SELECT teamid FROM teams WHERE name IN ('Padres','Orioles') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away IN (SELECT teamid FROM teams WHERE name IN ('Padres','Orioles') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- Braves 8, Astros 4 (2026-04-09)
  UPDATE season_games SET gamestatusid = 4, location_id = v_lid,
    homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Braves'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN  8 ELSE  4 END,
    awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Braves'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN  4 ELSE  8 END
  WHERE season_id = v_sid AND gamedate = '2026-04-09'
    AND home IN (SELECT teamid FROM teams WHERE name IN ('Braves','Astros') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away IN (SELECT teamid FROM teams WHERE name IN ('Braves','Astros') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- Blue Jays 12, Pirates 4 (2026-04-09)
  UPDATE season_games SET gamestatusid = 4, location_id = v_lid,
    homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Blue Jays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 12 ELSE  4 END,
    awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Blue Jays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN  4 ELSE 12 END
  WHERE season_id = v_sid AND gamedate = '2026-04-09'
    AND home IN (SELECT teamid FROM teams WHERE name IN ('Blue Jays','Pirates') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away IN (SELECT teamid FROM teams WHERE name IN ('Blue Jays','Pirates') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- Padres 20, Rockies 12 (2026-04-11)
  UPDATE season_games SET gamestatusid = 4, location_id = v_lid,
    homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Padres'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 20 ELSE 12 END,
    awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Padres'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 12 ELSE 20 END
  WHERE season_id = v_sid AND gamedate = '2026-04-11'
    AND home IN (SELECT teamid FROM teams WHERE name IN ('Padres','Rockies') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away IN (SELECT teamid FROM teams WHERE name IN ('Padres','Rockies') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- Giants 15, Angels 10 (2026-04-11)
  UPDATE season_games SET gamestatusid = 4, location_id = v_lid,
    homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Giants'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 15 ELSE 10 END,
    awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Giants'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 10 ELSE 15 END
  WHERE season_id = v_sid AND gamedate = '2026-04-11'
    AND home IN (SELECT teamid FROM teams WHERE name IN ('Giants','Angels') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away IN (SELECT teamid FROM teams WHERE name IN ('Giants','Angels') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- Blue Jays 13, White Sox 6 (2026-04-11)
  UPDATE season_games SET gamestatusid = 4, location_id = v_lid,
    homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Blue Jays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 13 ELSE  6 END,
    awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Blue Jays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN  6 ELSE 13 END
  WHERE season_id = v_sid AND gamedate = '2026-04-11'
    AND home IN (SELECT teamid FROM teams WHERE name IN ('Blue Jays','White Sox') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away IN (SELECT teamid FROM teams WHERE name IN ('Blue Jays','White Sox') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- Cubs 18, Rays 7 (2026-04-11)
  UPDATE season_games SET gamestatusid = 4, location_id = v_lid,
    homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Cubs'      AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 18 ELSE  7 END,
    awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Cubs'      AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN  7 ELSE 18 END
  WHERE season_id = v_sid AND gamedate = '2026-04-11'
    AND home IN (SELECT teamid FROM teams WHERE name IN ('Cubs','Rays') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away IN (SELECT teamid FROM teams WHERE name IN ('Cubs','Rays') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- Brewers 14, Pirates 11 (2026-04-11)
  UPDATE season_games SET gamestatusid = 4, location_id = v_lid,
    homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Brewers'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 14 ELSE 11 END,
    awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Brewers'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 11 ELSE 14 END
  WHERE season_id = v_sid AND gamedate = '2026-04-11'
    AND home IN (SELECT teamid FROM teams WHERE name IN ('Brewers','Pirates') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away IN (SELECT teamid FROM teams WHERE name IN ('Brewers','Pirates') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- Red Sox 24, Marlins 6 (2026-04-11)
  UPDATE season_games SET gamestatusid = 4, location_id = v_lid,
    homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Red Sox'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 24 ELSE  6 END,
    awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Red Sox'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN  6 ELSE 24 END
  WHERE season_id = v_sid AND gamedate = '2026-04-11'
    AND home IN (SELECT teamid FROM teams WHERE name IN ('Red Sox','Marlins') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away IN (SELECT teamid FROM teams WHERE name IN ('Red Sox','Marlins') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- Nationals 19, Astros 10 (2026-04-11)
  UPDATE season_games SET gamestatusid = 4, location_id = v_lid,
    homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Nationals' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 19 ELSE 10 END,
    awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Nationals' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 10 ELSE 19 END
  WHERE season_id = v_sid AND gamedate = '2026-04-11'
    AND home IN (SELECT teamid FROM teams WHERE name IN ('Nationals','Astros') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away IN (SELECT teamid FROM teams WHERE name IN ('Nationals','Astros') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- Braves 5, Orioles 3 (2026-04-11)
  UPDATE season_games SET gamestatusid = 4, location_id = v_lid,
    homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Braves'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN  5 ELSE  3 END,
    awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Braves'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN  3 ELSE  5 END
  WHERE season_id = v_sid AND gamedate = '2026-04-11'
    AND home IN (SELECT teamid FROM teams WHERE name IN ('Braves','Orioles') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away IN (SELECT teamid FROM teams WHERE name IN ('Braves','Orioles') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- Dodgers 10, Yankees 5 (2026-04-11)
  UPDATE season_games SET gamestatusid = 4, location_id = v_lid,
    homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Dodgers'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 10 ELSE  5 END,
    awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Dodgers'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN  5 ELSE 10 END
  WHERE season_id = v_sid AND gamedate = '2026-04-11'
    AND home IN (SELECT teamid FROM teams WHERE name IN ('Dodgers','Yankees') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away IN (SELECT teamid FROM teams WHERE name IN ('Dodgers','Yankees') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- Athletics 5, Mariners 4 (2026-04-11)
  UPDATE season_games SET gamestatusid = 4, location_id = v_lid,
    homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Athletics' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN  5 ELSE  4 END,
    awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Athletics' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN  4 ELSE  5 END
  WHERE season_id = v_sid AND gamedate = '2026-04-11'
    AND home IN (SELECT teamid FROM teams WHERE name IN ('Athletics','Mariners') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away IN (SELECT teamid FROM teams WHERE name IN ('Athletics','Mariners') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- ============================================================
  -- Week 9 (Apr 14–18)
  -- ============================================================

  -- Giants 16, Rockies 10 (2026-04-14)
  UPDATE season_games SET gamestatusid = 4, location_id = v_lid,
    homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Giants'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 16 ELSE 10 END,
    awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Giants'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 10 ELSE 16 END
  WHERE season_id = v_sid AND gamedate = '2026-04-14'
    AND home IN (SELECT teamid FROM teams WHERE name IN ('Giants','Rockies') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away IN (SELECT teamid FROM teams WHERE name IN ('Giants','Rockies') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- Cubs 11, Brewers 10 (2026-04-14)
  UPDATE season_games SET gamestatusid = 4, location_id = v_lid,
    homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Cubs'      AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 11 ELSE 10 END,
    awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Cubs'      AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 10 ELSE 11 END
  WHERE season_id = v_sid AND gamedate = '2026-04-14'
    AND home IN (SELECT teamid FROM teams WHERE name IN ('Cubs','Brewers') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away IN (SELECT teamid FROM teams WHERE name IN ('Cubs','Brewers') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- White Sox 12, Marlins 7 (2026-04-16)
  UPDATE season_games SET gamestatusid = 4, location_id = v_lid,
    homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'White Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 12 ELSE  7 END,
    awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'White Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN  7 ELSE 12 END
  WHERE season_id = v_sid AND gamedate = '2026-04-16'
    AND home IN (SELECT teamid FROM teams WHERE name IN ('White Sox','Marlins') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away IN (SELECT teamid FROM teams WHERE name IN ('White Sox','Marlins') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- Nationals 13, Mariners 10 (2026-04-16)
  UPDATE season_games SET gamestatusid = 4, location_id = v_lid,
    homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Nationals' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 13 ELSE 10 END,
    awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Nationals' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 10 ELSE 13 END
  WHERE season_id = v_sid AND gamedate = '2026-04-16'
    AND home IN (SELECT teamid FROM teams WHERE name IN ('Nationals','Mariners') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away IN (SELECT teamid FROM teams WHERE name IN ('Nationals','Mariners') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- Rays 14, Red Sox 12 (2026-04-18)
  UPDATE season_games SET gamestatusid = 4, location_id = v_lid,
    homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Rays'      AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 14 ELSE 12 END,
    awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Rays'      AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 12 ELSE 14 END
  WHERE season_id = v_sid AND gamedate = '2026-04-18'
    AND home IN (SELECT teamid FROM teams WHERE name IN ('Rays','Red Sox') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away IN (SELECT teamid FROM teams WHERE name IN ('Rays','Red Sox') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- Padres 12, Brewers 12 — TIE (2026-04-18)
  UPDATE season_games SET homescore = 12, awayscore = 12, gamestatusid = 4, location_id = v_lid
  WHERE season_id = v_sid AND gamedate = '2026-04-18'
    AND home IN (SELECT teamid FROM teams WHERE name IN ('Padres','Brewers') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away IN (SELECT teamid FROM teams WHERE name IN ('Padres','Brewers') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- Mariners 17, Rockies 7 (2026-04-18)
  UPDATE season_games SET gamestatusid = 4, location_id = v_lid,
    homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Mariners'  AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 17 ELSE  7 END,
    awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Mariners'  AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN  7 ELSE 17 END
  WHERE season_id = v_sid AND gamedate = '2026-04-18'
    AND home IN (SELECT teamid FROM teams WHERE name IN ('Mariners','Rockies') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away IN (SELECT teamid FROM teams WHERE name IN ('Mariners','Rockies') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- Giants 9, White Sox 9 — TIE (2026-04-18)
  UPDATE season_games SET homescore = 9, awayscore = 9, gamestatusid = 4, location_id = v_lid
  WHERE season_id = v_sid AND gamedate = '2026-04-18'
    AND home IN (SELECT teamid FROM teams WHERE name IN ('Giants','White Sox') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away IN (SELECT teamid FROM teams WHERE name IN ('Giants','White Sox') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- Blue Jays 21, Marlins 2 (2026-04-18)
  UPDATE season_games SET gamestatusid = 4, location_id = v_lid,
    homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Blue Jays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 21 ELSE  2 END,
    awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Blue Jays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN  2 ELSE 21 END
  WHERE season_id = v_sid AND gamedate = '2026-04-18'
    AND home IN (SELECT teamid FROM teams WHERE name IN ('Blue Jays','Marlins') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away IN (SELECT teamid FROM teams WHERE name IN ('Blue Jays','Marlins') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- Braves 11, Cubs 5 (2026-04-18)
  UPDATE season_games SET gamestatusid = 4, location_id = v_lid,
    homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Braves'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 11 ELSE  5 END,
    awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Braves'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN  5 ELSE 11 END
  WHERE season_id = v_sid AND gamedate = '2026-04-18'
    AND home IN (SELECT teamid FROM teams WHERE name IN ('Braves','Cubs') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away IN (SELECT teamid FROM teams WHERE name IN ('Braves','Cubs') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- Angels 8, Athletics 5 (2026-04-18)
  UPDATE season_games SET gamestatusid = 4, location_id = v_lid,
    homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Angels'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN  8 ELSE  5 END,
    awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Angels'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN  5 ELSE  8 END
  WHERE season_id = v_sid AND gamedate = '2026-04-18'
    AND home IN (SELECT teamid FROM teams WHERE name IN ('Angels','Athletics') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away IN (SELECT teamid FROM teams WHERE name IN ('Angels','Athletics') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- Nationals 20, Pirates 10 (2026-04-18)
  UPDATE season_games SET gamestatusid = 4, location_id = v_lid,
    homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Nationals' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 20 ELSE 10 END,
    awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Nationals' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 10 ELSE 20 END
  WHERE season_id = v_sid AND gamedate = '2026-04-18'
    AND home IN (SELECT teamid FROM teams WHERE name IN ('Nationals','Pirates') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away IN (SELECT teamid FROM teams WHERE name IN ('Nationals','Pirates') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- Orioles 6, Dodgers 4 (2026-04-18)
  UPDATE season_games SET gamestatusid = 4, location_id = v_lid,
    homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Orioles'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN  6 ELSE  4 END,
    awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Orioles'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN  4 ELSE  6 END
  WHERE season_id = v_sid AND gamedate = '2026-04-18'
    AND home IN (SELECT teamid FROM teams WHERE name IN ('Orioles','Dodgers') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away IN (SELECT teamid FROM teams WHERE name IN ('Orioles','Dodgers') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- Yankees 10, Astros 6 (2026-04-18)
  UPDATE season_games SET gamestatusid = 4, location_id = v_lid,
    homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Yankees'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 10 ELSE  6 END,
    awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Yankees'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN  6 ELSE 10 END
  WHERE season_id = v_sid AND gamedate = '2026-04-18'
    AND home IN (SELECT teamid FROM teams WHERE name IN ('Yankees','Astros') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away IN (SELECT teamid FROM teams WHERE name IN ('Yankees','Astros') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- ============================================================
  -- Week 10 (Apr 21–25)
  -- ============================================================

  -- Dodgers 13, Rays 11 (2026-04-21)
  UPDATE season_games SET gamestatusid = 4, location_id = v_lid,
    homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Dodgers'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 13 ELSE 11 END,
    awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Dodgers'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 11 ELSE 13 END
  WHERE season_id = v_sid AND gamedate = '2026-04-21'
    AND home IN (SELECT teamid FROM teams WHERE name IN ('Dodgers','Rays') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away IN (SELECT teamid FROM teams WHERE name IN ('Dodgers','Rays') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- Angels 14, Red Sox 11 (2026-04-21)
  UPDATE season_games SET gamestatusid = 4, location_id = v_lid,
    homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Angels'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 14 ELSE 11 END,
    awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Angels'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 11 ELSE 14 END
  WHERE season_id = v_sid AND gamedate = '2026-04-21'
    AND home IN (SELECT teamid FROM teams WHERE name IN ('Angels','Red Sox') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away IN (SELECT teamid FROM teams WHERE name IN ('Angels','Red Sox') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- Athletics 7, Cubs 17 (2026-04-23) — MAKEUP GAME: insert if missing
  UPDATE season_games SET gamestatusid = 4, location_id = v_lid, field = 'Field 5',
    homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Cubs'      AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 17 ELSE  7 END,
    awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Cubs'      AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN  7 ELSE 17 END
  WHERE season_id = v_sid AND gamedate = '2026-04-23'
    AND home IN (SELECT teamid FROM teams WHERE name IN ('Cubs','Athletics') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away IN (SELECT teamid FROM teams WHERE name IN ('Cubs','Athletics') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));
  IF NOT FOUND THEN
    INSERT INTO season_games (season_id, gamedate, gametime, home, away, homescore, awayscore, gamestatusid, game_type, field, location_id)
    VALUES (
      v_sid, '2026-04-23', '17:30',
      (SELECT teamid FROM teams WHERE name = 'Athletics' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)),
      (SELECT teamid FROM teams WHERE name = 'Cubs'      AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)),
      7, 17, 4, 'regular', 'Field 5', v_lid
    );
    RAISE NOTICE 'Inserted makeup game: Athletics vs Cubs 2026-04-23';
  END IF;

  -- Yankees 5, Blue Jays 19 (2026-04-23) — MAKEUP GAME: insert if missing
  UPDATE season_games SET gamestatusid = 4, location_id = v_lid, field = 'Field 7',
    homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Blue Jays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 19 ELSE  5 END,
    awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Blue Jays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN  5 ELSE 19 END
  WHERE season_id = v_sid AND gamedate = '2026-04-23'
    AND home IN (SELECT teamid FROM teams WHERE name IN ('Blue Jays','Yankees') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away IN (SELECT teamid FROM teams WHERE name IN ('Blue Jays','Yankees') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));
  IF NOT FOUND THEN
    INSERT INTO season_games (season_id, gamedate, gametime, home, away, homescore, awayscore, gamestatusid, game_type, field, location_id)
    VALUES (
      v_sid, '2026-04-23', '17:30',
      (SELECT teamid FROM teams WHERE name = 'Yankees'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)),
      (SELECT teamid FROM teams WHERE name = 'Blue Jays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)),
      5, 19, 4, 'regular', 'Field 7', v_lid
    );
    RAISE NOTICE 'Inserted makeup game: Yankees vs Blue Jays 2026-04-23';
  END IF;

  -- Angels 11, White Sox 5 (2026-04-25)
  UPDATE season_games SET gamestatusid = 4, location_id = v_lid,
    homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Angels'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 11 ELSE  5 END,
    awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Angels'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN  5 ELSE 11 END
  WHERE season_id = v_sid AND gamedate = '2026-04-25'
    AND home IN (SELECT teamid FROM teams WHERE name IN ('Angels','White Sox') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away IN (SELECT teamid FROM teams WHERE name IN ('Angels','White Sox') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- Athletics 14, Rockies 9 (2026-04-25)
  UPDATE season_games SET gamestatusid = 4, location_id = v_lid,
    homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Athletics' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 14 ELSE  9 END,
    awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Athletics' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN  9 ELSE 14 END
  WHERE season_id = v_sid AND gamedate = '2026-04-25'
    AND home IN (SELECT teamid FROM teams WHERE name IN ('Athletics','Rockies') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away IN (SELECT teamid FROM teams WHERE name IN ('Athletics','Rockies') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- Marlins 12, Giants 7 (2026-04-25)
  UPDATE season_games SET gamestatusid = 4, location_id = v_lid,
    homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Marlins'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 12 ELSE  7 END,
    awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Marlins'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN  7 ELSE 12 END
  WHERE season_id = v_sid AND gamedate = '2026-04-25'
    AND home IN (SELECT teamid FROM teams WHERE name IN ('Marlins','Giants') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away IN (SELECT teamid FROM teams WHERE name IN ('Marlins','Giants') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- Nationals 13, Padres 11 (2026-04-25)
  UPDATE season_games SET gamestatusid = 4, location_id = v_lid,
    homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Nationals' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 13 ELSE 11 END,
    awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Nationals' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 11 ELSE 13 END
  WHERE season_id = v_sid AND gamedate = '2026-04-25'
    AND home IN (SELECT teamid FROM teams WHERE name IN ('Nationals','Padres') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away IN (SELECT teamid FROM teams WHERE name IN ('Nationals','Padres') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- Brewers 13, Mariners 9 (2026-04-25)
  UPDATE season_games SET gamestatusid = 4, location_id = v_lid,
    homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Brewers'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 13 ELSE  9 END,
    awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Brewers'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN  9 ELSE 13 END
  WHERE season_id = v_sid AND gamedate = '2026-04-25'
    AND home IN (SELECT teamid FROM teams WHERE name IN ('Brewers','Mariners') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away IN (SELECT teamid FROM teams WHERE name IN ('Brewers','Mariners') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- Astros 14, Orioles 13 (2026-04-25)
  UPDATE season_games SET gamestatusid = 4, location_id = v_lid,
    homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Astros'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 14 ELSE 13 END,
    awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Astros'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 13 ELSE 14 END
  WHERE season_id = v_sid AND gamedate = '2026-04-25'
    AND home IN (SELECT teamid FROM teams WHERE name IN ('Astros','Orioles') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away IN (SELECT teamid FROM teams WHERE name IN ('Astros','Orioles') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- Pirates 15, Yankees 6 (2026-04-25)
  UPDATE season_games SET gamestatusid = 4, location_id = v_lid,
    homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Pirates'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 15 ELSE  6 END,
    awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Pirates'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN  6 ELSE 15 END
  WHERE season_id = v_sid AND gamedate = '2026-04-25'
    AND home IN (SELECT teamid FROM teams WHERE name IN ('Pirates','Yankees') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away IN (SELECT teamid FROM teams WHERE name IN ('Pirates','Yankees') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- Cubs 8, Dodgers 5 (2026-04-25)
  UPDATE season_games SET gamestatusid = 4, location_id = v_lid,
    homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Cubs'      AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN  8 ELSE  5 END,
    awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Cubs'      AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN  5 ELSE  8 END
  WHERE season_id = v_sid AND gamedate = '2026-04-25'
    AND home IN (SELECT teamid FROM teams WHERE name IN ('Cubs','Dodgers') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away IN (SELECT teamid FROM teams WHERE name IN ('Cubs','Dodgers') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- Braves 11, Red Sox 7 (2026-04-25)
  UPDATE season_games SET gamestatusid = 4, location_id = v_lid,
    homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Braves'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 11 ELSE  7 END,
    awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Braves'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN  7 ELSE 11 END
  WHERE season_id = v_sid AND gamedate = '2026-04-25'
    AND home IN (SELECT teamid FROM teams WHERE name IN ('Braves','Red Sox') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away IN (SELECT teamid FROM teams WHERE name IN ('Braves','Red Sox') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- Blue Jays 9, Rays 5 (2026-04-25)
  UPDATE season_games SET gamestatusid = 4, location_id = v_lid,
    homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Blue Jays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN  9 ELSE  5 END,
    awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Blue Jays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN  5 ELSE  9 END
  WHERE season_id = v_sid AND gamedate = '2026-04-25'
    AND home IN (SELECT teamid FROM teams WHERE name IN ('Blue Jays','Rays') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away IN (SELECT teamid FROM teams WHERE name IN ('Blue Jays','Rays') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- ============================================================
  -- Week 11 partial (Apr 28–30)
  -- ============================================================

  -- Braves 9, Pirates 5 (2026-04-28) — MAKEUP GAME: insert if missing
  UPDATE season_games SET gamestatusid = 4, location_id = v_lid, field = 'Field 5',
    homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Braves'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN  9 ELSE  5 END,
    awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Braves'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN  5 ELSE  9 END
  WHERE season_id = v_sid AND gamedate = '2026-04-28'
    AND home IN (SELECT teamid FROM teams WHERE name IN ('Braves','Pirates') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away IN (SELECT teamid FROM teams WHERE name IN ('Braves','Pirates') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));
  IF NOT FOUND THEN
    INSERT INTO season_games (season_id, gamedate, gametime, home, away, homescore, awayscore, gamestatusid, game_type, field, location_id)
    VALUES (
      v_sid, '2026-04-28', '17:30',
      (SELECT teamid FROM teams WHERE name = 'Braves'  AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)),
      (SELECT teamid FROM teams WHERE name = 'Pirates' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)),
      9, 5, 4, 'regular', 'Field 5', v_lid
    );
    RAISE NOTICE 'Inserted makeup game: Braves vs Pirates 2026-04-28';
  END IF;

  -- Dodgers 8, Astros 16 (2026-04-28) — MAKEUP GAME: insert if missing
  UPDATE season_games SET gamestatusid = 4, location_id = v_lid, field = 'Field 7',
    homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Astros'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 16 ELSE  8 END,
    awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Astros'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN  8 ELSE 16 END
  WHERE season_id = v_sid AND gamedate = '2026-04-28'
    AND home IN (SELECT teamid FROM teams WHERE name IN ('Astros','Dodgers') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away IN (SELECT teamid FROM teams WHERE name IN ('Astros','Dodgers') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));
  IF NOT FOUND THEN
    INSERT INTO season_games (season_id, gamedate, gametime, home, away, homescore, awayscore, gamestatusid, game_type, field, location_id)
    VALUES (
      v_sid, '2026-04-28', '17:30',
      (SELECT teamid FROM teams WHERE name = 'Dodgers' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)),
      (SELECT teamid FROM teams WHERE name = 'Astros'  AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)),
      8, 16, 4, 'regular', 'Field 7', v_lid
    );
    RAISE NOTICE 'Inserted makeup game: Dodgers vs Astros 2026-04-28';
  END IF;

  -- Nationals 12, Giants 5 (2026-04-30) — MAKEUP GAME: insert if missing
  UPDATE season_games SET gamestatusid = 4, location_id = v_lid, field = 'Field 5',
    homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Nationals' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN 12 ELSE  5 END,
    awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Nationals' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN  5 ELSE 12 END
  WHERE season_id = v_sid AND gamedate = '2026-04-30'
    AND home IN (SELECT teamid FROM teams WHERE name IN ('Nationals','Giants') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away IN (SELECT teamid FROM teams WHERE name IN ('Nationals','Giants') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));
  IF NOT FOUND THEN
    INSERT INTO season_games (season_id, gamedate, gametime, home, away, homescore, awayscore, gamestatusid, game_type, field, location_id)
    VALUES (
      v_sid, '2026-04-30', '17:30',
      (SELECT teamid FROM teams WHERE name = 'Nationals' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)),
      (SELECT teamid FROM teams WHERE name = 'Giants'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)),
      12, 5, 4, 'regular', 'Field 5', v_lid
    );
    RAISE NOTICE 'Inserted makeup game: Nationals vs Giants 2026-04-30';
  END IF;

  -- White Sox 8, Rockies 7 (2026-04-30) — MAKEUP GAME: insert if missing
  UPDATE season_games SET gamestatusid = 4, location_id = v_lid, field = 'Field 7',
    homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'White Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN  8 ELSE  7 END,
    awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'White Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)) THEN  7 ELSE  8 END
  WHERE season_id = v_sid AND gamedate = '2026-04-30'
    AND home IN (SELECT teamid FROM teams WHERE name IN ('White Sox','Rockies') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away IN (SELECT teamid FROM teams WHERE name IN ('White Sox','Rockies') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));
  IF NOT FOUND THEN
    INSERT INTO season_games (season_id, gamedate, gametime, home, away, homescore, awayscore, gamestatusid, game_type, field, location_id)
    VALUES (
      v_sid, '2026-04-30', '17:30',
      (SELECT teamid FROM teams WHERE name = 'White Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)),
      (SELECT teamid FROM teams WHERE name = 'Rockies'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid)),
      8, 7, 4, 'regular', 'Field 7', v_lid
    );
    RAISE NOTICE 'Inserted makeup game: White Sox vs Rockies 2026-04-30';
  END IF;

  RAISE NOTICE 'All updates complete for season_id = %', v_sid;
END $$;
