-- ============================================================
-- Leagues & Seasons schema
-- Governing bodies > Leagues > League Divisions > Seasons
-- ============================================================

-- 1. Governing bodies (e.g., PONY, Little League International)
CREATE TABLE governing_bodies (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL,
  abbreviation TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Leagues (e.g., San Marcos Youth Baseball)
--    governing_body_id is nullable — leagues can exist without a governing body
CREATE TABLE leagues (
  id                SERIAL PRIMARY KEY,
  governing_body_id INT REFERENCES governing_bodies(id) ON DELETE SET NULL,
  name              TEXT NOT NULL,
  abbreviation      TEXT,
  city              TEXT,
  state             TEXT,
  sportid           INT REFERENCES sport(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. League divisions (e.g., Mustang, Pinto, Bronco)
--    These are age/skill divisions within a league, NOT sport divisions.
CREATE TABLE league_divisions (
  id          SERIAL PRIMARY KEY,
  league_id   INT  NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,   -- e.g., "Mustang"
  age_range   TEXT,            -- e.g., "9-10"
  sort_order  INT  NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(league_id, name)
);

-- 4. Seasons (one per league_division per year/season type)
CREATE TABLE seasons (
  id                   SERIAL PRIMARY KEY,
  league_division_id   INT  NOT NULL REFERENCES league_divisions(id) ON DELETE CASCADE,
  name                 TEXT NOT NULL,          -- e.g., "2025 Spring Season"
  year                 INT  NOT NULL,
  season_type          TEXT NOT NULL CHECK (season_type IN ('spring','summer','fall','winter')),
  status               TEXT NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft','active','playoffs','completed','archived')),
  maxrundiff           INT,
  advances_to_playoffs INT,                    -- how many teams advance to playoff brackets
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Season teams — teams enrolled in a specific season (mirrors tournamentteams)
--    API layer enforces: team.league_id must match the league that owns this season
CREATE TABLE season_teams (
  season_id INT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  team_id   INT NOT NULL REFERENCES teams(teamid) ON DELETE CASCADE,
  PRIMARY KEY (season_id, team_id)
);

-- 6. Season games — all games (regular season + playoff) for a season
CREATE TABLE season_games (
  id           SERIAL PRIMARY KEY,
  season_id    INT  NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  gamedate     DATE,
  gametime     TIME,
  home         INT  NOT NULL REFERENCES teams(teamid),
  away         INT  NOT NULL REFERENCES teams(teamid),
  homescore    INT,
  awayscore    INT,
  game_type    TEXT NOT NULL DEFAULT 'regular'
                 CHECK (game_type IN ('regular','playoff')),
  gamestatusid INT REFERENCES gamestatusoptions(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Season tiebreakers (mirrors tournamenttiebreakers)
CREATE TABLE season_tiebreakers (
  season_id     INT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  tiebreaker_id INT NOT NULL REFERENCES tiebreakers(id),
  priority      INT NOT NULL,
  PRIMARY KEY (season_id, tiebreaker_id)
);

-- 8. Season brackets — named brackets per season (Gold, Silver, Bronze, etc.)
--    Replaces the 1:1 tournament_bracket with an N:1 relationship
CREATE TABLE season_brackets (
  id          SERIAL PRIMARY KEY,
  season_id   INT  NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,          -- e.g., "Gold Bracket", "Silver Bracket"
  sort_order  INT  NOT NULL DEFAULT 0,
  template_id INT REFERENCES bracket_templates(id) ON DELETE SET NULL,
  structure   JSONB,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(season_id, name)
);

-- 9. Season bracket seed assignments (mirrors bracket_assignments)
CREATE TABLE season_bracket_assignments (
  season_bracket_id INT NOT NULL REFERENCES season_brackets(id) ON DELETE CASCADE,
  seed_index        INT NOT NULL,
  team_id           INT NOT NULL REFERENCES teams(teamid),
  PRIMARY KEY (season_bracket_id, seed_index)
);

-- 10. Add league affiliation to teams
--     A team optionally belongs to exactly one league.
--     Teams with league_id = NULL are independent and can play in tournaments.
--     Teams with a league_id can only be enrolled in seasons of that league.
ALTER TABLE teams
  ADD COLUMN league_id INT REFERENCES leagues(id) ON DELETE SET NULL;
