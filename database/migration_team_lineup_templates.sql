-- Reusable, team-scoped defensive lineup templates ("if Jack pitches, Sam slides
-- to SS, Ben covers 2B..."). In youth baseball there is no pitcher-only player, so
-- moving a kid to the mound cascades through the whole defense, and coaches rebuild
-- the same handful of alignments game after game. These are saved once per TEAM and
-- imported into one or more innings of any game's Defense tab.
--
-- Shared, not personal. Unlike public.roster_positions (per-author ratings), a row
-- here belongs to the whole team: any coach/manager of the team reads and edits all
-- of them. created_by / updated_by are display-only attribution and carry no FK,
-- because Neon Auth owns the user table (same posture as roster_positions.author_user_id).
--
-- The nine assignments live in `payload` JSONB rather than a child rows table:
--
--   * A template is always read and written whole. Nothing queries it by slot, so
--     child rows would add a join to every read and a BEGIN/COMMIT to every write
--     (the Neon HTTP `sql` tag is stateless per call) and buy nothing.
--   * The shape { version, defense: { POS: roster_id|null } } lets a batting order
--     be added later with no migration -- only `version` moves, and readers already
--     tolerate unknown keys.
--   * roster_ids inside JSONB get no FK, and that is the behaviour we WANT. A child
--     table's FK would have to choose ON DELETE CASCADE (a removed player silently
--     shrinks the template, with nothing to show the coach) or ON DELETE RESTRICT
--     (removing a player from the roster starts failing). Instead the API treats any
--     roster_id it cannot resolve to a live, non-deleted, role='player' row on THIS
--     team as an empty slot: tolerated on read (reported as `missing_roster_ids`, so
--     the UI can say "no longer on the roster") and stripped on the next write, so a
--     save self-heals. Both deletion paths land here -- /roster/[rosterId] DELETE is
--     a hard delete (no row survives) and /roster/[rosterId]/anonymize is a soft one
--     (row survives with deleted_at set and the name overwritten). Resolving scoped
--     by teamid also stops a crafted payload reading back another team's player names.
--
-- Run on: dev branch, LDQA branch.

CREATE TABLE IF NOT EXISTS public.team_lineup_templates (
  id         serial      PRIMARY KEY,
  teamid     integer     NOT NULL REFERENCES public.teams(teamid) ON DELETE CASCADE,
  name       text        NOT NULL,
  payload    jsonb       NOT NULL DEFAULT '{"version": 1, "defense": {}}'::jsonb,
  created_by text        NOT NULL,  -- Neon Auth user id; no FK (managed neon_auth schema)
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_by text,                  -- NULL until someone edits after creation
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.team_lineup_templates'::regclass
      AND conname = 'team_lineup_templates_name_length'
  ) THEN
    ALTER TABLE public.team_lineup_templates
      ADD CONSTRAINT team_lineup_templates_name_length
      CHECK (char_length(btrim(name)) BETWEEN 1 AND 60);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.team_lineup_templates'::regclass
      AND conname = 'team_lineup_templates_payload_shape'
  ) THEN
    -- Deliberately structural, not exhaustive. The API is the authority on which
    -- position keys and roster_ids are legal (it imports POSITIONS from
    -- lib/positions.ts -- the nine fielding positions only, no DH/BN). This CHECK
    -- only stops a scalar or array landing in `payload` and guarantees the version
    -- tag every future reader will branch on.
    ALTER TABLE public.team_lineup_templates
      ADD CONSTRAINT team_lineup_templates_payload_shape
      CHECK (
        jsonb_typeof(payload) = 'object'
        AND jsonb_typeof(payload -> 'defense') = 'object'
        AND (payload ->> 'version') ~ '^[0-9]+$'
      );
  END IF;
END $$;

-- One name per team, case- and whitespace-insensitive. The import modal picks a
-- template by name alone, so two "Jack Pitching" rows are indistinguishable and a
-- coach would import the wrong one. teamid leads, so this also serves the list
-- query and no separate idx_team_lineup_templates_teamid is needed. The API
-- translates the resulting 23505 into a 409.
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_lineup_templates_team_name
  ON public.team_lineup_templates (teamid, lower(btrim(name)));

COMMENT ON TABLE public.team_lineup_templates IS
  'Named, reusable defensive alignments owned by a team. Imported into one or more innings of a game''s Defense tab.';
COMMENT ON COLUMN public.team_lineup_templates.payload IS
  '{"version":1,"defense":{"P":12,"SS":15,...}}. defense keys are the nine positions from lib/positions.ts; values are team_roster.id with no FK -- see the file header for why, and how stale ids are handled.';
COMMENT ON COLUMN public.team_lineup_templates.created_by IS
  'Neon Auth user id of the coach who created it. Display-only attribution; every coach of the team may edit.';
