-- Pool standings with lexicographic tiebreaking (no ORDER BY in function).
-- Used for pre-bracket standings and for Monte Carlo (p_simulate + p_simulated).
-- Source of truth: run this in Neon to create/update the function.

CREATE OR REPLACE FUNCTION public.fn_pool_standings_lexi_noorder(
	p_tournament_id integer,
	p_include_in_progress boolean,
	p_simulate boolean,
	p_simulated jsonb)
    RETURNS TABLE(tournamentid integer, tournamentname text, teamid integer, team text, runsscored integer, wins numeric, games integer, wltpct numeric, rundifferential integer, runsagainst integer, rank_final integer, lexi_key bigint, details jsonb)
    LANGUAGE plpgsql
    COST 100
    VOLATILE PARALLEL UNSAFE
    ROWS 1000

AS $BODY$
BEGIN
  /* ------------------------------------------------------------------
     Per-call scratch table (safe for many invocations in one session)
  ------------------------------------------------------------------- */
  CREATE TEMP TABLE IF NOT EXISTS games (
    gameid         int,
    home           int,
    away           int,
    homescore      int,
    awayscore      int,
    poolorbracket  text
  ) ON COMMIT DROP;

  TRUNCATE games;

  /* ----------------------------------------------------------
     Load real pool games for this tournament
  ----------------------------------------------------------- */
  INSERT INTO games (gameid, home, away, homescore, awayscore, poolorbracket)
  SELECT tg.id, tg.home, tg.away, tg.homescore, tg.awayscore, tg.poolorbracket
  FROM tournamentgames tg
  WHERE tg.tournamentid = p_tournament_id
    AND tg.poolorbracket = 'Pool'
    AND tg.homescore IS NOT NULL
    AND tg.awayscore IS NOT NULL
    AND (p_include_in_progress OR COALESCE(tg.gamestatusid, 4) IN (4, 6, 7));

  /* ----------------------------------------------------------
     Optional: modeled outcomes (JSON array of objects)
     Expected JSON shape per game:
     { "home": <int>, "away": <int>, "homescore": <int>, "awayscore": <int> }
     (poolorbracket optional, defaults to 'Pool')
  ----------------------------------------------------------- */
  IF p_simulate AND p_simulated IS NOT NULL AND jsonb_typeof(p_simulated) = 'array' THEN
    INSERT INTO games (gameid, home, away, homescore, awayscore, poolorbracket)
    SELECT
      -ROW_NUMBER() OVER () AS gameid,           -- synthetic negative ids
      s.home,
      s.away,
      COALESCE(s.homescore, 0),
      COALESCE(s.awayscore, 0),
      COALESCE(s.poolorbracket, 'Pool')
    FROM jsonb_to_recordset(p_simulated) AS s(
      home int,
      away int,
      homescore int,
      awayscore int,
      poolorbracket text
    )
    /* only include Pool sims */
    WHERE COALESCE(s.poolorbracket, 'Pool') = 'Pool'
      /* ensure both teams belong to this tournament */
      AND EXISTS (
        SELECT 1
        FROM tournamentteams tt
        WHERE tt.tournamentid = p_tournament_id
          AND tt.teamid = s.home
      )
      AND EXISTS (
        SELECT 1
        FROM tournamentteams tt
        WHERE tt.tournamentid = p_tournament_id
          AND tt.teamid = s.away
      );
  END IF;

  /* ----------------------------------------------------------
     Your original logic below, now reading from "games"
  ----------------------------------------------------------- */
  RETURN QUERY
  WITH RECURSIVE
  /* seed full team list so 0-game teams are included */
  all_teams AS (
    SELECT
      t.tournamentid,
      tour.name AS tournamentname,
      t.teamid,
      tm.name   AS team
    FROM tournamentteams t
    JOIN tournaments tour ON tour.tournamentid = t.tournamentid
    JOIN teams tm        ON tm.teamid        = t.teamid
    WHERE t.tournamentid = p_tournament_id
  ),

  /* 1) Per-game rows (respecting include_in_progress flag) */
  home_rows AS (
    SELECT
      tour.tournamentid,
      tour.name AS tournamentname,
      tg.gameid     AS tournamentgameid,
      tg.home   AS hometeamid,
      tg.away   AS awayteamid,
      th.name   AS hometeam,
      ta.name   AS awayteam,
      tg.homescore,
      tg.awayscore,
      CASE  WHEN tg.homescore IS NULL OR tg.awayscore IS NULL THEN 0
            WHEN tg.homescore > tg.awayscore THEN 1
            WHEN tg.homescore < tg.awayscore THEN 0
            ELSE 0.5 END AS homewins,
      CASE  WHEN tg.homescore IS NULL OR tg.awayscore IS NULL THEN 0
            WHEN (tg.homescore - tg.awayscore) > tour.maxrundiff THEN tour.maxrundiff
            WHEN (tg.homescore - tg.awayscore) < -tour.maxrundiff THEN -tour.maxrundiff
            ELSE (tg.homescore - tg.awayscore) END AS homerundiff,
      tg.awayscore AS homerunsagainst
    FROM tournaments tour
    JOIN games tg ON tg.poolorbracket = 'Pool'
    LEFT JOIN tournamentteams tthome ON tthome.teamid = tg.home AND tthome.tournamentid = tour.tournamentid
    LEFT JOIN tournamentteams ttaway ON ttaway.teamid = tg.away AND ttaway.tournamentid = tour.tournamentid
    LEFT JOIN teams th ON th.teamid = tthome.teamid
    LEFT JOIN teams ta ON ta.teamid = ttaway.teamid
    WHERE tour.tournamentid = p_tournament_id
      AND (p_include_in_progress OR (tg.homescore IS NOT NULL AND tg.awayscore IS NOT NULL))
  ),
  away_rows AS (
    SELECT
      tour.tournamentid,
      tour.name AS tournamentname,
      tg.gameid     AS tournamentgameid,
      tg.home   AS hometeamid,
      tg.away   AS awayteamid,
      th.name   AS hometeam,
      ta.name   AS awayteam,
      tg.homescore,
      tg.awayscore,
      CASE  WHEN tg.awayscore IS NULL OR tg.homescore IS NULL THEN 0
            WHEN tg.awayscore > tg.homescore THEN 1
            WHEN tg.awayscore < tg.homescore THEN 0
            ELSE 0.5 END AS awaywins,
      CASE  WHEN tg.awayscore IS NULL OR tg.homescore IS NULL THEN 0
            WHEN (tg.awayscore - tg.homescore) > tour.maxrundiff THEN tour.maxrundiff
            WHEN (tg.awayscore - tg.homescore) < -tour.maxrundiff THEN -tour.maxrundiff
            ELSE (tg.awayscore - tg.homescore) END AS awayrundiff,
      tg.homescore AS awayrunsagainst
    FROM tournaments tour
    JOIN games tg ON tg.poolorbracket = 'Pool'
    LEFT JOIN tournamentteams tthome ON tthome.teamid = tg.home AND tthome.tournamentid = tour.tournamentid
    LEFT JOIN tournamentteams ttaway ON ttaway.teamid = tg.away AND ttaway.tournamentid = tour.tournamentid
    LEFT JOIN teams th ON th.teamid = tthome.teamid
    LEFT JOIN teams ta ON ta.teamid = ttaway.teamid
    WHERE tour.tournamentid = p_tournament_id
      AND (p_include_in_progress OR (tg.homescore IS NOT NULL AND tg.awayscore IS NOT NULL))
  ),
  per_team_union AS (
    SELECT
      h.tournamentid,
      h.tournamentname,
      h.hometeamid AS teamid,
      h.hometeam   AS team,
      h.homescore  AS runs_for,
      h.homewins   AS win_pts,
      h.homerundiff AS run_diff,
      h.homerunsagainst AS runs_against
    FROM home_rows h
    UNION ALL
    SELECT
      a.tournamentid,
      a.tournamentname,
      a.awayteamid AS teamid,
      a.awayteam   AS team,
      a.awayscore  AS runs_for,
      a.awaywins   AS win_pts,
      a.awayrundiff AS run_diff,
      a.awayrunsagainst AS runs_against
    FROM away_rows a
  ),

  /* aggregate, left join all_teams so teams with 0 games appear */
  pool_results_raw AS (
    SELECT
      p.tournamentid,
      p.tournamentname,
      p.teamid,
      p.team,
      SUM(p.runs_for)         AS runsscored,
      SUM(p.win_pts)          AS wins,
      COUNT(*)                AS games,
      SUM(p.run_diff)         AS rundifferential,
      SUM(p.runs_against)     AS runsagainst
    FROM per_team_union p
    GROUP BY p.tournamentid, p.tournamentname, p.teamid, p.team
  ),
  pool_results AS (
    SELECT
      at.tournamentid,
      at.tournamentname,
      at.teamid,
      at.team,
      COALESCE(r.runsscored, 0)::int                     AS runsscored,
      COALESCE(r.wins, 0)::numeric                       AS wins,
      COALESCE(r.games, 0)::int                          AS games,
      CASE WHEN COALESCE(r.games,0) > 0
           THEN (COALESCE(r.wins,0) / r.games)
           ELSE 0 END::numeric(15,6)                     AS wltpct,
      COALESCE(r.rundifferential, 0)::int                AS rundifferential,
      COALESCE(r.runsagainst, 0)::int                     AS runsagainst,
      COALESCE(r.runsscored, 0)::int                     AS adjusted_runs_scored,
      COALESCE(r.runsagainst, 0)::int                    AS adjusted_runs_against,
      COALESCE(r.rundifferential, 0)::int                AS adjusted_run_differential
    FROM all_teams at
    LEFT JOIN pool_results_raw r
      ON r.tournamentid = at.tournamentid
     AND r.teamid       = at.teamid
  ),

  /* 2) Tiebreaker config (priority -> ord, NO ORDER BY) */
  cfg0 AS (
    SELECT
      tt.priority,
      tb.tiebreaker                       AS code,
      COALESCE(tb."SortDirection",'DESC') AS sort_dir
    FROM tournamenttiebreakers tt
    JOIN tiebreakers tb ON tb.id = tt.tiebreakerid
    WHERE tt.tournamentid = p_tournament_id
  ),
  cfg AS (
    SELECT
      c0.*,
      1 + (SELECT COUNT(DISTINCT q.priority) FROM cfg0 q WHERE q.priority < c0.priority) AS ord
    FROM cfg0 c0
  ),

  /* 3) Static stats snapshot + JSON for dynamic metric lookup */
  stats AS ( SELECT pr.*, to_jsonb(pr) AS js FROM pool_results pr ),
  bounds AS ( SELECT COALESCE(MAX(ord),0) AS steps FROM cfg ),
  base   AS ( SELECT (SELECT COUNT(*) FROM stats) + 1 AS B ),

  /* 4) Recursive lexicographic ranking (NO ORDER BY) */
  seed AS (
    SELECT
      s.tournamentid, s.tournamentname, s.teamid, s.team,
      s.runsscored, s.wins, s.games, s.wltpct,
      s.rundifferential, s.runsagainst,
      s.adjusted_runs_scored, s.adjusted_runs_against, s.adjusted_run_differential,
      s.js,
      0::int    AS step,
      0::bigint AS key,
      (SELECT array_agg(s.teamid) FROM stats s) AS members,
      '{}'::jsonb AS details
    FROM stats s
  ),
  rec AS (
    SELECT * FROM seed
    UNION ALL
    SELECT
      r.tournamentid, r.tournamentname, r.teamid, r.team,
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
          /* H2H metrics now read from sandbox "games" */
          CASE
            WHEN c.code IN ('head_to_head_strict','head_to_head_permissive') THEN (
              WITH g AS (
                SELECT tg.home, tg.away, tg.homescore, tg.awayscore
                FROM games tg
                WHERE tg.poolorbracket = 'Pool'
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
              faced AS (SELECT COUNT(DISTINCT opp) AS opp_count FROM h2h WHERE opp IS NOT NULL),
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
                FROM games tg
                WHERE tg.poolorbracket = 'Pool'
                  AND (p_include_in_progress OR (tg.homescore IS NOT NULL AND tg.awayscore IS NOT NULL))
                  AND tg.homescore IS NOT NULL
                  AND tg.awayscore IS NOT NULL
              ),
              tour AS (SELECT t.maxrundiff AS cap FROM tournaments t WHERE t.tournamentid = r.tournamentid),
              rf AS (
                SELECT
                  CASE
                    WHEN m.teamid = g.home AND g.away = ANY(r.members)
                      THEN GREATEST(LEAST(g.homescore - g.awayscore, (SELECT cap FROM tour)), - (SELECT cap FROM tour))
                    WHEN m.teamid = g.away AND g.home = ANY(r.members)
                      THEN GREATEST(LEAST(g.awayscore - g.homescore, (SELECT cap FROM tour)), - (SELECT cap FROM tour))
                  END AS rd,
                  CASE WHEN m.teamid = g.home THEN g.away
                       WHEN m.teamid = g.away THEN g.home END AS opp
                FROM g
                WHERE (g.home = m.teamid AND g.away = ANY(r.members))
                   OR (g.away = m.teamid AND g.home = ANY(r.members))
              ),
              faced AS (SELECT COUNT(DISTINCT opp) AS opp_count FROM rf WHERE opp IS NOT NULL),
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
            /* Fallback to static snapshot */
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
    f.tournamentid,
    f.tournamentname,
    f.teamid,
    f.team,
    f.runsscored,
    f.wins,
    f.games,
    f.wltpct,
    f.rundifferential,
    f.runsagainst,
    1 + (SELECT COUNT(DISTINCT z.key) FROM final_step z WHERE z.key < f.key)::int AS rank_final,
    f.key      AS lexi_key,
    f.details  AS details
  FROM final_step f
  ;
END;
$BODY$;
