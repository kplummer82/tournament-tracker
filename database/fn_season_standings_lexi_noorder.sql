-- Season standings with lexicographic tiebreaking (no ORDER BY in function).
-- Mirrors fn_pool_standings_lexi_noorder but queries season_games + season_teams.
-- Only 'regular' game_type rows are counted (playoff games are excluded).
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
  ------------------------------------------------------------------- */
  CREATE TEMP TABLE IF NOT EXISTS _sg_work (
    gameid    int,
    home      int,
    away      int,
    homescore int,
    awayscore int,
    game_type text
  ) ON COMMIT DROP;

  TRUNCATE _sg_work;

  /* ----------------------------------------------------------
     Load real regular-season games for this season
  ----------------------------------------------------------- */
  INSERT INTO _sg_work (gameid, home, away, homescore, awayscore, game_type)
  SELECT sg.id, sg.home, sg.away, sg.homescore, sg.awayscore, sg.game_type
  FROM season_games sg
  WHERE sg.season_id = p_season_id
    AND sg.game_type = 'regular'
    AND (
      p_include_in_progress
      OR (sg.homescore IS NOT NULL AND sg.awayscore IS NOT NULL)
    );

  /* ----------------------------------------------------------
     Optional: modeled outcomes (JSON array of objects)
     Expected JSON shape per game:
     { "home": <int>, "away": <int>, "homescore": <int>, "awayscore": <int> }
  ----------------------------------------------------------- */
  IF p_simulate AND p_simulated IS NOT NULL AND jsonb_typeof(p_simulated) = 'array' THEN
    INSERT INTO _sg_work (gameid, home, away, homescore, awayscore, game_type)
    SELECT
      -ROW_NUMBER() OVER () AS gameid,
      s.home,
      s.away,
      COALESCE(s.homescore, 0),
      COALESCE(s.awayscore, 0),
      'regular'
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
      CASE  WHEN tg.homescore IS NULL OR tg.awayscore IS NULL THEN 0
            WHEN tg.homescore > tg.awayscore THEN 1
            WHEN tg.homescore < tg.awayscore THEN 0
            ELSE 0.5 END AS homewins,
      CASE  WHEN tg.homescore IS NULL OR tg.awayscore IS NULL THEN 0
            WHEN (tg.homescore - tg.awayscore) > s.maxrundiff THEN s.maxrundiff
            WHEN (tg.homescore - tg.awayscore) < -s.maxrundiff THEN -s.maxrundiff
            ELSE (tg.homescore - tg.awayscore) END AS homerundiff,
      tg.awayscore AS homerunsagainst
    FROM seasons s
    JOIN _sg_work tg ON tg.game_type = 'regular'
    LEFT JOIN season_teams sthome ON sthome.team_id = tg.home AND sthome.season_id = s.id
    LEFT JOIN season_teams staway ON staway.team_id = tg.away AND staway.season_id = s.id
    LEFT JOIN teams th ON th.teamid = sthome.team_id
    LEFT JOIN teams ta ON ta.teamid = staway.team_id
    WHERE s.id = p_season_id
      AND (p_include_in_progress OR (tg.homescore IS NOT NULL AND tg.awayscore IS NOT NULL))
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
      CASE  WHEN tg.awayscore IS NULL OR tg.homescore IS NULL THEN 0
            WHEN tg.awayscore > tg.homescore THEN 1
            WHEN tg.awayscore < tg.homescore THEN 0
            ELSE 0.5 END AS awaywins,
      CASE  WHEN tg.awayscore IS NULL OR tg.homescore IS NULL THEN 0
            WHEN (tg.awayscore - tg.homescore) > s.maxrundiff THEN s.maxrundiff
            WHEN (tg.awayscore - tg.homescore) < -s.maxrundiff THEN -s.maxrundiff
            ELSE (tg.awayscore - tg.homescore) END AS awayrundiff,
      tg.homescore AS awayrunsagainst
    FROM seasons s
    JOIN _sg_work tg ON tg.game_type = 'regular'
    LEFT JOIN season_teams sthome ON sthome.team_id = tg.home AND sthome.season_id = s.id
    LEFT JOIN season_teams staway ON staway.team_id = tg.away AND staway.season_id = s.id
    LEFT JOIN teams th ON th.teamid = sthome.team_id
    LEFT JOIN teams ta ON ta.teamid = staway.team_id
    WHERE s.id = p_season_id
      AND (p_include_in_progress OR (tg.homescore IS NOT NULL AND tg.awayscore IS NOT NULL))
  ),

  per_team_union AS (
    SELECT
      h.seasonid,
      h.seasonname,
      h.hometeamid      AS teamid,
      h.hometeam        AS team,
      h.homescore       AS runs_for,
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
      a.awayscore       AS runs_for,
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
            WHEN c.code IN ('head_to_head_strict','head_to_head_permissive') THEN (
              WITH g AS (
                SELECT tg.home, tg.away, tg.homescore, tg.awayscore
                FROM _sg_work tg
                WHERE tg.game_type = 'regular'
                  AND (p_include_in_progress OR (tg.homescore IS NOT NULL AND tg.awayscore IS NOT NULL))
                  AND tg.homescore IS NOT NULL
                  AND tg.awayscore IS NOT NULL
              ),
              h2h AS (
                SELECT
                  CASE WHEN m.teamid = g.home THEN g.away
                       WHEN m.teamid = g.away THEN g.home END AS opp,
                  CASE WHEN m.teamid = g.home THEN (g.homescore - g.awayscore)
                       WHEN m.teamid = g.away THEN (g.awayscore - g.homescore) END AS score_delta
                FROM g
                WHERE (g.home = m.teamid AND g.away = ANY(r.members))
                   OR (g.away = m.teamid AND g.home = ANY(r.members))
              ),
              faced      AS (SELECT COUNT(DISTINCT opp) AS opp_count FROM h2h WHERE opp IS NOT NULL),
              group_size AS (SELECT array_length(r.members, 1) AS n)
              SELECT CASE
                WHEN c.code = 'head_to_head_strict' THEN
                  CASE
                    WHEN (SELECT n FROM group_size) = 2
                         AND (SELECT opp_count FROM faced) >= 1
                      THEN ROUND((SELECT AVG(CASE WHEN score_delta > 0 THEN 1.0 WHEN score_delta = 0 THEN 0.5 ELSE 0.0 END) FROM h2h)::numeric, 6)
                    WHEN (SELECT n FROM group_size) >= 3
                         AND (SELECT opp_count FROM faced) = (SELECT n FROM group_size) - 1
                      THEN ROUND((SELECT AVG(CASE WHEN score_delta > 0 THEN 1.0 WHEN score_delta = 0 THEN 0.5 ELSE 0.0 END) FROM h2h)::numeric, 6)
                    ELSE NULL
                  END
                WHEN c.code = 'head_to_head_permissive' THEN
                  CASE
                    WHEN (SELECT COUNT(*) FROM h2h) > 0
                      THEN ROUND((SELECT AVG(CASE WHEN score_delta > 0 THEN 1.0 WHEN score_delta = 0 THEN 0.5 ELSE 0.0 END) FROM h2h)::numeric, 6)
                    ELSE NULL
                  END
              END
            )
            WHEN c.code IN ('head_to_head_rundiff_strict','head_to_head_rundiff_permissive') THEN (
              WITH g AS (
                SELECT tg.home, tg.away, tg.homescore, tg.awayscore
                FROM _sg_work tg
                WHERE tg.game_type = 'regular'
                  AND (p_include_in_progress OR (tg.homescore IS NOT NULL AND tg.awayscore IS NOT NULL))
                  AND tg.homescore IS NOT NULL
                  AND tg.awayscore IS NOT NULL
              ),
              seas AS (SELECT s.maxrundiff AS cap FROM seasons s WHERE s.id = r.seasonid),
              rf AS (
                SELECT
                  CASE
                    WHEN m.teamid = g.home AND g.away = ANY(r.members)
                      THEN GREATEST(LEAST(g.homescore - g.awayscore, (SELECT cap FROM seas)), -(SELECT cap FROM seas))
                    WHEN m.teamid = g.away AND g.home = ANY(r.members)
                      THEN GREATEST(LEAST(g.awayscore - g.homescore, (SELECT cap FROM seas)), -(SELECT cap FROM seas))
                  END AS rd,
                  CASE WHEN m.teamid = g.home THEN g.away
                       WHEN m.teamid = g.away THEN g.home END AS opp
                FROM g
                WHERE (g.home = m.teamid AND g.away = ANY(r.members))
                   OR (g.away = m.teamid AND g.home = ANY(r.members))
              ),
              faced      AS (SELECT COUNT(DISTINCT opp) AS opp_count FROM rf WHERE opp IS NOT NULL),
              group_size AS (SELECT array_length(r.members, 1) AS n)
              SELECT CASE
                WHEN c.code = 'head_to_head_rundiff_strict' THEN
                  CASE
                    WHEN (SELECT n FROM group_size) = 2
                         AND (SELECT opp_count FROM faced) >= 1
                      THEN (SELECT SUM(rd)::numeric FROM rf)
                    WHEN (SELECT n FROM group_size) >= 3
                         AND (SELECT opp_count FROM faced) = (SELECT n FROM group_size) - 1
                      THEN (SELECT SUM(rd)::numeric FROM rf)
                    ELSE NULL
                  END
                WHEN c.code = 'head_to_head_rundiff_permissive' THEN
                  CASE
                    WHEN (SELECT COUNT(rd) FROM rf WHERE rd IS NOT NULL) > 0
                      THEN (SELECT SUM(rd)::numeric FROM rf)
                    ELSE NULL
                  END
              END
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
              WHERE v1.val IS NOT NULL
                AND v2.val IS NOT NULL
                AND (
                     (c.sort_dir = 'DESC' AND v2.val > v1.val)
                  OR (c.sort_dir = 'ASC'  AND v2.val < v1.val)
                )
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
