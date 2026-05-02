-- Season standings with lexicographic tiebreaking (no ORDER BY in function).
-- Mirrors fn_pool_standings_lexi_noorder but queries season_games + season_teams.
-- Only 'regular' game_type rows are counted (playoff games are excluded).
-- Forfeit game statuses: 6 = Home Team Forfeit (away wins), 7 = Away Team Forfeit (home wins).
-- Source of truth: run this in Neon to create/update the function.

CREATE OR REPLACE FUNCTION public.fn_season_standings_lexi_noorder(
  p_season_id            integer,
  p_include_in_progress  boolean,
  p_simulate             boolean,
  p_simulated            jsonb)
  RETURNS TABLE(
    seasonid         integer,
    seasonname       text,
    teamid           integer,
    team             text,
    runsscored       integer,
    wins             numeric,
    games            integer,
    wltpct           numeric,
    rundifferential  integer,
    runsagainst      integer,
    rank_final       integer,
    lexi_key         bigint,
    details          jsonb
  )
  LANGUAGE plpgsql
  COST 100
  VOLATILE PARALLEL UNSAFE
  ROWS 1000

AS $BODY$
BEGIN
  /* ------------------------------------------------------------------
     Per-call scratch table.
     Named _sg_work (not "games") to avoid collision with
     fn_pool_standings_lexi_noorder's temp table in the same session.
     winner_side: NULL = normal game, 'home' = home wins (away forfeited),
                  'away' = away wins (home forfeited).
  ------------------------------------------------------------------- */
  CREATE TEMP TABLE IF NOT EXISTS _sg_work (
    gameid       int,
    home         int,
    away         int,
    homescore    int,
    awayscore    int,
    game_type    text,
    winner_side  text   -- NULL | 'home' | 'away'
  ) ON COMMIT DROP;

  TRUNCATE _sg_work;

  /* ----------------------------------------------------------
     Load real regular-season games for this season.
     gamestatusid = 4  → Final (normal scored game)
     gamestatusid = 6  → Home Team Forfeit (winner_side = 'away')
     gamestatusid = 7  → Away Team Forfeit (winner_side = 'home')
     Scheduled, delayed, in-progress, and rained-out games are
     excluded from standings.
  ----------------------------------------------------------- */
  INSERT INTO _sg_work (gameid, home, away, homescore, awayscore, game_type, winner_side)
  SELECT
    sg.id,
    sg.home,
    sg.away,
    sg.homescore,
    sg.awayscore,
    sg.game_type,
    CASE sg.gamestatusid
      WHEN 6 THEN 'away'   -- Home Team Forfeit → away wins
      WHEN 7 THEN 'home'   -- Away Team Forfeit → home wins
      ELSE NULL
    END
  FROM season_games sg
  WHERE sg.season_id = p_season_id
    AND sg.game_type = 'regular'
    AND sg.gamestatusid IN (4, 6, 7);

  /* ----------------------------------------------------------
     Optional: modeled outcomes (JSON array of objects)
     Expected JSON shape per game:
     { "home": <int>, "away": <int>, "homescore": <int>, "awayscore": <int> }
  ----------------------------------------------------------- */
  IF p_simulate AND p_simulated IS NOT NULL AND jsonb_typeof(p_simulated) = 'array' THEN
    INSERT INTO _sg_work (gameid, home, away, homescore, awayscore, game_type, winner_side)
    SELECT
      -ROW_NUMBER() OVER () AS gameid,
      s.home,
      s.away,
      COALESCE(s.homescore, 0),
      COALESCE(s.awayscore, 0),
      'regular',
      NULL
    FROM jsonb_to_recordset(p_simulated) AS s(
      home      int,
      away      int,
      homescore int,
      awayscore int
    )
    WHERE EXISTS (
      SELECT 1 FROM season_teams st
      WHERE st.season_id = p_season_id AND st.team_id = s.home
    )
    AND EXISTS (
      SELECT 1 FROM season_teams st
      WHERE st.season_id = p_season_id AND st.team_id = s.away
    );
  END IF;

  /* ----------------------------------------------------------
     Main standings query
  ----------------------------------------------------------- */
  RETURN QUERY
  WITH RECURSIVE
  /* seed full team list so 0-game teams are included */
  all_teams AS (
    SELECT
      st.season_id  AS seasonid,
      s.name        AS seasonname,
      st.team_id    AS teamid,
      tm.name       AS team
    FROM season_teams st
    JOIN seasons s ON s.id     = st.season_id
    JOIN teams   tm ON tm.teamid = st.team_id
    WHERE st.season_id = p_season_id
  ),

  /* 1) Per-game rows (home perspective) */
  home_rows AS (
    SELECT
      s.id            AS seasonid,
      s.name          AS seasonname,
      tg.gameid,
      tg.home         AS hometeamid,
      tg.away         AS awayteamid,
      th.name         AS hometeam,
      ta.name         AS awayteam,
      tg.homescore,
      tg.awayscore,
      tg.winner_side,
      /* Wins: forfeit overrides score-based logic */
      CASE
        WHEN tg.winner_side = 'home' THEN 1
        WHEN tg.winner_side = 'away' THEN 0
        WHEN tg.homescore IS NULL OR tg.awayscore IS NULL THEN 0
        WHEN tg.homescore > tg.awayscore THEN 1
        WHEN tg.homescore < tg.awayscore THEN 0
        ELSE 0.5
      END AS homewins,
      /* Run diff: forfeits use forfeit_run_diff; normal games capped at maxrundiff */
      CASE
        WHEN tg.winner_side = 'home' THEN  COALESCE(s.forfeit_run_diff, 0)
        WHEN tg.winner_side = 'away' THEN -COALESCE(s.forfeit_run_diff, 0)
        WHEN tg.homescore IS NULL OR tg.awayscore IS NULL THEN 0
        WHEN (tg.homescore - tg.awayscore) >  s.maxrundiff THEN  s.maxrundiff
        WHEN (tg.homescore - tg.awayscore) < -s.maxrundiff THEN -s.maxrundiff
        ELSE (tg.homescore - tg.awayscore)
      END AS homerundiff,
      /* Runs scored: forfeit winner gets forfeit_run_diff, loser gets 0 */
      CASE WHEN tg.winner_side = 'home' THEN COALESCE(s.forfeit_run_diff, 0)
           WHEN tg.winner_side = 'away' THEN 0
           ELSE tg.homescore END AS home_runs_for,
      /* Runs against: forfeit winner gets 0, loser gets forfeit_run_diff */
      CASE WHEN tg.winner_side = 'home' THEN 0
           WHEN tg.winner_side = 'away' THEN COALESCE(s.forfeit_run_diff, 0)
           ELSE tg.awayscore END AS homerunsagainst
    FROM seasons s
    JOIN _sg_work tg ON tg.game_type = 'regular'
    LEFT JOIN season_teams sthome ON sthome.team_id = tg.home AND sthome.season_id = s.id
    LEFT JOIN season_teams staway ON staway.team_id = tg.away AND staway.season_id = s.id
    LEFT JOIN teams th ON th.teamid = sthome.team_id
    LEFT JOIN teams ta ON ta.teamid = staway.team_id
    WHERE s.id = p_season_id
      AND (p_include_in_progress
           OR tg.winner_side IS NOT NULL
           OR (tg.homescore IS NOT NULL AND tg.awayscore IS NOT NULL))
  ),

  /* 1b) Per-game rows (away perspective) */
  away_rows AS (
    SELECT
      s.id            AS seasonid,
      s.name          AS seasonname,
      tg.gameid,
      tg.home         AS hometeamid,
      tg.away         AS awayteamid,
      th.name         AS hometeam,
      ta.name         AS awayteam,
      tg.homescore,
      tg.awayscore,
      tg.winner_side,
      /* Wins: forfeit overrides score-based logic */
      CASE
        WHEN tg.winner_side = 'away' THEN 1
        WHEN tg.winner_side = 'home' THEN 0
        WHEN tg.awayscore IS NULL OR tg.homescore IS NULL THEN 0
        WHEN tg.awayscore > tg.homescore THEN 1
        WHEN tg.awayscore < tg.homescore THEN 0
        ELSE 0.5
      END AS awaywins,
      /* Run diff: forfeits use forfeit_run_diff; normal games capped at maxrundiff */
      CASE
        WHEN tg.winner_side = 'away' THEN  COALESCE(s.forfeit_run_diff, 0)
        WHEN tg.winner_side = 'home' THEN -COALESCE(s.forfeit_run_diff, 0)
        WHEN tg.awayscore IS NULL OR tg.homescore IS NULL THEN 0
        WHEN (tg.awayscore - tg.homescore) >  s.maxrundiff THEN  s.maxrundiff
        WHEN (tg.awayscore - tg.homescore) < -s.maxrundiff THEN -s.maxrundiff
        ELSE (tg.awayscore - tg.homescore)
      END AS awayrundiff,
      /* Runs scored: forfeit winner gets forfeit_run_diff, loser gets 0 */
      CASE WHEN tg.winner_side = 'away' THEN COALESCE(s.forfeit_run_diff, 0)
           WHEN tg.winner_side = 'home' THEN 0
           ELSE tg.awayscore END AS away_runs_for,
      /* Runs against: forfeit winner gets 0, loser gets forfeit_run_diff */
      CASE WHEN tg.winner_side = 'away' THEN 0
           WHEN tg.winner_side = 'home' THEN COALESCE(s.forfeit_run_diff, 0)
           ELSE tg.homescore END AS awayrunsagainst
    FROM seasons s
    JOIN _sg_work tg ON tg.game_type = 'regular'
    LEFT JOIN season_teams sthome ON sthome.team_id = tg.home AND sthome.season_id = s.id
    LEFT JOIN season_teams staway ON staway.team_id = tg.away AND staway.season_id = s.id
    LEFT JOIN teams th ON th.teamid = sthome.team_id
    LEFT JOIN teams ta ON ta.teamid = staway.team_id
    WHERE s.id = p_season_id
      AND (p_include_in_progress
           OR tg.winner_side IS NOT NULL
           OR (tg.awayscore IS NOT NULL AND tg.homescore IS NOT NULL))
  ),

  per_team_union AS (
    SELECT
      h.seasonid,
      h.seasonname,
      h.hometeamid      AS teamid,
      h.hometeam        AS team,
      h.home_runs_for   AS runs_for,
      h.homewins        AS win_pts,
      h.homerundiff     AS run_diff,
      h.homerunsagainst AS runs_against
    FROM home_rows h
    UNION ALL
    SELECT
      a.seasonid,
      a.seasonname,
      a.awayteamid      AS teamid,
      a.awayteam        AS team,
      a.away_runs_for   AS runs_for,
      a.awaywins        AS win_pts,
      a.awayrundiff     AS run_diff,
      a.awayrunsagainst AS runs_against
    FROM away_rows a
  ),

  /* Aggregate — left join ensures 0-game teams appear */
  season_results_raw AS (
    SELECT
      p.seasonid,
      p.seasonname,
      p.teamid,
      p.team,
      SUM(p.runs_for)     AS runsscored,
      SUM(p.win_pts)      AS wins,
      COUNT(*)            AS games,
      SUM(p.run_diff)     AS rundifferential,
      SUM(p.runs_against) AS runsagainst
    FROM per_team_union p
    GROUP BY p.seasonid, p.seasonname, p.teamid, p.team
  ),
  season_results AS (
    SELECT
      at.seasonid,
      at.seasonname,
      at.teamid,
      at.team,
      COALESCE(r.runsscored, 0)::int                                            AS runsscored,
      COALESCE(r.wins, 0)::numeric                                              AS wins,
      COALESCE(r.games, 0)::int                                                 AS games,
      CASE WHEN COALESCE(r.games,0) > 0
           THEN (COALESCE(r.wins,0) / r.games)
           ELSE 0 END::numeric(15,6)                                            AS wltpct,
      COALESCE(r.rundifferential, 0)::int                                       AS rundifferential,
      COALESCE(r.runsagainst, 0)::int                                           AS runsagainst,
      COALESCE(r.runsscored, 0)::int                                            AS adjusted_runs_scored,
      COALESCE(r.runsagainst, 0)::int                                           AS adjusted_runs_against,
      COALESCE(r.rundifferential, 0)::int                                       AS adjusted_run_differential
    FROM all_teams at
    LEFT JOIN season_results_raw r
      ON r.seasonid = at.seasonid
     AND r.teamid   = at.teamid
  ),

  /* 2) Tiebreaker config (priority → ord, NO ORDER BY) */
  cfg0 AS (
    SELECT
      st.priority,
      tb.tiebreaker                       AS code,
      COALESCE(tb."SortDirection",'DESC') AS sort_dir
    FROM season_tiebreakers st
    JOIN tiebreakers tb ON tb.id = st.tiebreaker_id
    WHERE st.season_id = p_season_id
  ),
  cfg AS (
    SELECT
      c0.*,
      1 + (SELECT COUNT(DISTINCT q.priority) FROM cfg0 q WHERE q.priority < c0.priority) AS ord
    FROM cfg0 c0
  ),

  /* 3) Static stats snapshot + JSON for dynamic metric lookup */
  stats  AS ( SELECT sr.*, to_jsonb(sr) AS js FROM season_results sr ),
  bounds AS ( SELECT COALESCE(MAX(ord),0) AS steps FROM cfg ),
  base   AS ( SELECT (SELECT COUNT(*) FROM stats) + 1 AS B ),

  /* 4) Recursive lexicographic ranking (NO ORDER BY) */
  seed AS (
    SELECT
      s.seasonid, s.seasonname, s.teamid, s.team,
      s.runsscored, s.wins, s.games, s.wltpct,
      s.rundifferential, s.runsagainst,
      s.adjusted_runs_scored, s.adjusted_runs_against, s.adjusted_run_differential,
      s.js,
      0::int    AS step,
      0::bigint AS key,
      (SELECT array_agg(s2.teamid) FROM stats s2) AS members,
      '{}'::jsonb AS details
    FROM stats s
  ),
  rec AS (
    SELECT * FROM seed
    UNION ALL
    SELECT
      r.seasonid, r.seasonname, r.teamid, r.team,
      r.runsscored, r.wins, r.games, r.wltpct,
      r.rundifferential, r.runsagainst,
      r.adjusted_runs_scored, r.adjusted_runs_against, r.adjusted_run_differential,
      r.js,
      r.step + 1 AS step,
      r.key * (SELECT B FROM base) + step_calc.my_rnk AS key,
      step_calc.next_members AS members,
      r.details || jsonb_build_object(c.code, step_calc.my_val) AS details
    FROM rec r
    JOIN bounds b ON r.step < b.steps
    JOIN cfg    c ON c.ord  = r.step + 1
    JOIN LATERAL (
      WITH grp_members AS (
        SELECT unnest(r.members) AS teamid
      ),
      member_vals AS (
        SELECT
          m.teamid,
          CASE
            WHEN c.code = 'head_to_head' THEN (
              /*
               * Head-to-Head with dominant-team fallback.
               *
               * Case A: All N*(N-1)/2 pairs have played → use H2H win%.
               * Case B: Not all pairs played, exactly 1 dominant team (can reach all N-1
               *         others via transitive "beats" chain up to depth 4) → dominant gets
               *         1.0, everyone else 0.0.
               * Case C: 0 or 2+ dominant teams → all return NULL → all rank equal → skip.
               *
               * Depth-4 expansion handles groups of up to 5 teams cleanly.
               */
              WITH
              g AS (
                SELECT tg.home, tg.away, tg.homescore, tg.awayscore, tg.winner_side
                FROM _sg_work tg
                WHERE tg.game_type = 'regular'
                  AND (tg.winner_side IS NOT NULL
                       OR (tg.homescore IS NOT NULL AND tg.awayscore IS NOT NULL))
                  AND tg.home = ANY(r.members)
                  AND tg.away = ANY(r.members)
              ),
              /* Win points per game, per team perspective */
              game_pts AS (
                SELECT g.home AS team, g.away AS opp,
                  CASE WHEN g.winner_side = 'home' THEN 1.0
                       WHEN g.winner_side = 'away' THEN 0.0
                       WHEN g.homescore > g.awayscore THEN 1.0
                       WHEN g.homescore < g.awayscore THEN 0.0
                       ELSE 0.5 END AS win_pt
                FROM g
                UNION ALL
                SELECT g.away, g.home,
                  CASE WHEN g.winner_side = 'away' THEN 1.0
                       WHEN g.winner_side = 'home' THEN 0.0
                       WHEN g.awayscore > g.homescore THEN 1.0
                       WHEN g.awayscore < g.homescore THEN 0.0
                       ELSE 0.5 END
                FROM g
              ),
              /* Total win pts per ordered pair */
              pair_totals AS (
                SELECT p.team, p.opp, SUM(p.win_pt) AS total_pts
                FROM game_pts p GROUP BY p.team, p.opp
              ),
              /* Directed edge: X beats Y if X's series total strictly exceeds Y's */
              direct_beats AS (
                SELECT a.team AS winner, a.opp AS loser
                FROM pair_totals a
                JOIN pair_totals b ON b.team = a.opp AND b.opp = a.team
                WHERE a.total_pts > b.total_pts
              ),
              /* Count distinct unordered pairs that have played at least once */
              pairs_played AS (
                SELECT LEAST(p.team, p.opp) AS t1, GREATEST(p.team, p.opp) AS t2
                FROM pair_totals p GROUP BY 1, 2
              ),
              group_size AS (SELECT array_length(r.members, 1) AS n),
              all_pairs_played AS (
                SELECT COUNT(*) >= ((SELECT n FROM group_size) * ((SELECT n FROM group_size) - 1) / 2)
                  AS all_played FROM pairs_played
              ),
              /* Transitive reachability, depth 1–4 */
              reach1 AS (SELECT winner AS src, loser AS dst FROM direct_beats),
              reach2 AS (
                SELECT r1.src, db2.loser AS dst FROM reach1 r1
                JOIN direct_beats db2 ON db2.winner = r1.dst WHERE db2.loser <> r1.src
              ),
              reach3 AS (
                SELECT r2.src, db3.loser AS dst FROM reach2 r2
                JOIN direct_beats db3 ON db3.winner = r2.dst WHERE db3.loser <> r2.src
              ),
              reach4 AS (
                SELECT r3.src, db4.loser AS dst FROM reach3 r3
                JOIN direct_beats db4 ON db4.winner = r3.dst WHERE db4.loser <> r3.src
              ),
              all_reachable AS (
                SELECT src, dst FROM reach1 UNION
                SELECT src, dst FROM reach2 UNION
                SELECT src, dst FROM reach3 UNION
                SELECT src, dst FROM reach4
              ),
              /* How many tied group members can each team reach? */
              reach_counts AS (
                SELECT gm.teamid, COUNT(ar.dst) AS reach_count
                FROM (SELECT unnest(r.members) AS teamid) gm
                LEFT JOIN all_reachable ar
                  ON ar.src = gm.teamid AND ar.dst = ANY(r.members) AND ar.dst <> gm.teamid
                GROUP BY gm.teamid
              ),
              dominant_count AS (
                SELECT COUNT(*) AS cnt FROM reach_counts
                WHERE reach_count = (SELECT n - 1 FROM group_size)
              ),
              final_val AS (
                SELECT gm.teamid,
                  CASE
                    /* Case A: full round-robin played → use win% */
                    WHEN (SELECT all_played FROM all_pairs_played) THEN
                      ROUND(COALESCE((
                        SELECT AVG(gp.win_pt) FROM game_pts gp WHERE gp.team = gm.teamid
                      ), 0.0)::numeric, 6)
                    /* Case B: exactly one dominant team */
                    WHEN (SELECT cnt FROM dominant_count) = 1 THEN
                      CASE WHEN rc.reach_count = (SELECT n - 1 FROM group_size)
                           THEN 1.0::numeric ELSE 0.0::numeric END
                    /* Case C: unresolvable — NULL for all → all rank equal → skip */
                    ELSE NULL
                  END AS val
                FROM (SELECT unnest(r.members) AS teamid) gm
                JOIN reach_counts rc USING (teamid)
              )
              SELECT fv.val FROM final_val fv WHERE fv.teamid = m.teamid
            )
            WHEN c.code = 'head_to_head_rundiff' THEN (
              /*
               * H2H Run Differential (permissive).
               * Sum capped run differential vs any tied opponent actually played.
               * Returns NULL only if the team has played zero games against group members.
               */
              WITH
              seas AS (
                SELECT s.maxrundiff AS cap, COALESCE(s.forfeit_run_diff, 0) AS frd
                FROM seasons s WHERE s.id = r.seasonid
              ),
              g AS (
                SELECT tg.home, tg.away, tg.homescore, tg.awayscore, tg.winner_side
                FROM _sg_work tg
                WHERE tg.game_type = 'regular'
                  AND (tg.winner_side IS NOT NULL
                       OR (tg.homescore IS NOT NULL AND tg.awayscore IS NOT NULL))
                  AND tg.home = ANY(r.members)
                  AND tg.away = ANY(r.members)
              ),
              rd_rows AS (
                SELECT g.home AS team,
                  CASE WHEN g.winner_side = 'home' THEN  (SELECT frd FROM seas)
                       WHEN g.winner_side = 'away' THEN -(SELECT frd FROM seas)
                       ELSE GREATEST(LEAST(g.homescore - g.awayscore, (SELECT cap FROM seas)),
                                    -(SELECT cap FROM seas)) END AS rd
                FROM g
                UNION ALL
                SELECT g.away,
                  CASE WHEN g.winner_side = 'away' THEN  (SELECT frd FROM seas)
                       WHEN g.winner_side = 'home' THEN -(SELECT frd FROM seas)
                       ELSE GREATEST(LEAST(g.awayscore - g.homescore, (SELECT cap FROM seas)),
                                    -(SELECT cap FROM seas)) END
                FROM g
              ),
              team_rd AS (
                SELECT rr.team AS teamid, SUM(rr.rd) AS total_rd, COUNT(*) AS game_count
                FROM rd_rows rr WHERE rr.team = ANY(r.members)
                GROUP BY rr.team
              )
              SELECT CASE WHEN COALESCE(tr.game_count, 0) > 0 THEN tr.total_rd::numeric ELSE NULL END
              FROM (SELECT unnest(r.members) AS teamid) gm
              LEFT JOIN team_rd tr ON tr.teamid = gm.teamid
              WHERE gm.teamid = m.teamid
            )
            /* Fallback: read from static snapshot */
            ELSE COALESCE(NULLIF((s.js ->> c.code), '')::numeric, 0::numeric)
          END AS val
        FROM grp_members m
        JOIN stats s USING (teamid)
      ),
      member_ranks AS (
        SELECT
          v1.teamid,
          v1.val,
          1 + COUNT(v2.teamid) FILTER (
              WHERE (c.sort_dir = 'DESC' AND COALESCE(v2.val, 0) > COALESCE(v1.val, 0))
                 OR (c.sort_dir = 'ASC'  AND COALESCE(v2.val, 0) < COALESCE(v1.val, 0))
            ) AS rnk
        FROM member_vals v1
        LEFT JOIN member_vals v2 ON TRUE
        GROUP BY v1.teamid, v1.val
      ),
      my AS (
        SELECT mr.rnk AS my_rnk, mr.val AS my_val
        FROM member_ranks mr
        WHERE mr.teamid = r.teamid
      ),
      next_grp AS (
        SELECT array_agg(mr.teamid) AS next_members
        FROM member_ranks mr
        WHERE mr.rnk = (SELECT my_rnk FROM my)
      )
      SELECT (SELECT my_rnk FROM my)             AS my_rnk,
             (SELECT my_val FROM my)             AS my_val,
             (SELECT next_members FROM next_grp) AS next_members
    ) step_calc ON TRUE
  ),
  final_step AS (
    SELECT * FROM rec
    WHERE step = (SELECT steps FROM bounds)
  )
  SELECT
    f.seasonid,
    f.seasonname,
    f.teamid,
    f.team,
    f.runsscored,
    f.wins,
    f.games,
    f.wltpct,
    f.rundifferential,
    f.runsagainst,
    1 + (SELECT COUNT(DISTINCT z.key) FROM final_step z WHERE z.key < f.key)::int AS rank_final,
    f.key     AS lexi_key,
    f.details AS details
  FROM final_step f
  ;
END;
$BODY$;
