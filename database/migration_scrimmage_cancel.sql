-- Scrimmage cancellation support.
-- Run on: dev (br-billowing-forest-aflgasia), then LDQA (br-dark-paper-afuw26ux), then prod.

INSERT INTO gamestatusoptions (gamestatus, gamestatusdescription)
SELECT 'Canceled', 'Game was canceled by one of the participating teams'
WHERE NOT EXISTS (
  SELECT 1 FROM gamestatusoptions WHERE gamestatus = 'Canceled'
);

ALTER TABLE scrimmages
  ADD COLUMN IF NOT EXISTS cancellation_note    TEXT,
  ADD COLUMN IF NOT EXISTS canceled_by_team_id  INT REFERENCES teams(teamid),
  ADD COLUMN IF NOT EXISTS canceled_at          TIMESTAMPTZ;
