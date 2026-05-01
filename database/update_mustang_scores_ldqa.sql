-- Update SMYB Mustang Spring 2026 scores + locations (LDQA)
-- Source: sanmarcosyouthbaseball.com/schedule/649540/mustang
-- Run in Neon SQL console against the LDQA branch
--
-- Uses a DO block so season_id and location_id are resolved by name,
-- not hardcoded (IDs differ between dev/LDQA/prod).

DO $$
DECLARE
  v_sid INT;   -- season_id
  v_lid INT;   -- location_id for Mission Sports Park
BEGIN
  -- Find Mustang season (the one containing Pirates + Rockies + Mariners)
  SELECT s.id INTO v_sid FROM seasons s
  WHERE EXISTS (SELECT 1 FROM season_teams st JOIN teams t ON t.teamid = st.team_id WHERE st.season_id = s.id AND t.name = 'Pirates')
    AND EXISTS (SELECT 1 FROM season_teams st JOIN teams t ON t.teamid = st.team_id WHERE st.season_id = s.id AND t.name = 'Rockies')
    AND EXISTS (SELECT 1 FROM season_teams st JOIN teams t ON t.teamid = st.team_id WHERE st.season_id = s.id AND t.name = 'Mariners');

  IF v_sid IS NULL THEN RAISE EXCEPTION 'Mustang season not found'; END IF;
  RAISE NOTICE 'Mustang season_id = %', v_sid;

  -- Find Mission Sports Park location
  SELECT id INTO v_lid FROM locations WHERE name = 'Mission Sports Park';
  IF v_lid IS NULL THEN RAISE EXCEPTION 'Mission Sports Park location not found'; END IF;
  RAISE NOTICE 'Mission Sports Park location_id = %', v_lid;

  -- Fix rescheduled Week 1 game: Rockies vs Giants 2/21 -> 4/28
  UPDATE season_games SET gamedate = '2026-04-28', gametime = '17:00'
  WHERE season_id = v_sid AND gamedate = '2026-02-21'
    AND home = (SELECT teamid FROM teams WHERE name = 'Rockies' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Giants' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- ============================================================
  -- Week 2 (Feb 24-28)
  -- ============================================================

  UPDATE season_games SET homescore = 14, awayscore = 2, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-02-24'
    AND home = (SELECT teamid FROM teams WHERE name = 'Pirates' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Rays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 4, awayscore = 7, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-02-24'
    AND home = (SELECT teamid FROM teams WHERE name = 'Orioles' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Astros' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 1, awayscore = 5, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-02-24'
    AND home = (SELECT teamid FROM teams WHERE name = 'White Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Braves' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 4, awayscore = 14, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-02-24'
    AND home = (SELECT teamid FROM teams WHERE name = 'Yankees' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Marlins' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 0, awayscore = 2, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-02-26'
    AND home = (SELECT teamid FROM teams WHERE name = 'Nationals' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Padres' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 2, awayscore = 11, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-02-26'
    AND home = (SELECT teamid FROM teams WHERE name = 'Brewers' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Cubs' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 5, awayscore = 6, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-02-26'
    AND home = (SELECT teamid FROM teams WHERE name = 'Giants' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Blue Jays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 13, awayscore = 5, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-02-26'
    AND home = (SELECT teamid FROM teams WHERE name = 'Mariners' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Dodgers' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 3, awayscore = 2, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-02-28'
    AND home = (SELECT teamid FROM teams WHERE name = 'Red Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Rockies' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 5, awayscore = 6, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-02-28'
    AND home = (SELECT teamid FROM teams WHERE name = 'Astros' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Cubs' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 1, awayscore = 4, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-02-28'
    AND home = (SELECT teamid FROM teams WHERE name = 'Giants' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Athletics' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 0, awayscore = 9, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-02-28'
    AND home = (SELECT teamid FROM teams WHERE name = 'Nationals' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Orioles' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 4, awayscore = 4, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-02-28'
    AND home = (SELECT teamid FROM teams WHERE name = 'Braves' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Angels' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 6, awayscore = 3, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-02-28'
    AND home = (SELECT teamid FROM teams WHERE name = 'Rays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Padres' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 9, awayscore = 5, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-02-28'
    AND home = (SELECT teamid FROM teams WHERE name = 'White Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Marlins' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 4, awayscore = 6, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-02-28'
    AND home = (SELECT teamid FROM teams WHERE name = 'Blue Jays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Mariners' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 12, awayscore = 4, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-02-28'
    AND home = (SELECT teamid FROM teams WHERE name = 'Yankees' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Brewers' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 14, awayscore = 4, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-02-28'
    AND home = (SELECT teamid FROM teams WHERE name = 'Pirates' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Dodgers' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- ============================================================
  -- Week 3 (Mar 3-7)
  -- ============================================================

  UPDATE season_games SET homescore = 8, awayscore = 1, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-03-03'
    AND home = (SELECT teamid FROM teams WHERE name = 'Rockies' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Athletics' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 8, awayscore = 2, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-03-03'
    AND home = (SELECT teamid FROM teams WHERE name = 'Padres' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Dodgers' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 6, awayscore = 1, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-03-03'
    AND home = (SELECT teamid FROM teams WHERE name = 'Mariners' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Red Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 8, awayscore = 1, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-03-03'
    AND home = (SELECT teamid FROM teams WHERE name = 'Blue Jays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Pirates' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 4, awayscore = 15, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-03-05'
    AND home = (SELECT teamid FROM teams WHERE name = 'Angels' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Giants' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 8, awayscore = 10, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-03-05'
    AND home = (SELECT teamid FROM teams WHERE name = 'Rays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Orioles' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 8, awayscore = 2, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-03-05'
    AND home = (SELECT teamid FROM teams WHERE name = 'Cubs' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Nationals' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 9, awayscore = 4, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-03-05'
    AND home = (SELECT teamid FROM teams WHERE name = 'Brewers' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'White Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 5, awayscore = 2, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-03-07'
    AND home = (SELECT teamid FROM teams WHERE name = 'Padres' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Blue Jays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 6, awayscore = 6, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-03-07'
    AND home = (SELECT teamid FROM teams WHERE name = 'Nationals' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Yankees' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 7, awayscore = 0, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-03-07'
    AND home = (SELECT teamid FROM teams WHERE name = 'Orioles' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Dodgers' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 11, awayscore = 5, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-03-07'
    AND home = (SELECT teamid FROM teams WHERE name = 'Giants' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Red Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 5, awayscore = 9, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-03-07'
    AND home = (SELECT teamid FROM teams WHERE name = 'Marlins' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Rockies' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 10, awayscore = 8, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-03-07'
    AND home = (SELECT teamid FROM teams WHERE name = 'Angels' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Brewers' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 8, awayscore = 3, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-03-07'
    AND home = (SELECT teamid FROM teams WHERE name = 'Astros' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'White Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 2, awayscore = 1, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-03-07'
    AND home = (SELECT teamid FROM teams WHERE name = 'Mariners' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Pirates' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 8, awayscore = 8, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-03-07'
    AND home = (SELECT teamid FROM teams WHERE name = 'Rays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Cubs' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 3, awayscore = 15, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-03-07'
    AND home = (SELECT teamid FROM teams WHERE name = 'Athletics' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Braves' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- ============================================================
  -- Week 4 (Mar 10-14)
  -- ============================================================

  UPDATE season_games SET homescore = 10, awayscore = 4, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-03-10'
    AND home = (SELECT teamid FROM teams WHERE name = 'White Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Nationals' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 8, awayscore = 6, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-03-10'
    AND home = (SELECT teamid FROM teams WHERE name = 'Athletics' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Red Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 5, awayscore = 4, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-03-10'
    AND home = (SELECT teamid FROM teams WHERE name = 'Orioles' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Blue Jays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 7, awayscore = 11, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-03-10'
    AND home = (SELECT teamid FROM teams WHERE name = 'Marlins' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Angels' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 4, awayscore = 10, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-03-12'
    AND home = (SELECT teamid FROM teams WHERE name = 'Braves' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Rockies' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 6, awayscore = 5, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-03-12'
    AND home = (SELECT teamid FROM teams WHERE name = 'Giants' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Pirates' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 3, awayscore = 7, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-03-12'
    AND home = (SELECT teamid FROM teams WHERE name = 'Mariners' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Padres' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 13, awayscore = 6, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-03-12'
    AND home = (SELECT teamid FROM teams WHERE name = 'Astros' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Yankees' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 4, awayscore = 5, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-03-14'
    AND home = (SELECT teamid FROM teams WHERE name = 'Marlins' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Red Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 1, awayscore = 4, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-03-14'
    AND home = (SELECT teamid FROM teams WHERE name = 'White Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Rays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 1, awayscore = 3, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-03-14'
    AND home = (SELECT teamid FROM teams WHERE name = 'Braves' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Giants' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 3, awayscore = 3, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-03-14'
    AND home = (SELECT teamid FROM teams WHERE name = 'Cubs' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Blue Jays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 9, awayscore = 10, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-03-14'
    AND home = (SELECT teamid FROM teams WHERE name = 'Yankees' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Dodgers' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 5, awayscore = 2, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-03-14'
    AND home = (SELECT teamid FROM teams WHERE name = 'Mariners' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Orioles' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 1, awayscore = 3, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-03-14'
    AND home = (SELECT teamid FROM teams WHERE name = 'Nationals' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Angels' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 8, awayscore = 13, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-03-14'
    AND home = (SELECT teamid FROM teams WHERE name = 'Brewers' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Athletics' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 3, awayscore = 2, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-03-14'
    AND home = (SELECT teamid FROM teams WHERE name = 'Pirates' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Padres' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 2, awayscore = 1, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-03-14'
    AND home = (SELECT teamid FROM teams WHERE name = 'Rockies' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Astros' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- ============================================================
  -- Week 5 (Mar 17-21)
  -- ============================================================

  UPDATE season_games SET homescore = 4, awayscore = 15, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-03-17'
    AND home = (SELECT teamid FROM teams WHERE name = 'Marlins' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Athletics' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 7, awayscore = 4, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-03-17'
    AND home = (SELECT teamid FROM teams WHERE name = 'Rockies' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Brewers' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 4, awayscore = 9, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-03-17'
    AND home = (SELECT teamid FROM teams WHERE name = 'Dodgers' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Cubs' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 10, awayscore = 2, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-03-17'
    AND home = (SELECT teamid FROM teams WHERE name = 'Padres' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Giants' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 6, awayscore = 1, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-03-19'
    AND home = (SELECT teamid FROM teams WHERE name = 'Yankees' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Rays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 0, awayscore = 11, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-03-19'
    AND home = (SELECT teamid FROM teams WHERE name = 'Angels' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Astros' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 5, awayscore = 0, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-03-19'
    AND home = (SELECT teamid FROM teams WHERE name = 'Pirates' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Orioles' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 6, awayscore = 0, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-03-19'
    AND home = (SELECT teamid FROM teams WHERE name = 'Red Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Braves' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 4, awayscore = 5, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-03-21'
    AND home = (SELECT teamid FROM teams WHERE name = 'Angels' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Dodgers' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 4, awayscore = 3, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-03-21'
    AND home = (SELECT teamid FROM teams WHERE name = 'Athletics' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Nationals' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 14, awayscore = 11, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-03-21'
    AND home = (SELECT teamid FROM teams WHERE name = 'Giants' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Marlins' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 8, awayscore = 14, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-03-21'
    AND home = (SELECT teamid FROM teams WHERE name = 'Pirates' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Cubs' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 3, awayscore = 9, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-03-21'
    AND home = (SELECT teamid FROM teams WHERE name = 'Brewers' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Braves' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 2, awayscore = 3, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-03-21'
    AND home = (SELECT teamid FROM teams WHERE name = 'Blue Jays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'White Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 7, awayscore = 2, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-03-21'
    AND home = (SELECT teamid FROM teams WHERE name = 'Orioles' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Padres' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 8, awayscore = 7, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-03-21'
    AND home = (SELECT teamid FROM teams WHERE name = 'Rays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Rockies' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 0, awayscore = 12, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-03-21'
    AND home = (SELECT teamid FROM teams WHERE name = 'Red Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Astros' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 10, awayscore = 1, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-03-21'
    AND home = (SELECT teamid FROM teams WHERE name = 'Mariners' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Yankees' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- ============================================================
  -- Week 6 (Mar 24-28)
  -- ============================================================

  UPDATE season_games SET homescore = 7, awayscore = 12, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-03-24'
    AND home = (SELECT teamid FROM teams WHERE name = 'Blue Jays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Yankees' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 10, awayscore = 7, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-03-24'
    AND home = (SELECT teamid FROM teams WHERE name = 'Brewers' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Red Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 3, awayscore = 2, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-03-24'
    AND home = (SELECT teamid FROM teams WHERE name = 'Athletics' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Astros' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 4, awayscore = 9, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-03-24'
    AND home = (SELECT teamid FROM teams WHERE name = 'Dodgers' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'White Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 4, awayscore = 3, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-03-26'
    AND home = (SELECT teamid FROM teams WHERE name = 'Cubs' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Mariners' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- Forfeit: Nationals forfeited, Rockies win
  UPDATE season_games SET homescore = NULL, awayscore = NULL, gamestatusid = 7, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-03-26'
    AND home = (SELECT teamid FROM teams WHERE name = 'Rockies' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Nationals' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 7, awayscore = 5, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-03-26'
    AND home = (SELECT teamid FROM teams WHERE name = 'Rays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Angels' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 12, awayscore = 4, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-03-26'
    AND home = (SELECT teamid FROM teams WHERE name = 'Braves' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Marlins' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 12, awayscore = 4, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-03-28'
    AND home = (SELECT teamid FROM teams WHERE name = 'White Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Pirates' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 5, awayscore = 4, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-03-28'
    AND home = (SELECT teamid FROM teams WHERE name = 'Red Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Rays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 8, awayscore = 3, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-03-28'
    AND home = (SELECT teamid FROM teams WHERE name = 'Astros' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Marlins' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 4, awayscore = 1, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-03-28'
    AND home = (SELECT teamid FROM teams WHERE name = 'Mariners' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Angels' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 7, awayscore = 3, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-03-28'
    AND home = (SELECT teamid FROM teams WHERE name = 'Dodgers' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Athletics' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 2, awayscore = 12, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-03-28'
    AND home = (SELECT teamid FROM teams WHERE name = 'Yankees' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Padres' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- Forfeit: Rockies forfeited, Cubs win
  UPDATE season_games SET homescore = NULL, awayscore = NULL, gamestatusid = 7, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-03-28'
    AND home = (SELECT teamid FROM teams WHERE name = 'Cubs' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Rockies' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 6, awayscore = 11, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-03-28'
    AND home = (SELECT teamid FROM teams WHERE name = 'Braves' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Orioles' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 10, awayscore = 9, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-03-28'
    AND home = (SELECT teamid FROM teams WHERE name = 'Blue Jays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Nationals' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 7, awayscore = 6, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-03-28'
    AND home = (SELECT teamid FROM teams WHERE name = 'Brewers' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Giants' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- ============================================================
  -- Week 8 (Apr 7-11)
  -- ============================================================

  UPDATE season_games SET homescore = 3, awayscore = 6, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-04-07'
    AND home = (SELECT teamid FROM teams WHERE name = 'Padres' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Cubs' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 2, awayscore = 12, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-04-07'
    AND home = (SELECT teamid FROM teams WHERE name = 'White Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Mariners' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 1, awayscore = 11, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-04-07'
    AND home = (SELECT teamid FROM teams WHERE name = 'Yankees' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Pirates' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 2, awayscore = 6, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-04-07'
    AND home = (SELECT teamid FROM teams WHERE name = 'Nationals' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Red Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 2, awayscore = 3, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-04-09'
    AND home = (SELECT teamid FROM teams WHERE name = 'Marlins' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Brewers' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 18, awayscore = 4, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-04-09'
    AND home = (SELECT teamid FROM teams WHERE name = 'Angels' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Blue Jays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 0, awayscore = 5, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-04-09'
    AND home = (SELECT teamid FROM teams WHERE name = 'Rays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Athletics' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 6, awayscore = 8, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-04-09'
    AND home = (SELECT teamid FROM teams WHERE name = 'Dodgers' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Rockies' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 10, awayscore = 6, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-04-11'
    AND home = (SELECT teamid FROM teams WHERE name = 'Cubs' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Angels' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 6, awayscore = 9, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-04-11'
    AND home = (SELECT teamid FROM teams WHERE name = 'Braves' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Mariners' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 15, awayscore = 7, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-04-11'
    AND home = (SELECT teamid FROM teams WHERE name = 'Astros' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Rays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 11, awayscore = 7, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-04-11'
    AND home = (SELECT teamid FROM teams WHERE name = 'White Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Yankees' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 0, awayscore = 5, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-04-11'
    AND home = (SELECT teamid FROM teams WHERE name = 'Red Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Pirates' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 1, awayscore = 8, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-04-11'
    AND home = (SELECT teamid FROM teams WHERE name = 'Rockies' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Orioles' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 11, awayscore = 6, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-04-11'
    AND home = (SELECT teamid FROM teams WHERE name = 'Dodgers' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Brewers' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 9, awayscore = 6, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-04-11'
    AND home = (SELECT teamid FROM teams WHERE name = 'Blue Jays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Marlins' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 5, awayscore = 4, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-04-11'
    AND home = (SELECT teamid FROM teams WHERE name = 'Nationals' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Giants' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 4, awayscore = 9, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-04-11'
    AND home = (SELECT teamid FROM teams WHERE name = 'Padres' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Athletics' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- ============================================================
  -- Week 9 (Apr 14-18)
  -- ============================================================

  UPDATE season_games SET homescore = 6, awayscore = 6, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-04-14'
    AND home = (SELECT teamid FROM teams WHERE name = 'Giants' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Orioles' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 6, awayscore = 3, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-04-14'
    AND home = (SELECT teamid FROM teams WHERE name = 'Astros' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Braves' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 3, awayscore = 10, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-04-14'
    AND home = (SELECT teamid FROM teams WHERE name = 'Rockies' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Mariners' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 4, awayscore = 6, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-04-14'
    AND home = (SELECT teamid FROM teams WHERE name = 'Marlins' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Nationals' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 7, awayscore = 5, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-04-16'
    AND home = (SELECT teamid FROM teams WHERE name = 'Red Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Dodgers' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 6, awayscore = 2, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-04-16'
    AND home = (SELECT teamid FROM teams WHERE name = 'Athletics' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Blue Jays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 3, awayscore = 3, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-04-16'
    AND home = (SELECT teamid FROM teams WHERE name = 'Padres' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'White Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 9, awayscore = 5, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-04-16'
    AND home = (SELECT teamid FROM teams WHERE name = 'Pirates' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Angels' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 1, awayscore = 8, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-04-18'
    AND home = (SELECT teamid FROM teams WHERE name = 'Yankees' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Rockies' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 7, awayscore = 6, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-04-18'
    AND home = (SELECT teamid FROM teams WHERE name = 'Astros' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Blue Jays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 12, awayscore = 2, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-04-18'
    AND home = (SELECT teamid FROM teams WHERE name = 'Mariners' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Brewers' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 7, awayscore = 6, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-04-18'
    AND home = (SELECT teamid FROM teams WHERE name = 'Athletics' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Cubs' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 8, awayscore = 8, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-04-18'
    AND home = (SELECT teamid FROM teams WHERE name = 'Dodgers' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Nationals' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 3, awayscore = 3, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-04-18'
    AND home = (SELECT teamid FROM teams WHERE name = 'Pirates' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Marlins' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 12, awayscore = 8, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-04-18'
    AND home = (SELECT teamid FROM teams WHERE name = 'Braves' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Padres' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- Forfeit: Rays forfeited, Giants win
  UPDATE season_games SET homescore = NULL, awayscore = NULL, gamestatusid = 7, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-04-18'
    AND home = (SELECT teamid FROM teams WHERE name = 'Giants' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Rays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 10, awayscore = 4, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-04-18'
    AND home = (SELECT teamid FROM teams WHERE name = 'Orioles' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Red Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 8, awayscore = 2, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-04-18'
    AND home = (SELECT teamid FROM teams WHERE name = 'Angels' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'White Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- ============================================================
  -- Week 10 (Apr 21-25)
  -- ============================================================

  UPDATE season_games SET homescore = 16, awayscore = 0, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-04-21'
    AND home = (SELECT teamid FROM teams WHERE name = 'Orioles' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Yankees' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 5, awayscore = 8, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-04-21'
    AND home = (SELECT teamid FROM teams WHERE name = 'Cubs' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Giants' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 5, awayscore = 0, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-04-21'
    AND home = (SELECT teamid FROM teams WHERE name = 'Braves' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Rays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 4, awayscore = 13, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-04-21'
    AND home = (SELECT teamid FROM teams WHERE name = 'Brewers' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Astros' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 10, awayscore = 9, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-04-23'
    AND home = (SELECT teamid FROM teams WHERE name = 'White Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Red Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 13, awayscore = 1, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-04-23'
    AND home = (SELECT teamid FROM teams WHERE name = 'Blue Jays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Dodgers' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 1, awayscore = 5, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-04-23'
    AND home = (SELECT teamid FROM teams WHERE name = 'Angels' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Athletics' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 7, awayscore = 4, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-04-23'
    AND home = (SELECT teamid FROM teams WHERE name = 'Nationals' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Pirates' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 11, awayscore = 4, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-04-25'
    AND home = (SELECT teamid FROM teams WHERE name = 'Padres' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Brewers' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 9, awayscore = 14, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-04-25'
    AND home = (SELECT teamid FROM teams WHERE name = 'Marlins' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Orioles' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 3, awayscore = 2, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-04-25'
    AND home = (SELECT teamid FROM teams WHERE name = 'Cubs' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Braves' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 15, awayscore = 6, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-04-25'
    AND home = (SELECT teamid FROM teams WHERE name = 'Red Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Yankees' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 13, awayscore = 1, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-04-25'
    AND home = (SELECT teamid FROM teams WHERE name = 'Astros' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Pirates' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 12, awayscore = 2, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-04-25'
    AND home = (SELECT teamid FROM teams WHERE name = 'Dodgers' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Giants' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 5, awayscore = 10, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-04-25'
    AND home = (SELECT teamid FROM teams WHERE name = 'Nationals' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Mariners' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 16, awayscore = 9, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-04-25'
    AND home = (SELECT teamid FROM teams WHERE name = 'Athletics' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'White Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 5, awayscore = 5, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-04-25'
    AND home = (SELECT teamid FROM teams WHERE name = 'Blue Jays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Rays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- Forfeit: Angels forfeited, Rockies win
  UPDATE season_games SET homescore = NULL, awayscore = NULL, gamestatusid = 7, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-04-25'
    AND home = (SELECT teamid FROM teams WHERE name = 'Rockies' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Angels' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  -- ============================================================
  -- Week 11 partial (Apr 28-30)
  -- ============================================================

  UPDATE season_games SET homescore = 6, awayscore = 19, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-04-28'
    AND home = (SELECT teamid FROM teams WHERE name = 'Rockies' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Giants' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 4, awayscore = 12, gamestatusid = 4, location_id = v_lid, field = 'Field 4'
  WHERE season_id = v_sid AND gamedate = '2026-04-28'
    AND home = (SELECT teamid FROM teams WHERE name = 'Marlins' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Cubs' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  UPDATE season_games SET homescore = 7, awayscore = 8, gamestatusid = 4, location_id = v_lid, field = 'Field 1'
  WHERE season_id = v_sid AND gamedate = '2026-04-30'
    AND home = (SELECT teamid FROM teams WHERE name = 'Orioles' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid))
    AND away = (SELECT teamid FROM teams WHERE name = 'Brewers' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = v_sid));

  RAISE NOTICE 'All updates complete for season_id = %', v_sid;
END $$;
