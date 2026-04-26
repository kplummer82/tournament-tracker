-- League coaches: coaches belong to a league, not a team or division.
-- A coach can be assigned to teams across multiple divisions.
CREATE TABLE IF NOT EXISTS league_coaches (
  id          SERIAL PRIMARY KEY,
  league_id   INT  NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  first_name  TEXT NOT NULL,
  last_name   TEXT NOT NULL,
  phone       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_league_coaches_league_id ON league_coaches(league_id);

-- Coach-team assignments: many-to-many between coaches and teams.
-- A coach can coach multiple teams (even across divisions).
-- A team can have zero or more coaches.
CREATE TABLE IF NOT EXISTS team_coaches (
  team_id   INT NOT NULL REFERENCES teams(teamid) ON DELETE CASCADE,
  coach_id  INT NOT NULL REFERENCES league_coaches(id) ON DELETE CASCADE,
  PRIMARY KEY (team_id, coach_id)
);

CREATE INDEX IF NOT EXISTS idx_team_coaches_coach_id ON team_coaches(coach_id);
