-- Crowdsourced location/field suggestions. Role-holders (any user_roles row)
-- submit proposed edits / new locations / removal flags; admins approve or
-- reject in the review queue; an AI advisor attaches a non-blocking
-- recommendation. The payload is written once at submission and re-validated
-- (same Zod schemas) at approve time. Run on: dev branch first, then LDQA,
-- then prod.

CREATE TABLE IF NOT EXISTS location_suggestions (
  id                SERIAL PRIMARY KEY,
  suggestion_type   TEXT NOT NULL CHECK (suggestion_type IN ('edit','new','removal')),
  location_id       INT REFERENCES locations(id) ON DELETE SET NULL, -- NULL for 'new'; nulled if target deleted
  payload           JSONB NOT NULL DEFAULT '{}'::jsonb, -- proposed change, shape per suggestion_type
  snapshot          JSONB,                              -- target's live values at submission (edit/removal): diff view + staleness check
  reason            TEXT,                               -- submitter's free-text justification

  status            TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','superseded')),
  submitted_by      TEXT NOT NULL,                      -- Neon Auth user id
  submitted_by_name TEXT,                               -- display-name snapshot
  submitted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by       TEXT,
  reviewed_at       TIMESTAMPTZ,
  review_note       TEXT,

  -- AI advisory — nullable/failable by design; never blocks the human queue
  ai_status         TEXT NOT NULL DEFAULT 'pending'
    CHECK (ai_status IN ('pending','running','completed','error','skipped')),
  ai_recommendation TEXT CHECK (ai_recommendation IN ('approve','reject','unsure')),
  ai_confidence     NUMERIC(3,2),                       -- 0.00-1.00
  ai_rationale      TEXT,
  ai_flags          JSONB,                              -- e.g. {"duplicate_location_ids":[12],"flags":["address_mismatch"]}
  ai_model          TEXT,
  ai_analyzed_at    TIMESTAMPTZ,
  ai_error          TEXT
);

CREATE INDEX IF NOT EXISTS idx_location_suggestions_status    ON location_suggestions(status);
CREATE INDEX IF NOT EXISTS idx_location_suggestions_location  ON location_suggestions(location_id);
CREATE INDEX IF NOT EXISTS idx_location_suggestions_submitter ON location_suggestions(submitted_by);
