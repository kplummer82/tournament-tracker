-- ============================================================
-- Migration: formally support unaffiliated leagues
-- ============================================================
-- Adds a per-league free-text column to capture a governing body that
-- isn't in our list (the "Other" choice). Affiliation becomes a three-state
-- choice at create/edit time:
--   governing_body_id set                          -> affiliated with a listed body
--   both null                                      -> Unaffiliated (self-governing)
--   governing_body_id null + governing_body_other  -> "Other": named free-text
-- No pollution of the shared governing_bodies table.

ALTER TABLE leagues ADD COLUMN IF NOT EXISTS governing_body_other TEXT;
