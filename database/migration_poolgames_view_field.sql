-- Migration: expose location_id, location, field on poolgames_view
-- The view previously only exposed tournament_venue_id, so the pool game edit modal
-- could not prefill the saved field on reopen (the field was persisted on tournamentgames
-- but the API GET reads from this view, which dropped the column).
--
-- Safe to re-run. CREATE OR REPLACE VIEW preserves existing INSTEAD OF triggers
-- (trg_poolgames_view_upsert, trg_poolgames_view_delete) because column position,
-- name, and type of the existing columns are unchanged — we only append new columns.

CREATE OR REPLACE VIEW public.poolgames_view AS
SELECT tg.id,
       tg.tournamentid,
       th.name AS hometeam,
       ta.name AS awayteam,
       tg.gamedate,
       tg.gametime,
       tg.homescore,
       tg.awayscore,
       tg.gamestatusid,
       gso.gamestatus,
       tg.tournament_venue_id,
       tg.location_id,
       tg.location,
       tg.field
FROM tournamentgames tg
LEFT JOIN gamestatusoptions gso ON gso.id = tg.gamestatusid
LEFT JOIN teams th ON th.teamid = tg.home
LEFT JOIN teams ta ON ta.teamid = tg.away
WHERE tg.poolorbracket::text = 'Pool'::text;
