# Pool game status not updating

For game status (Scheduled, Completed, etc.) to save and show on the Pool Play page, two things must be true:

## 1. Column exists

Run in Neon SQL editor (if you haven’t already):

```sql
ALTER TABLE public.tournamentgames
  ADD COLUMN IF NOT EXISTS gamestatusid integer;
```

## 2. View exposes status

The Pool Play list comes from `poolgames_view`. That view must:

- Include `tournamentgames.gamestatusid`
- Join to `gamestatusoptions` (or your game-status table) so the view has a `gamestatus` (or similar) column for display

**Check your view:**

In Neon SQL editor run:

```sql
SELECT pg_get_viewdef('poolgames_view'::regclass, true);
```

If the result does **not** reference `gamestatusid` or join to `gamestatusoptions`, the view won’t show updated status.

**If you can replace the view**, use the same structure as your current view but add the status join. Example (adapt to match your view’s columns and insert logic):

```sql
-- Example only: adapt to your real poolgames_view definition.
-- Your view may have INSTEAD OF INSERT; keep that if present.

CREATE OR REPLACE VIEW poolgames_view AS
SELECT
  tg.id,
  tg.tournamentid,
  tg.gamedate,
  tg.gametime,
  tg.home,
  tg.away,
  th.name AS hometeam,
  ta.name AS awayteam,
  tg.homescore,
  tg.awayscore,
  tg.poolorbracket,
  tg.gamestatusid,
  gs.gamestatus
FROM tournamentgames tg
JOIN teams th ON th.teamid = tg.home
JOIN teams ta ON ta.teamid = tg.away
LEFT JOIN gamestatusoptions gs ON gs.id = tg.gamestatusid
WHERE tg.poolorbracket = 'Pool';
```

If your view is more complex (e.g. insert/update triggers), add only the join and the `gamestatus` (and optionally `gamestatusid`) columns to the existing view definition, then run `CREATE OR REPLACE VIEW ...` with that definition.
