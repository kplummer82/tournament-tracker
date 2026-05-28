-- Scrimmage offers: add a thread/messages table so initial offers, counters,
-- accepts, declines, and withdrawals are all recorded as discrete events with
-- optional notes and (for counters) proposed terms.
--
-- The scrimmage_offers row continues to carry the *current* proposed terms
-- (most recent counter wins). Status gains 'countered'. We add
-- last_action_team_id so the UI can tell whose turn it is.
--
-- Run on: dev (br-billowing-forest-aflgasia), then LDQA (br-dark-paper-afuw26ux), then prod.

-- 1. Allow 'countered' status.
ALTER TABLE scrimmage_offers DROP CONSTRAINT IF EXISTS scrimmage_offers_status_check;
ALTER TABLE scrimmage_offers
  ADD CONSTRAINT scrimmage_offers_status_check
  CHECK (status IN ('pending','countered','accepted','declined','withdrawn'));

-- 2. Track who last acted, so the other side knows it's their turn.
ALTER TABLE scrimmage_offers
  ADD COLUMN IF NOT EXISTS last_action_team_id INT REFERENCES teams(teamid) ON DELETE SET NULL;

-- Backfill: existing offers were last acted on by the offering team.
UPDATE scrimmage_offers
SET last_action_team_id = team_id
WHERE last_action_team_id IS NULL;

-- 3. Thread table.
CREATE TABLE IF NOT EXISTS scrimmage_offer_messages (
  id                       SERIAL PRIMARY KEY,
  offer_id                 INT NOT NULL REFERENCES scrimmage_offers(id) ON DELETE CASCADE,
  sender_team_id           INT NOT NULL REFERENCES teams(teamid) ON DELETE RESTRICT,
  sender_user_id           TEXT NOT NULL,

  action                   TEXT NOT NULL
                             CHECK (action IN ('offered','countered','accepted','declined','withdrawn')),

  proposed_location_id     INT REFERENCES locations(id) ON DELETE SET NULL,
  proposed_location        TEXT,
  proposed_location_field  TEXT,
  proposed_time            TIME,
  note                     TEXT,

  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scrim_offer_msgs_offer  ON scrimmage_offer_messages(offer_id, created_at);
CREATE INDEX IF NOT EXISTS idx_scrim_offer_msgs_sender ON scrimmage_offer_messages(sender_team_id);

-- 4. Backfill: every existing offer gets a synthetic 'offered' message so the
-- thread is non-empty.
INSERT INTO scrimmage_offer_messages
  (offer_id, sender_team_id, sender_user_id, action,
   proposed_location_id, proposed_location, proposed_location_field,
   proposed_time, note, created_at)
SELECT so.id, so.team_id, so.offered_by, 'offered',
       so.proposed_location_id, so.proposed_location, so.proposed_location_field,
       so.proposed_time, so.message, so.created_at
FROM scrimmage_offers so
WHERE NOT EXISTS (
  SELECT 1 FROM scrimmage_offer_messages som WHERE som.offer_id = so.id
);
