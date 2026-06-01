-- Migration: expose home/away team ids on poolgames_view
-- The view only exposed team names (hometeam/awayteam). Setup-progress needs the
-- team ids to count, per team, how many pool play games each one has — names aren't
-- a reliable join key. We append home/away (ids) at the end so existing column
-- positions are unchanged and the INSTEAD OF triggers keep working.
--
-- Safe to re-run. CREATE OR REPLACE VIEW preserves existing INSTEAD OF triggers
-- (trg_poolgames_view_upsert, trg_poolgames_view_delete).

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
       tg.field,
       tg.home,
       tg.away
FROM tournamentgames tg
LEFT JOIN gamestatusoptions gso ON gso.id = tg.gamestatusid
LEFT JOIN teams th ON th.teamid = tg.home
LEFT JOIN teams ta ON ta.teamid = tg.away
WHERE tg.poolorbracket::text = 'Pool'::text;
