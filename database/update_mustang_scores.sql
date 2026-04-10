-- Update SMYB Mustang Spring 2026 scores (season_id = 1)
-- Source: sanmarcosyouthbaseball.com/schedule/649540/mustang
-- Sets homescore, awayscore, gamestatusid=4 (Final) for completed games
-- Sets gamestatusid=7 (Away Team Forfeit) for forfeits (scores = NULL)
-- Matches by gamedate + home/away team name

-- ============================================================
-- Week 2 (Feb 24–28)
-- ============================================================

UPDATE season_games SET homescore = 14, awayscore = 2, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-02-24'
  AND home = (SELECT teamid FROM teams WHERE name = 'Pirates' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Rays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 4, awayscore = 7, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-02-24'
  AND home = (SELECT teamid FROM teams WHERE name = 'Orioles' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Astros' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 1, awayscore = 5, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-02-24'
  AND home = (SELECT teamid FROM teams WHERE name = 'White Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Braves' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 4, awayscore = 14, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-02-24'
  AND home = (SELECT teamid FROM teams WHERE name = 'Yankees' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Marlins' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 0, awayscore = 2, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-02-26'
  AND home = (SELECT teamid FROM teams WHERE name = 'Nationals' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Padres' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 2, awayscore = 11, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-02-26'
  AND home = (SELECT teamid FROM teams WHERE name = 'Brewers' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Cubs' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 5, awayscore = 6, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-02-26'
  AND home = (SELECT teamid FROM teams WHERE name = 'Giants' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Blue Jays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 13, awayscore = 5, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-02-26'
  AND home = (SELECT teamid FROM teams WHERE name = 'Mariners' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Dodgers' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 3, awayscore = 2, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-02-28'
  AND home = (SELECT teamid FROM teams WHERE name = 'Red Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Rockies' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 5, awayscore = 6, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-02-28'
  AND home = (SELECT teamid FROM teams WHERE name = 'Astros' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Cubs' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 1, awayscore = 4, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-02-28'
  AND home = (SELECT teamid FROM teams WHERE name = 'Giants' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Athletics' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 0, awayscore = 9, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-02-28'
  AND home = (SELECT teamid FROM teams WHERE name = 'Nationals' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Orioles' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 4, awayscore = 4, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-02-28'
  AND home = (SELECT teamid FROM teams WHERE name = 'Braves' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Angels' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 6, awayscore = 3, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-02-28'
  AND home = (SELECT teamid FROM teams WHERE name = 'Rays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Padres' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 9, awayscore = 5, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-02-28'
  AND home = (SELECT teamid FROM teams WHERE name = 'White Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Marlins' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 4, awayscore = 6, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-02-28'
  AND home = (SELECT teamid FROM teams WHERE name = 'Blue Jays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Mariners' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 12, awayscore = 4, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-02-28'
  AND home = (SELECT teamid FROM teams WHERE name = 'Yankees' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Brewers' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 14, awayscore = 4, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-02-28'
  AND home = (SELECT teamid FROM teams WHERE name = 'Pirates' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Dodgers' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

-- ============================================================
-- Week 3 (Mar 3–7)
-- ============================================================

UPDATE season_games SET homescore = 8, awayscore = 1, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-03'
  AND home = (SELECT teamid FROM teams WHERE name = 'Rockies' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Athletics' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 8, awayscore = 2, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-03'
  AND home = (SELECT teamid FROM teams WHERE name = 'Padres' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Dodgers' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 6, awayscore = 1, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-03'
  AND home = (SELECT teamid FROM teams WHERE name = 'Mariners' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Red Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 8, awayscore = 1, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-03'
  AND home = (SELECT teamid FROM teams WHERE name = 'Blue Jays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Pirates' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 4, awayscore = 15, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-05'
  AND home = (SELECT teamid FROM teams WHERE name = 'Angels' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Giants' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 8, awayscore = 10, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-05'
  AND home = (SELECT teamid FROM teams WHERE name = 'Rays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Orioles' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 8, awayscore = 2, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-05'
  AND home = (SELECT teamid FROM teams WHERE name = 'Cubs' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Nationals' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 9, awayscore = 4, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-05'
  AND home = (SELECT teamid FROM teams WHERE name = 'Brewers' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'White Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 5, awayscore = 2, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-07'
  AND home = (SELECT teamid FROM teams WHERE name = 'Padres' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Blue Jays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 6, awayscore = 6, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-07'
  AND home = (SELECT teamid FROM teams WHERE name = 'Nationals' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Yankees' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 7, awayscore = 0, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-07'
  AND home = (SELECT teamid FROM teams WHERE name = 'Orioles' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Dodgers' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 11, awayscore = 5, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-07'
  AND home = (SELECT teamid FROM teams WHERE name = 'Giants' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Red Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 5, awayscore = 9, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-07'
  AND home = (SELECT teamid FROM teams WHERE name = 'Marlins' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Rockies' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 10, awayscore = 8, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-07'
  AND home = (SELECT teamid FROM teams WHERE name = 'Angels' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Brewers' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 8, awayscore = 3, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-07'
  AND home = (SELECT teamid FROM teams WHERE name = 'Astros' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'White Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 2, awayscore = 1, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-07'
  AND home = (SELECT teamid FROM teams WHERE name = 'Mariners' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Pirates' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 8, awayscore = 8, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-07'
  AND home = (SELECT teamid FROM teams WHERE name = 'Rays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Cubs' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 3, awayscore = 15, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-07'
  AND home = (SELECT teamid FROM teams WHERE name = 'Athletics' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Braves' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

-- ============================================================
-- Week 4 (Mar 10–14)
-- ============================================================

UPDATE season_games SET homescore = 10, awayscore = 4, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-10'
  AND home = (SELECT teamid FROM teams WHERE name = 'White Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Nationals' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 8, awayscore = 6, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-10'
  AND home = (SELECT teamid FROM teams WHERE name = 'Athletics' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Red Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 5, awayscore = 4, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-10'
  AND home = (SELECT teamid FROM teams WHERE name = 'Orioles' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Blue Jays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 7, awayscore = 11, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-10'
  AND home = (SELECT teamid FROM teams WHERE name = 'Marlins' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Angels' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 4, awayscore = 10, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-12'
  AND home = (SELECT teamid FROM teams WHERE name = 'Braves' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Rockies' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 6, awayscore = 5, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-12'
  AND home = (SELECT teamid FROM teams WHERE name = 'Giants' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Pirates' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 3, awayscore = 7, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-12'
  AND home = (SELECT teamid FROM teams WHERE name = 'Mariners' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Padres' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 13, awayscore = 6, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-12'
  AND home = (SELECT teamid FROM teams WHERE name = 'Astros' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Yankees' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 4, awayscore = 5, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-14'
  AND home = (SELECT teamid FROM teams WHERE name = 'Marlins' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Red Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 1, awayscore = 4, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-14'
  AND home = (SELECT teamid FROM teams WHERE name = 'White Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Rays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 1, awayscore = 3, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-14'
  AND home = (SELECT teamid FROM teams WHERE name = 'Braves' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Giants' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 3, awayscore = 3, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-14'
  AND home = (SELECT teamid FROM teams WHERE name = 'Cubs' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Blue Jays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 9, awayscore = 10, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-14'
  AND home = (SELECT teamid FROM teams WHERE name = 'Yankees' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Dodgers' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 5, awayscore = 2, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-14'
  AND home = (SELECT teamid FROM teams WHERE name = 'Mariners' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Orioles' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 1, awayscore = 3, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-14'
  AND home = (SELECT teamid FROM teams WHERE name = 'Nationals' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Angels' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 8, awayscore = 13, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-14'
  AND home = (SELECT teamid FROM teams WHERE name = 'Brewers' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Athletics' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 3, awayscore = 2, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-14'
  AND home = (SELECT teamid FROM teams WHERE name = 'Pirates' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Padres' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 2, awayscore = 1, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-14'
  AND home = (SELECT teamid FROM teams WHERE name = 'Rockies' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Astros' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

-- ============================================================
-- Week 5 (Mar 17–21)
-- ============================================================

UPDATE season_games SET homescore = 4, awayscore = 15, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-17'
  AND home = (SELECT teamid FROM teams WHERE name = 'Marlins' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Athletics' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 7, awayscore = 4, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-17'
  AND home = (SELECT teamid FROM teams WHERE name = 'Rockies' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Brewers' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 4, awayscore = 9, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-17'
  AND home = (SELECT teamid FROM teams WHERE name = 'Dodgers' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Cubs' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 10, awayscore = 2, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-17'
  AND home = (SELECT teamid FROM teams WHERE name = 'Padres' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Giants' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 6, awayscore = 1, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-19'
  AND home = (SELECT teamid FROM teams WHERE name = 'Yankees' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Rays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 0, awayscore = 11, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-19'
  AND home = (SELECT teamid FROM teams WHERE name = 'Angels' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Astros' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 5, awayscore = 0, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-19'
  AND home = (SELECT teamid FROM teams WHERE name = 'Pirates' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Orioles' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 6, awayscore = 0, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-19'
  AND home = (SELECT teamid FROM teams WHERE name = 'Red Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Braves' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 4, awayscore = 5, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-21'
  AND home = (SELECT teamid FROM teams WHERE name = 'Angels' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Dodgers' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 4, awayscore = 3, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-21'
  AND home = (SELECT teamid FROM teams WHERE name = 'Athletics' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Nationals' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 14, awayscore = 11, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-21'
  AND home = (SELECT teamid FROM teams WHERE name = 'Giants' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Marlins' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 8, awayscore = 14, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-21'
  AND home = (SELECT teamid FROM teams WHERE name = 'Pirates' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Cubs' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 3, awayscore = 9, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-21'
  AND home = (SELECT teamid FROM teams WHERE name = 'Brewers' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Braves' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 2, awayscore = 3, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-21'
  AND home = (SELECT teamid FROM teams WHERE name = 'Blue Jays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'White Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 7, awayscore = 2, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-21'
  AND home = (SELECT teamid FROM teams WHERE name = 'Orioles' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Padres' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 8, awayscore = 7, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-21'
  AND home = (SELECT teamid FROM teams WHERE name = 'Rays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Rockies' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 0, awayscore = 12, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-21'
  AND home = (SELECT teamid FROM teams WHERE name = 'Red Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Astros' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 10, awayscore = 1, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-21'
  AND home = (SELECT teamid FROM teams WHERE name = 'Mariners' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Yankees' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

-- ============================================================
-- Week 6 (Mar 24–28)
-- ============================================================

UPDATE season_games SET homescore = 7, awayscore = 12, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-24'
  AND home = (SELECT teamid FROM teams WHERE name = 'Blue Jays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Yankees' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 10, awayscore = 7, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-24'
  AND home = (SELECT teamid FROM teams WHERE name = 'Brewers' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Red Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 3, awayscore = 2, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-24'
  AND home = (SELECT teamid FROM teams WHERE name = 'Athletics' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Astros' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 4, awayscore = 9, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-24'
  AND home = (SELECT teamid FROM teams WHERE name = 'Dodgers' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'White Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 4, awayscore = 3, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-26'
  AND home = (SELECT teamid FROM teams WHERE name = 'Cubs' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Mariners' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

-- Forfeit: Nationals forfeited, Rockies win (Away Team Forfeit = gamestatusid 7)
UPDATE season_games SET homescore = NULL, awayscore = NULL, gamestatusid = 7
WHERE season_id = 1 AND gamedate = '2026-03-26'
  AND home = (SELECT teamid FROM teams WHERE name = 'Rockies' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Nationals' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 7, awayscore = 5, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-26'
  AND home = (SELECT teamid FROM teams WHERE name = 'Rays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Angels' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 12, awayscore = 4, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-26'
  AND home = (SELECT teamid FROM teams WHERE name = 'Braves' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Marlins' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 12, awayscore = 4, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-28'
  AND home = (SELECT teamid FROM teams WHERE name = 'White Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Pirates' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 5, awayscore = 4, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-28'
  AND home = (SELECT teamid FROM teams WHERE name = 'Red Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Rays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 8, awayscore = 3, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-28'
  AND home = (SELECT teamid FROM teams WHERE name = 'Astros' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Marlins' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 4, awayscore = 1, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-28'
  AND home = (SELECT teamid FROM teams WHERE name = 'Mariners' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Angels' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 7, awayscore = 3, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-28'
  AND home = (SELECT teamid FROM teams WHERE name = 'Dodgers' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Athletics' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 2, awayscore = 12, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-28'
  AND home = (SELECT teamid FROM teams WHERE name = 'Yankees' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Padres' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

-- Forfeit: Rockies forfeited, Cubs win (Away Team Forfeit = gamestatusid 7)
UPDATE season_games SET homescore = NULL, awayscore = NULL, gamestatusid = 7
WHERE season_id = 1 AND gamedate = '2026-03-28'
  AND home = (SELECT teamid FROM teams WHERE name = 'Cubs' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Rockies' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 6, awayscore = 11, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-28'
  AND home = (SELECT teamid FROM teams WHERE name = 'Braves' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Orioles' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 10, awayscore = 9, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-28'
  AND home = (SELECT teamid FROM teams WHERE name = 'Blue Jays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Nationals' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 7, awayscore = 6, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-03-28'
  AND home = (SELECT teamid FROM teams WHERE name = 'Brewers' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Giants' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

-- ============================================================
-- Week 8 — Partial (Tue Apr 7 games only)
-- ============================================================

UPDATE season_games SET homescore = 3, awayscore = 6, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-04-07'
  AND home = (SELECT teamid FROM teams WHERE name = 'Padres' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Cubs' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 2, awayscore = 12, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-04-07'
  AND home = (SELECT teamid FROM teams WHERE name = 'White Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Mariners' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 1, awayscore = 11, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-04-07'
  AND home = (SELECT teamid FROM teams WHERE name = 'Yankees' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Pirates' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));

UPDATE season_games SET homescore = 2, awayscore = 6, gamestatusid = 4
WHERE season_id = 1 AND gamedate = '2026-04-07'
  AND home = (SELECT teamid FROM teams WHERE name = 'Nationals' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1))
  AND away = (SELECT teamid FROM teams WHERE name = 'Red Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 1));
