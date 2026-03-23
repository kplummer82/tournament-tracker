-- Update SMYB Pinto Spring 2026 scores (season_id = 2)
-- Source: sanmarcosyouthbaseball.com/schedule/649539/pinto
-- Sets homescore, awayscore, gamestatusid=4 (Final) for completed games
-- Matches by gamedate + home/away team name

UPDATE season_games SET homescore = 4, awayscore = 3, gamestatusid = 4
WHERE season_id = 2 AND gamedate = '2026-02-24'
  AND home = (SELECT teamid FROM teams WHERE name = 'Mariners' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away = (SELECT teamid FROM teams WHERE name = 'Cubs' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

UPDATE season_games SET homescore = 15, awayscore = 5, gamestatusid = 4
WHERE season_id = 2 AND gamedate = '2026-02-24'
  AND home = (SELECT teamid FROM teams WHERE name = 'Blue Jays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away = (SELECT teamid FROM teams WHERE name = 'Astros' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

UPDATE season_games SET homescore = 8, awayscore = 9, gamestatusid = 4
WHERE season_id = 2 AND gamedate = '2026-02-26'
  AND home = (SELECT teamid FROM teams WHERE name = 'Yankees' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away = (SELECT teamid FROM teams WHERE name = 'Red Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

UPDATE season_games SET homescore = 7, awayscore = 11, gamestatusid = 4
WHERE season_id = 2 AND gamedate = '2026-02-26'
  AND home = (SELECT teamid FROM teams WHERE name = 'Athletics' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away = (SELECT teamid FROM teams WHERE name = 'Braves' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

UPDATE season_games SET homescore = 5, awayscore = 0, gamestatusid = 4
WHERE season_id = 2 AND gamedate = '2026-02-28'
  AND home = (SELECT teamid FROM teams WHERE name = 'Rays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away = (SELECT teamid FROM teams WHERE name = 'Mariners' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

UPDATE season_games SET homescore = 10, awayscore = 12, gamestatusid = 4
WHERE season_id = 2 AND gamedate = '2026-02-28'
  AND home = (SELECT teamid FROM teams WHERE name = 'Dodgers' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away = (SELECT teamid FROM teams WHERE name = 'Red Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

UPDATE season_games SET homescore = 9, awayscore = 10, gamestatusid = 4
WHERE season_id = 2 AND gamedate = '2026-02-28'
  AND home = (SELECT teamid FROM teams WHERE name = 'Athletics' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away = (SELECT teamid FROM teams WHERE name = 'Astros' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

UPDATE season_games SET homescore = 2, awayscore = 17, gamestatusid = 4
WHERE season_id = 2 AND gamedate = '2026-02-28'
  AND home = (SELECT teamid FROM teams WHERE name = 'Orioles' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away = (SELECT teamid FROM teams WHERE name = 'Blue Jays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

UPDATE season_games SET homescore = 7, awayscore = 4, gamestatusid = 4
WHERE season_id = 2 AND gamedate = '2026-02-28'
  AND home = (SELECT teamid FROM teams WHERE name = 'Braves' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away = (SELECT teamid FROM teams WHERE name = 'Padres' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

UPDATE season_games SET homescore = 12, awayscore = 8, gamestatusid = 4
WHERE season_id = 2 AND gamedate = '2026-02-28'
  AND home = (SELECT teamid FROM teams WHERE name = 'Yankees' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away = (SELECT teamid FROM teams WHERE name = 'Giants' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

UPDATE season_games SET homescore = 8, awayscore = 9, gamestatusid = 4
WHERE season_id = 2 AND gamedate = '2026-02-28'
  AND home = (SELECT teamid FROM teams WHERE name = 'Brewers' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away = (SELECT teamid FROM teams WHERE name = 'White Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

UPDATE season_games SET homescore = 6, awayscore = 10, gamestatusid = 4
WHERE season_id = 2 AND gamedate = '2026-02-28'
  AND home = (SELECT teamid FROM teams WHERE name = 'Angels' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away = (SELECT teamid FROM teams WHERE name = 'Nationals' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

UPDATE season_games SET homescore = 10, awayscore = 9, gamestatusid = 4
WHERE season_id = 2 AND gamedate = '2026-02-28'
  AND home = (SELECT teamid FROM teams WHERE name = 'Rockies' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away = (SELECT teamid FROM teams WHERE name = 'Marlins' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

UPDATE season_games SET homescore = 14, awayscore = 4, gamestatusid = 4
WHERE season_id = 2 AND gamedate = '2026-02-28'
  AND home = (SELECT teamid FROM teams WHERE name = 'Cubs' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away = (SELECT teamid FROM teams WHERE name = 'Pirates' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

-- Week 3
UPDATE season_games SET homescore = 16, awayscore = 9, gamestatusid = 4
WHERE season_id = 2 AND gamedate = '2026-03-03'
  AND home = (SELECT teamid FROM teams WHERE name = 'Nationals' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away = (SELECT teamid FROM teams WHERE name = 'Orioles' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

UPDATE season_games SET homescore = 10, awayscore = 6, gamestatusid = 4
WHERE season_id = 2 AND gamedate = '2026-03-03'
  AND home = (SELECT teamid FROM teams WHERE name = 'Padres' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away = (SELECT teamid FROM teams WHERE name = 'Marlins' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

UPDATE season_games SET homescore = 9, awayscore = 12, gamestatusid = 4
WHERE season_id = 2 AND gamedate = '2026-03-05'
  AND home = (SELECT teamid FROM teams WHERE name = 'Dodgers' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away = (SELECT teamid FROM teams WHERE name = 'Giants' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

UPDATE season_games SET homescore = 10, awayscore = 8, gamestatusid = 4
WHERE season_id = 2 AND gamedate = '2026-03-05'
  AND home = (SELECT teamid FROM teams WHERE name = 'White Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away = (SELECT teamid FROM teams WHERE name = 'Rays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

UPDATE season_games SET homescore = 9, awayscore = 11, gamestatusid = 4
WHERE season_id = 2 AND gamedate = '2026-03-07'
  AND home = (SELECT teamid FROM teams WHERE name = 'Giants' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away = (SELECT teamid FROM teams WHERE name = 'Orioles' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

UPDATE season_games SET homescore = 9, awayscore = 13, gamestatusid = 4
WHERE season_id = 2 AND gamedate = '2026-03-07'
  AND home = (SELECT teamid FROM teams WHERE name = 'Mariners' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away = (SELECT teamid FROM teams WHERE name = 'Braves' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

UPDATE season_games SET homescore = 1, awayscore = 14, gamestatusid = 4
WHERE season_id = 2 AND gamedate = '2026-03-07'
  AND home = (SELECT teamid FROM teams WHERE name = 'Marlins' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away = (SELECT teamid FROM teams WHERE name = 'Brewers' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

UPDATE season_games SET homescore = 7, awayscore = 7, gamestatusid = 4
WHERE season_id = 2 AND gamedate = '2026-03-07'
  AND home = (SELECT teamid FROM teams WHERE name = 'Red Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away = (SELECT teamid FROM teams WHERE name = 'Athletics' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

UPDATE season_games SET homescore = 12, awayscore = 9, gamestatusid = 4
WHERE season_id = 2 AND gamedate = '2026-03-07'
  AND home = (SELECT teamid FROM teams WHERE name = 'Padres' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away = (SELECT teamid FROM teams WHERE name = 'Dodgers' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

UPDATE season_games SET homescore = 15, awayscore = 6, gamestatusid = 4
WHERE season_id = 2 AND gamedate = '2026-03-07'
  AND home = (SELECT teamid FROM teams WHERE name = 'White Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away = (SELECT teamid FROM teams WHERE name = 'Nationals' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

UPDATE season_games SET homescore = 11, awayscore = 20, gamestatusid = 4
WHERE season_id = 2 AND gamedate = '2026-03-07'
  AND home = (SELECT teamid FROM teams WHERE name = 'Astros' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away = (SELECT teamid FROM teams WHERE name = 'Pirates' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

UPDATE season_games SET homescore = 7, awayscore = 9, gamestatusid = 4
WHERE season_id = 2 AND gamedate = '2026-03-07'
  AND home = (SELECT teamid FROM teams WHERE name = 'Rockies' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away = (SELECT teamid FROM teams WHERE name = 'Rays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

UPDATE season_games SET homescore = 10, awayscore = 6, gamestatusid = 4
WHERE season_id = 2 AND gamedate = '2026-03-07'
  AND home = (SELECT teamid FROM teams WHERE name = 'Blue Jays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away = (SELECT teamid FROM teams WHERE name = 'Cubs' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

UPDATE season_games SET homescore = 7, awayscore = 3, gamestatusid = 4
WHERE season_id = 2 AND gamedate = '2026-03-07'
  AND home = (SELECT teamid FROM teams WHERE name = 'Angels' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away = (SELECT teamid FROM teams WHERE name = 'Yankees' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

-- Week 4
UPDATE season_games SET homescore = 11, awayscore = 2, gamestatusid = 4
WHERE season_id = 2 AND gamedate = '2026-03-10'
  AND home = (SELECT teamid FROM teams WHERE name = 'Pirates' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away = (SELECT teamid FROM teams WHERE name = 'Angels' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

UPDATE season_games SET homescore = 7, awayscore = 1, gamestatusid = 4
WHERE season_id = 2 AND gamedate = '2026-03-10'
  AND home = (SELECT teamid FROM teams WHERE name = 'Brewers' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away = (SELECT teamid FROM teams WHERE name = 'Athletics' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

UPDATE season_games SET homescore = 12, awayscore = 11, gamestatusid = 4
WHERE season_id = 2 AND gamedate = '2026-03-12'
  AND home = (SELECT teamid FROM teams WHERE name = 'Rockies' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away = (SELECT teamid FROM teams WHERE name = 'Cubs' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

UPDATE season_games SET homescore = 15, awayscore = 10, gamestatusid = 4
WHERE season_id = 2 AND gamedate = '2026-03-12'
  AND home = (SELECT teamid FROM teams WHERE name = 'Braves' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away = (SELECT teamid FROM teams WHERE name = 'Blue Jays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

UPDATE season_games SET homescore = 6, awayscore = 10, gamestatusid = 4
WHERE season_id = 2 AND gamedate = '2026-03-14'
  AND home = (SELECT teamid FROM teams WHERE name = 'Red Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away = (SELECT teamid FROM teams WHERE name = 'Blue Jays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

UPDATE season_games SET homescore = 6, awayscore = 19, gamestatusid = 4
WHERE season_id = 2 AND gamedate = '2026-03-14'
  AND home = (SELECT teamid FROM teams WHERE name = 'Athletics' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away = (SELECT teamid FROM teams WHERE name = 'Pirates' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

UPDATE season_games SET homescore = 4, awayscore = 21, gamestatusid = 4
WHERE season_id = 2 AND gamedate = '2026-03-14'
  AND home = (SELECT teamid FROM teams WHERE name = 'Dodgers' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away = (SELECT teamid FROM teams WHERE name = 'Mariners' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

UPDATE season_games SET homescore = 12, awayscore = 9, gamestatusid = 4
WHERE season_id = 2 AND gamedate = '2026-03-14'
  AND home = (SELECT teamid FROM teams WHERE name = 'Astros' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away = (SELECT teamid FROM teams WHERE name = 'Padres' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

UPDATE season_games SET homescore = 9, awayscore = 15, gamestatusid = 4
WHERE season_id = 2 AND gamedate = '2026-03-14'
  AND home = (SELECT teamid FROM teams WHERE name = 'Rays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away = (SELECT teamid FROM teams WHERE name = 'Brewers' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

UPDATE season_games SET homescore = 10, awayscore = 18, gamestatusid = 4
WHERE season_id = 2 AND gamedate = '2026-03-14'
  AND home = (SELECT teamid FROM teams WHERE name = 'Orioles' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away = (SELECT teamid FROM teams WHERE name = 'Angels' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

UPDATE season_games SET homescore = 13, awayscore = 8, gamestatusid = 4
WHERE season_id = 2 AND gamedate = '2026-03-14'
  AND home = (SELECT teamid FROM teams WHERE name = 'Braves' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away = (SELECT teamid FROM teams WHERE name = 'Rockies' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

UPDATE season_games SET homescore = 10, awayscore = 26, gamestatusid = 4
WHERE season_id = 2 AND gamedate = '2026-03-14'
  AND home = (SELECT teamid FROM teams WHERE name = 'Yankees' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away = (SELECT teamid FROM teams WHERE name = 'White Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

UPDATE season_games SET homescore = 8, awayscore = 19, gamestatusid = 4
WHERE season_id = 2 AND gamedate = '2026-03-14'
  AND home = (SELECT teamid FROM teams WHERE name = 'Cubs' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away = (SELECT teamid FROM teams WHERE name = 'Giants' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

UPDATE season_games SET homescore = 24, awayscore = 15, gamestatusid = 4
WHERE season_id = 2 AND gamedate = '2026-03-14'
  AND home = (SELECT teamid FROM teams WHERE name = 'Nationals' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away = (SELECT teamid FROM teams WHERE name = 'Marlins' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

-- Week 5
UPDATE season_games SET homescore = 10, awayscore = 12, gamestatusid = 4
WHERE season_id = 2 AND gamedate = '2026-03-17'
  AND home = (SELECT teamid FROM teams WHERE name = 'Astros' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away = (SELECT teamid FROM teams WHERE name = 'White Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

UPDATE season_games SET homescore = 8, awayscore = 7, gamestatusid = 4
WHERE season_id = 2 AND gamedate = '2026-03-17'
  AND home = (SELECT teamid FROM teams WHERE name = 'Giants' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away = (SELECT teamid FROM teams WHERE name = 'Mariners' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

UPDATE season_games SET homescore = 11, awayscore = 10, gamestatusid = 4
WHERE season_id = 2 AND gamedate = '2026-03-19'
  AND home = (SELECT teamid FROM teams WHERE name = 'Yankees' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away = (SELECT teamid FROM teams WHERE name = 'Orioles' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

UPDATE season_games SET homescore = 11, awayscore = 14, gamestatusid = 4
WHERE season_id = 2 AND gamedate = '2026-03-21'
  AND home = (SELECT teamid FROM teams WHERE name = 'Marlins' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away = (SELECT teamid FROM teams WHERE name = 'Yankees' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

UPDATE season_games SET homescore = 15, awayscore = 15, gamestatusid = 4
WHERE season_id = 2 AND gamedate = '2026-03-21'
  AND home = (SELECT teamid FROM teams WHERE name = 'Athletics' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away = (SELECT teamid FROM teams WHERE name = 'Blue Jays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

UPDATE season_games SET homescore = 15, awayscore = 7, gamestatusid = 4
WHERE season_id = 2 AND gamedate = '2026-03-21'
  AND home = (SELECT teamid FROM teams WHERE name = 'Dodgers' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away = (SELECT teamid FROM teams WHERE name = 'Rockies' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

UPDATE season_games SET homescore = 20, awayscore = 8, gamestatusid = 4
WHERE season_id = 2 AND gamedate = '2026-03-21'
  AND home = (SELECT teamid FROM teams WHERE name = 'Giants' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away = (SELECT teamid FROM teams WHERE name = 'Red Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

UPDATE season_games SET homescore = 9, awayscore = 7, gamestatusid = 4
WHERE season_id = 2 AND gamedate = '2026-03-21'
  AND home = (SELECT teamid FROM teams WHERE name = 'Pirates' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away = (SELECT teamid FROM teams WHERE name = 'Padres' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

UPDATE season_games SET homescore = 15, awayscore = 14, gamestatusid = 4
WHERE season_id = 2 AND gamedate = '2026-03-21'
  AND home = (SELECT teamid FROM teams WHERE name = 'Brewers' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away = (SELECT teamid FROM teams WHERE name = 'Braves' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));
