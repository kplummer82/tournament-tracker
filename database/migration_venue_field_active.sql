-- database/migration_venue_field_active.sql
-- Venue fields are switched on/off per tournament/season instead of deleted.
--
-- A predefined venue copies every field the location has. Most of those aren't
-- used by a given tournament or season, so the venues tab lets an organizer
-- deactivate them: the row stays on the venue (greyed out, one click from
-- coming back) but disappears from every scheduling picker.
--
-- Keeping the row rather than deleting it is also what makes the "location
-- grew a new field" case work — see syncLocationFields() in lib/*/venues.ts,
-- which matches on LOWER(name) and so never resurrects a field the user
-- deliberately switched off.
--
-- Existing rows default to active, matching today's behaviour exactly.

ALTER TABLE tournament_venue_fields
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

ALTER TABLE season_venue_fields
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
