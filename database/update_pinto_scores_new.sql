-- Update SMYB Pinto Spring 2026 scores (dev branch) — incremental update
-- Source: sanmarcosyouthbaseball.com/schedule/649539/pinto
-- Adds to existing update_pinto_scores.sql (which covers Weeks 2–5 partial)
-- Covers: 5 missing Week 5 games + Weeks 6, 8, 9, 10, 11 partial (64 games total)
--
-- Uses score-agnostic CASE logic since home/away assignment is unknown for new games.
-- Pattern: homescore = TeamA's score if TeamA is home, else TeamB's score.
-- Both CASE legs resolve correctly regardless of which team the schedule made home.

-- ============================================================
-- Week 5 — missing games (not in update_pinto_scores.sql)
-- ============================================================

-- Padres 11, Red Sox 5 (2026-03-19)
UPDATE season_games SET gamestatusid = 4,
  homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Padres'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 11 ELSE  5 END,
  awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Padres'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN  5 ELSE 11 END
WHERE season_id = 2 AND gamedate = '2026-03-19'
  AND home IN (SELECT teamid FROM teams WHERE name IN ('Padres','Red Sox') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away IN (SELECT teamid FROM teams WHERE name IN ('Padres','Red Sox') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

-- Orioles 13, White Sox 4 (2026-03-21)
UPDATE season_games SET gamestatusid = 4,
  homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Orioles'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 13 ELSE  4 END,
  awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Orioles'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN  4 ELSE 13 END
WHERE season_id = 2 AND gamedate = '2026-03-21'
  AND home IN (SELECT teamid FROM teams WHERE name IN ('Orioles','White Sox') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away IN (SELECT teamid FROM teams WHERE name IN ('Orioles','White Sox') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

-- Nationals 15, Rays 11 (2026-03-21)
UPDATE season_games SET gamestatusid = 4,
  homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Nationals' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 15 ELSE 11 END,
  awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Nationals' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 11 ELSE 15 END
WHERE season_id = 2 AND gamedate = '2026-03-21'
  AND home IN (SELECT teamid FROM teams WHERE name IN ('Nationals','Rays') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away IN (SELECT teamid FROM teams WHERE name IN ('Nationals','Rays') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

-- Cubs 11, Angels 7 (2026-03-21)
UPDATE season_games SET gamestatusid = 4,
  homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Cubs'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 11 ELSE  7 END,
  awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Cubs'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN  7 ELSE 11 END
WHERE season_id = 2 AND gamedate = '2026-03-21'
  AND home IN (SELECT teamid FROM teams WHERE name IN ('Cubs','Angels') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away IN (SELECT teamid FROM teams WHERE name IN ('Cubs','Angels') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

-- Astros 11, Mariners 4 (2026-03-21)
UPDATE season_games SET gamestatusid = 4,
  homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Astros'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 11 ELSE  4 END,
  awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Astros'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN  4 ELSE 11 END
WHERE season_id = 2 AND gamedate = '2026-03-21'
  AND home IN (SELECT teamid FROM teams WHERE name IN ('Astros','Mariners') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away IN (SELECT teamid FROM teams WHERE name IN ('Astros','Mariners') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

-- ============================================================
-- Week 6 (Mar 24–28)
-- ============================================================

-- Nationals 13, Brewers 4 (2026-03-24)
UPDATE season_games SET gamestatusid = 4,
  homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Nationals' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 13 ELSE  4 END,
  awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Nationals' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN  4 ELSE 13 END
WHERE season_id = 2 AND gamedate = '2026-03-24'
  AND home IN (SELECT teamid FROM teams WHERE name IN ('Nationals','Brewers') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away IN (SELECT teamid FROM teams WHERE name IN ('Nationals','Brewers') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

-- Pirates 18, Dodgers 3 (2026-03-24)
UPDATE season_games SET gamestatusid = 4,
  homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Pirates'  AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 18 ELSE  3 END,
  awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Pirates'  AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN  3 ELSE 18 END
WHERE season_id = 2 AND gamedate = '2026-03-24'
  AND home IN (SELECT teamid FROM teams WHERE name IN ('Pirates','Dodgers') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away IN (SELECT teamid FROM teams WHERE name IN ('Pirates','Dodgers') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

-- Angels 15, Rockies 5 (2026-03-26)
UPDATE season_games SET gamestatusid = 4,
  homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Angels'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 15 ELSE  5 END,
  awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Angels'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN  5 ELSE 15 END
WHERE season_id = 2 AND gamedate = '2026-03-26'
  AND home IN (SELECT teamid FROM teams WHERE name IN ('Angels','Rockies') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away IN (SELECT teamid FROM teams WHERE name IN ('Angels','Rockies') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

-- Rays 16, Marlins 13 (2026-03-26)
UPDATE season_games SET gamestatusid = 4,
  homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Rays'     AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 16 ELSE 13 END,
  awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Rays'     AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 13 ELSE 16 END
WHERE season_id = 2 AND gamedate = '2026-03-26'
  AND home IN (SELECT teamid FROM teams WHERE name IN ('Rays','Marlins') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away IN (SELECT teamid FROM teams WHERE name IN ('Rays','Marlins') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

-- Nationals 11, Braves 5 (2026-03-28)
UPDATE season_games SET gamestatusid = 4,
  homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Nationals' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 11 ELSE  5 END,
  awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Nationals' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN  5 ELSE 11 END
WHERE season_id = 2 AND gamedate = '2026-03-28'
  AND home IN (SELECT teamid FROM teams WHERE name IN ('Nationals','Braves') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away IN (SELECT teamid FROM teams WHERE name IN ('Nationals','Braves') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

-- Blue Jays 13, Giants 10 (2026-03-28)
UPDATE season_games SET gamestatusid = 4,
  homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Blue Jays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 13 ELSE 10 END,
  awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Blue Jays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 10 ELSE 13 END
WHERE season_id = 2 AND gamedate = '2026-03-28'
  AND home IN (SELECT teamid FROM teams WHERE name IN ('Blue Jays','Giants') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away IN (SELECT teamid FROM teams WHERE name IN ('Blue Jays','Giants') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

-- Yankees 14, Rays 8 (2026-03-28)
UPDATE season_games SET gamestatusid = 4,
  homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Yankees'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 14 ELSE  8 END,
  awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Yankees'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN  8 ELSE 14 END
WHERE season_id = 2 AND gamedate = '2026-03-28'
  AND home IN (SELECT teamid FROM teams WHERE name IN ('Yankees','Rays') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away IN (SELECT teamid FROM teams WHERE name IN ('Yankees','Rays') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

-- Brewers 12, Dodgers 11 (2026-03-28)
UPDATE season_games SET gamestatusid = 4,
  homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Brewers'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 12 ELSE 11 END,
  awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Brewers'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 11 ELSE 12 END
WHERE season_id = 2 AND gamedate = '2026-03-28'
  AND home IN (SELECT teamid FROM teams WHERE name IN ('Brewers','Dodgers') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away IN (SELECT teamid FROM teams WHERE name IN ('Brewers','Dodgers') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

-- Cubs 12, White Sox 7 (2026-03-28)
UPDATE season_games SET gamestatusid = 4,
  homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Cubs'      AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 12 ELSE  7 END,
  awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Cubs'      AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN  7 ELSE 12 END
WHERE season_id = 2 AND gamedate = '2026-03-28'
  AND home IN (SELECT teamid FROM teams WHERE name IN ('Cubs','White Sox') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away IN (SELECT teamid FROM teams WHERE name IN ('Cubs','White Sox') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

-- Pirates 21, Mariners 8 (2026-03-28)
UPDATE season_games SET gamestatusid = 4,
  homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Pirates'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 21 ELSE  8 END,
  awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Pirates'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN  8 ELSE 21 END
WHERE season_id = 2 AND gamedate = '2026-03-28'
  AND home IN (SELECT teamid FROM teams WHERE name IN ('Pirates','Mariners') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away IN (SELECT teamid FROM teams WHERE name IN ('Pirates','Mariners') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

-- Padres 13, Athletics 12 (2026-03-28)
UPDATE season_games SET gamestatusid = 4,
  homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Padres'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 13 ELSE 12 END,
  awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Padres'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 12 ELSE 13 END
WHERE season_id = 2 AND gamedate = '2026-03-28'
  AND home IN (SELECT teamid FROM teams WHERE name IN ('Padres','Athletics') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away IN (SELECT teamid FROM teams WHERE name IN ('Padres','Athletics') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

-- Rockies 12, Red Sox 4 (2026-03-28)
UPDATE season_games SET gamestatusid = 4,
  homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Rockies'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 12 ELSE  4 END,
  awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Rockies'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN  4 ELSE 12 END
WHERE season_id = 2 AND gamedate = '2026-03-28'
  AND home IN (SELECT teamid FROM teams WHERE name IN ('Rockies','Red Sox') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away IN (SELECT teamid FROM teams WHERE name IN ('Rockies','Red Sox') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

-- Angels 6, Astros 6 — TIE (2026-03-28)
UPDATE season_games SET homescore = 6, awayscore = 6, gamestatusid = 4
WHERE season_id = 2 AND gamedate = '2026-03-28'
  AND home IN (SELECT teamid FROM teams WHERE name IN ('Angels','Astros') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away IN (SELECT teamid FROM teams WHERE name IN ('Angels','Astros') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

-- Orioles 21, Marlins 8 (2026-03-28)
UPDATE season_games SET gamestatusid = 4,
  homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Orioles'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 21 ELSE  8 END,
  awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Orioles'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN  8 ELSE 21 END
WHERE season_id = 2 AND gamedate = '2026-03-28'
  AND home IN (SELECT teamid FROM teams WHERE name IN ('Orioles','Marlins') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away IN (SELECT teamid FROM teams WHERE name IN ('Orioles','Marlins') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

-- ============================================================
-- Week 8 (Apr 7–11)  [Week 7 = spring break, no games]
-- ============================================================

-- Athletics 14, Yankees 13 (2026-04-07)
UPDATE season_games SET gamestatusid = 4,
  homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Athletics' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 14 ELSE 13 END,
  awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Athletics' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 13 ELSE 14 END
WHERE season_id = 2 AND gamedate = '2026-04-07'
  AND home IN (SELECT teamid FROM teams WHERE name IN ('Athletics','Yankees') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away IN (SELECT teamid FROM teams WHERE name IN ('Athletics','Yankees') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

-- Padres 14, Orioles 8 (2026-04-07)
UPDATE season_games SET gamestatusid = 4,
  homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Padres'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 14 ELSE  8 END,
  awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Padres'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN  8 ELSE 14 END
WHERE season_id = 2 AND gamedate = '2026-04-07'
  AND home IN (SELECT teamid FROM teams WHERE name IN ('Padres','Orioles') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away IN (SELECT teamid FROM teams WHERE name IN ('Padres','Orioles') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

-- Braves 8, Astros 4 (2026-04-09)
UPDATE season_games SET gamestatusid = 4,
  homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Braves'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN  8 ELSE  4 END,
  awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Braves'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN  4 ELSE  8 END
WHERE season_id = 2 AND gamedate = '2026-04-09'
  AND home IN (SELECT teamid FROM teams WHERE name IN ('Braves','Astros') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away IN (SELECT teamid FROM teams WHERE name IN ('Braves','Astros') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

-- Blue Jays 12, Pirates 4 (2026-04-09)
UPDATE season_games SET gamestatusid = 4,
  homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Blue Jays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 12 ELSE  4 END,
  awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Blue Jays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN  4 ELSE 12 END
WHERE season_id = 2 AND gamedate = '2026-04-09'
  AND home IN (SELECT teamid FROM teams WHERE name IN ('Blue Jays','Pirates') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away IN (SELECT teamid FROM teams WHERE name IN ('Blue Jays','Pirates') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

-- Padres 20, Rockies 12 (2026-04-11)
UPDATE season_games SET gamestatusid = 4,
  homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Padres'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 20 ELSE 12 END,
  awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Padres'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 12 ELSE 20 END
WHERE season_id = 2 AND gamedate = '2026-04-11'
  AND home IN (SELECT teamid FROM teams WHERE name IN ('Padres','Rockies') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away IN (SELECT teamid FROM teams WHERE name IN ('Padres','Rockies') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

-- Giants 15, Angels 10 (2026-04-11)
UPDATE season_games SET gamestatusid = 4,
  homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Giants'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 15 ELSE 10 END,
  awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Giants'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 10 ELSE 15 END
WHERE season_id = 2 AND gamedate = '2026-04-11'
  AND home IN (SELECT teamid FROM teams WHERE name IN ('Giants','Angels') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away IN (SELECT teamid FROM teams WHERE name IN ('Giants','Angels') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

-- Blue Jays 13, White Sox 6 (2026-04-11)
UPDATE season_games SET gamestatusid = 4,
  homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Blue Jays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 13 ELSE  6 END,
  awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Blue Jays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN  6 ELSE 13 END
WHERE season_id = 2 AND gamedate = '2026-04-11'
  AND home IN (SELECT teamid FROM teams WHERE name IN ('Blue Jays','White Sox') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away IN (SELECT teamid FROM teams WHERE name IN ('Blue Jays','White Sox') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

-- Cubs 18, Rays 7 (2026-04-11)
UPDATE season_games SET gamestatusid = 4,
  homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Cubs'      AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 18 ELSE  7 END,
  awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Cubs'      AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN  7 ELSE 18 END
WHERE season_id = 2 AND gamedate = '2026-04-11'
  AND home IN (SELECT teamid FROM teams WHERE name IN ('Cubs','Rays') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away IN (SELECT teamid FROM teams WHERE name IN ('Cubs','Rays') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

-- Brewers 14, Pirates 11 (2026-04-11)
UPDATE season_games SET gamestatusid = 4,
  homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Brewers'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 14 ELSE 11 END,
  awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Brewers'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 11 ELSE 14 END
WHERE season_id = 2 AND gamedate = '2026-04-11'
  AND home IN (SELECT teamid FROM teams WHERE name IN ('Brewers','Pirates') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away IN (SELECT teamid FROM teams WHERE name IN ('Brewers','Pirates') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

-- Red Sox 24, Marlins 6 (2026-04-11)
UPDATE season_games SET gamestatusid = 4,
  homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Red Sox'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 24 ELSE  6 END,
  awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Red Sox'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN  6 ELSE 24 END
WHERE season_id = 2 AND gamedate = '2026-04-11'
  AND home IN (SELECT teamid FROM teams WHERE name IN ('Red Sox','Marlins') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away IN (SELECT teamid FROM teams WHERE name IN ('Red Sox','Marlins') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

-- Nationals 19, Astros 10 (2026-04-11)
UPDATE season_games SET gamestatusid = 4,
  homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Nationals' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 19 ELSE 10 END,
  awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Nationals' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 10 ELSE 19 END
WHERE season_id = 2 AND gamedate = '2026-04-11'
  AND home IN (SELECT teamid FROM teams WHERE name IN ('Nationals','Astros') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away IN (SELECT teamid FROM teams WHERE name IN ('Nationals','Astros') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

-- Braves 5, Orioles 3 (2026-04-11)
UPDATE season_games SET gamestatusid = 4,
  homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Braves'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN  5 ELSE  3 END,
  awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Braves'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN  3 ELSE  5 END
WHERE season_id = 2 AND gamedate = '2026-04-11'
  AND home IN (SELECT teamid FROM teams WHERE name IN ('Braves','Orioles') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away IN (SELECT teamid FROM teams WHERE name IN ('Braves','Orioles') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

-- Dodgers 10, Yankees 5 (2026-04-11)
UPDATE season_games SET gamestatusid = 4,
  homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Dodgers'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 10 ELSE  5 END,
  awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Dodgers'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN  5 ELSE 10 END
WHERE season_id = 2 AND gamedate = '2026-04-11'
  AND home IN (SELECT teamid FROM teams WHERE name IN ('Dodgers','Yankees') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away IN (SELECT teamid FROM teams WHERE name IN ('Dodgers','Yankees') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

-- Athletics 5, Mariners 4 (2026-04-11)
UPDATE season_games SET gamestatusid = 4,
  homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Athletics' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN  5 ELSE  4 END,
  awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Athletics' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN  4 ELSE  5 END
WHERE season_id = 2 AND gamedate = '2026-04-11'
  AND home IN (SELECT teamid FROM teams WHERE name IN ('Athletics','Mariners') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away IN (SELECT teamid FROM teams WHERE name IN ('Athletics','Mariners') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

-- ============================================================
-- Week 9 (Apr 14–18)
-- ============================================================

-- Giants 16, Rockies 10 (2026-04-14)
UPDATE season_games SET gamestatusid = 4,
  homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Giants'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 16 ELSE 10 END,
  awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Giants'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 10 ELSE 16 END
WHERE season_id = 2 AND gamedate = '2026-04-14'
  AND home IN (SELECT teamid FROM teams WHERE name IN ('Giants','Rockies') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away IN (SELECT teamid FROM teams WHERE name IN ('Giants','Rockies') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

-- Cubs 11, Brewers 10 (2026-04-14)
UPDATE season_games SET gamestatusid = 4,
  homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Cubs'      AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 11 ELSE 10 END,
  awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Cubs'      AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 10 ELSE 11 END
WHERE season_id = 2 AND gamedate = '2026-04-14'
  AND home IN (SELECT teamid FROM teams WHERE name IN ('Cubs','Brewers') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away IN (SELECT teamid FROM teams WHERE name IN ('Cubs','Brewers') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

-- White Sox 12, Marlins 7 (2026-04-16)
UPDATE season_games SET gamestatusid = 4,
  homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'White Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 12 ELSE  7 END,
  awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'White Sox' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN  7 ELSE 12 END
WHERE season_id = 2 AND gamedate = '2026-04-16'
  AND home IN (SELECT teamid FROM teams WHERE name IN ('White Sox','Marlins') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away IN (SELECT teamid FROM teams WHERE name IN ('White Sox','Marlins') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

-- Nationals 13, Mariners 10 (2026-04-16)
UPDATE season_games SET gamestatusid = 4,
  homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Nationals' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 13 ELSE 10 END,
  awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Nationals' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 10 ELSE 13 END
WHERE season_id = 2 AND gamedate = '2026-04-16'
  AND home IN (SELECT teamid FROM teams WHERE name IN ('Nationals','Mariners') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away IN (SELECT teamid FROM teams WHERE name IN ('Nationals','Mariners') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

-- Rays 14, Red Sox 12 (2026-04-18)
UPDATE season_games SET gamestatusid = 4,
  homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Rays'      AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 14 ELSE 12 END,
  awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Rays'      AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 12 ELSE 14 END
WHERE season_id = 2 AND gamedate = '2026-04-18'
  AND home IN (SELECT teamid FROM teams WHERE name IN ('Rays','Red Sox') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away IN (SELECT teamid FROM teams WHERE name IN ('Rays','Red Sox') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

-- Padres 12, Brewers 12 — TIE (2026-04-18)
UPDATE season_games SET homescore = 12, awayscore = 12, gamestatusid = 4
WHERE season_id = 2 AND gamedate = '2026-04-18'
  AND home IN (SELECT teamid FROM teams WHERE name IN ('Padres','Brewers') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away IN (SELECT teamid FROM teams WHERE name IN ('Padres','Brewers') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

-- Mariners 17, Rockies 7 (2026-04-18)
UPDATE season_games SET gamestatusid = 4,
  homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Mariners'  AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 17 ELSE  7 END,
  awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Mariners'  AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN  7 ELSE 17 END
WHERE season_id = 2 AND gamedate = '2026-04-18'
  AND home IN (SELECT teamid FROM teams WHERE name IN ('Mariners','Rockies') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away IN (SELECT teamid FROM teams WHERE name IN ('Mariners','Rockies') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

-- Giants 9, White Sox 9 — TIE (2026-04-18)
UPDATE season_games SET homescore = 9, awayscore = 9, gamestatusid = 4
WHERE season_id = 2 AND gamedate = '2026-04-18'
  AND home IN (SELECT teamid FROM teams WHERE name IN ('Giants','White Sox') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away IN (SELECT teamid FROM teams WHERE name IN ('Giants','White Sox') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

-- Blue Jays 21, Marlins 2 (2026-04-18)
UPDATE season_games SET gamestatusid = 4,
  homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Blue Jays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 21 ELSE  2 END,
  awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Blue Jays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN  2 ELSE 21 END
WHERE season_id = 2 AND gamedate = '2026-04-18'
  AND home IN (SELECT teamid FROM teams WHERE name IN ('Blue Jays','Marlins') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away IN (SELECT teamid FROM teams WHERE name IN ('Blue Jays','Marlins') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

-- Braves 11, Cubs 5 (2026-04-18)
UPDATE season_games SET gamestatusid = 4,
  homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Braves'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 11 ELSE  5 END,
  awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Braves'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN  5 ELSE 11 END
WHERE season_id = 2 AND gamedate = '2026-04-18'
  AND home IN (SELECT teamid FROM teams WHERE name IN ('Braves','Cubs') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away IN (SELECT teamid FROM teams WHERE name IN ('Braves','Cubs') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

-- Angels 8, Athletics 5 (2026-04-18)
UPDATE season_games SET gamestatusid = 4,
  homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Angels'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN  8 ELSE  5 END,
  awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Angels'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN  5 ELSE  8 END
WHERE season_id = 2 AND gamedate = '2026-04-18'
  AND home IN (SELECT teamid FROM teams WHERE name IN ('Angels','Athletics') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away IN (SELECT teamid FROM teams WHERE name IN ('Angels','Athletics') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

-- Nationals 20, Pirates 10 (2026-04-18)
UPDATE season_games SET gamestatusid = 4,
  homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Nationals' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 20 ELSE 10 END,
  awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Nationals' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 10 ELSE 20 END
WHERE season_id = 2 AND gamedate = '2026-04-18'
  AND home IN (SELECT teamid FROM teams WHERE name IN ('Nationals','Pirates') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away IN (SELECT teamid FROM teams WHERE name IN ('Nationals','Pirates') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

-- Orioles 6, Dodgers 4 (2026-04-18)
UPDATE season_games SET gamestatusid = 4,
  homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Orioles'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN  6 ELSE  4 END,
  awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Orioles'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN  4 ELSE  6 END
WHERE season_id = 2 AND gamedate = '2026-04-18'
  AND home IN (SELECT teamid FROM teams WHERE name IN ('Orioles','Dodgers') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away IN (SELECT teamid FROM teams WHERE name IN ('Orioles','Dodgers') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

-- Yankees 10, Astros 6 (2026-04-18)
UPDATE season_games SET gamestatusid = 4,
  homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Yankees'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 10 ELSE  6 END,
  awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Yankees'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN  6 ELSE 10 END
WHERE season_id = 2 AND gamedate = '2026-04-18'
  AND home IN (SELECT teamid FROM teams WHERE name IN ('Yankees','Astros') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away IN (SELECT teamid FROM teams WHERE name IN ('Yankees','Astros') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

-- ============================================================
-- Week 10 (Apr 21–25)
-- ============================================================

-- Dodgers 13, Rays 11 (2026-04-21)
UPDATE season_games SET gamestatusid = 4,
  homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Dodgers'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 13 ELSE 11 END,
  awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Dodgers'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 11 ELSE 13 END
WHERE season_id = 2 AND gamedate = '2026-04-21'
  AND home IN (SELECT teamid FROM teams WHERE name IN ('Dodgers','Rays') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away IN (SELECT teamid FROM teams WHERE name IN ('Dodgers','Rays') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

-- Angels 14, Red Sox 11 (2026-04-21)
UPDATE season_games SET gamestatusid = 4,
  homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Angels'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 14 ELSE 11 END,
  awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Angels'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 11 ELSE 14 END
WHERE season_id = 2 AND gamedate = '2026-04-21'
  AND home IN (SELECT teamid FROM teams WHERE name IN ('Angels','Red Sox') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away IN (SELECT teamid FROM teams WHERE name IN ('Angels','Red Sox') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

-- Cubs 17, Athletics 7 (2026-04-23)
UPDATE season_games SET gamestatusid = 4,
  homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Cubs'      AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 17 ELSE  7 END,
  awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Cubs'      AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN  7 ELSE 17 END
WHERE season_id = 2 AND gamedate = '2026-04-23'
  AND home IN (SELECT teamid FROM teams WHERE name IN ('Cubs','Athletics') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away IN (SELECT teamid FROM teams WHERE name IN ('Cubs','Athletics') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

-- Blue Jays 19, Yankees 5 (2026-04-23)
UPDATE season_games SET gamestatusid = 4,
  homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Blue Jays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 19 ELSE  5 END,
  awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Blue Jays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN  5 ELSE 19 END
WHERE season_id = 2 AND gamedate = '2026-04-23'
  AND home IN (SELECT teamid FROM teams WHERE name IN ('Blue Jays','Yankees') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away IN (SELECT teamid FROM teams WHERE name IN ('Blue Jays','Yankees') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

-- Angels 11, White Sox 5 (2026-04-25)
UPDATE season_games SET gamestatusid = 4,
  homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Angels'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 11 ELSE  5 END,
  awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Angels'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN  5 ELSE 11 END
WHERE season_id = 2 AND gamedate = '2026-04-25'
  AND home IN (SELECT teamid FROM teams WHERE name IN ('Angels','White Sox') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away IN (SELECT teamid FROM teams WHERE name IN ('Angels','White Sox') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

-- Athletics 14, Rockies 9 (2026-04-25)
UPDATE season_games SET gamestatusid = 4,
  homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Athletics' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 14 ELSE  9 END,
  awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Athletics' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN  9 ELSE 14 END
WHERE season_id = 2 AND gamedate = '2026-04-25'
  AND home IN (SELECT teamid FROM teams WHERE name IN ('Athletics','Rockies') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away IN (SELECT teamid FROM teams WHERE name IN ('Athletics','Rockies') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

-- Marlins 12, Giants 7 (2026-04-25)
UPDATE season_games SET gamestatusid = 4,
  homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Marlins'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 12 ELSE  7 END,
  awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Marlins'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN  7 ELSE 12 END
WHERE season_id = 2 AND gamedate = '2026-04-25'
  AND home IN (SELECT teamid FROM teams WHERE name IN ('Marlins','Giants') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away IN (SELECT teamid FROM teams WHERE name IN ('Marlins','Giants') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

-- Nationals 13, Padres 11 (2026-04-25)
UPDATE season_games SET gamestatusid = 4,
  homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Nationals' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 13 ELSE 11 END,
  awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Nationals' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 11 ELSE 13 END
WHERE season_id = 2 AND gamedate = '2026-04-25'
  AND home IN (SELECT teamid FROM teams WHERE name IN ('Nationals','Padres') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away IN (SELECT teamid FROM teams WHERE name IN ('Nationals','Padres') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

-- Brewers 13, Mariners 9 (2026-04-25)
UPDATE season_games SET gamestatusid = 4,
  homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Brewers'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 13 ELSE  9 END,
  awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Brewers'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN  9 ELSE 13 END
WHERE season_id = 2 AND gamedate = '2026-04-25'
  AND home IN (SELECT teamid FROM teams WHERE name IN ('Brewers','Mariners') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away IN (SELECT teamid FROM teams WHERE name IN ('Brewers','Mariners') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

-- Astros 14, Orioles 13 (2026-04-25)
UPDATE season_games SET gamestatusid = 4,
  homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Astros'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 14 ELSE 13 END,
  awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Astros'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 13 ELSE 14 END
WHERE season_id = 2 AND gamedate = '2026-04-25'
  AND home IN (SELECT teamid FROM teams WHERE name IN ('Astros','Orioles') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away IN (SELECT teamid FROM teams WHERE name IN ('Astros','Orioles') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

-- Pirates 15, Yankees 6 (2026-04-25)
UPDATE season_games SET gamestatusid = 4,
  homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Pirates'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 15 ELSE  6 END,
  awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Pirates'   AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN  6 ELSE 15 END
WHERE season_id = 2 AND gamedate = '2026-04-25'
  AND home IN (SELECT teamid FROM teams WHERE name IN ('Pirates','Yankees') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away IN (SELECT teamid FROM teams WHERE name IN ('Pirates','Yankees') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

-- Cubs 8, Dodgers 5 (2026-04-25)
UPDATE season_games SET gamestatusid = 4,
  homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Cubs'      AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN  8 ELSE  5 END,
  awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Cubs'      AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN  5 ELSE  8 END
WHERE season_id = 2 AND gamedate = '2026-04-25'
  AND home IN (SELECT teamid FROM teams WHERE name IN ('Cubs','Dodgers') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away IN (SELECT teamid FROM teams WHERE name IN ('Cubs','Dodgers') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

-- Braves 11, Red Sox 7 (2026-04-25)
UPDATE season_games SET gamestatusid = 4,
  homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Braves'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 11 ELSE  7 END,
  awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Braves'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN  7 ELSE 11 END
WHERE season_id = 2 AND gamedate = '2026-04-25'
  AND home IN (SELECT teamid FROM teams WHERE name IN ('Braves','Red Sox') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away IN (SELECT teamid FROM teams WHERE name IN ('Braves','Red Sox') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

-- Blue Jays 9, Rays 5 (2026-04-25)
UPDATE season_games SET gamestatusid = 4,
  homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Blue Jays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN  9 ELSE  5 END,
  awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Blue Jays' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN  5 ELSE  9 END
WHERE season_id = 2 AND gamedate = '2026-04-25'
  AND home IN (SELECT teamid FROM teams WHERE name IN ('Blue Jays','Rays') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away IN (SELECT teamid FROM teams WHERE name IN ('Blue Jays','Rays') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

-- ============================================================
-- Week 11 partial (Apr 28–30)
-- ============================================================

-- Braves 9, Pirates 5 (2026-04-28)
UPDATE season_games SET gamestatusid = 4,
  homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Braves'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN  9 ELSE  5 END,
  awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Braves'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN  5 ELSE  9 END
WHERE season_id = 2 AND gamedate = '2026-04-28'
  AND home IN (SELECT teamid FROM teams WHERE name IN ('Braves','Pirates') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away IN (SELECT teamid FROM teams WHERE name IN ('Braves','Pirates') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

-- Astros 16, Dodgers 8 (2026-04-28)
UPDATE season_games SET gamestatusid = 4,
  homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Astros'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 16 ELSE  8 END,
  awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Astros'    AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN  8 ELSE 16 END
WHERE season_id = 2 AND gamedate = '2026-04-28'
  AND home IN (SELECT teamid FROM teams WHERE name IN ('Astros','Dodgers') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away IN (SELECT teamid FROM teams WHERE name IN ('Astros','Dodgers') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));

-- Nationals 12, Giants 5 (2026-04-30)
UPDATE season_games SET gamestatusid = 4,
  homescore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Nationals' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN 12 ELSE  5 END,
  awayscore = CASE WHEN home = (SELECT teamid FROM teams WHERE name = 'Nationals' AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2)) THEN  5 ELSE 12 END
WHERE season_id = 2 AND gamedate = '2026-04-30'
  AND home IN (SELECT teamid FROM teams WHERE name IN ('Nationals','Giants') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2))
  AND away IN (SELECT teamid FROM teams WHERE name IN ('Nationals','Giants') AND teamid IN (SELECT team_id FROM season_teams WHERE season_id = 2));
