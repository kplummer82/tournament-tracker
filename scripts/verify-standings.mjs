// Standalone verification script — runs the TypeScript standings logic directly
// against the dev DB without going through the Next.js server (avoids auth middleware).
// Usage: node --experimental-vm-modules scripts/verify-standings.mjs
//
// We inline the logic here rather than importing TS modules to avoid path alias issues.

import { neon } from "@neondatabase/serverless";

const DB =
  process.env.DATABASE_URL ||
  "postgresql://neondb_owner:npg_RzLj9HG3kfKi@ep-billowing-dawn-afov8qma-pooler.c-2.us-west-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

const sql = neon(DB);

const [teamRows, gameRows, tbRows, configRows] = await Promise.all([
  sql`SELECT st.team_id AS teamid, t.name AS team FROM season_teams st JOIN teams t ON t.teamid = st.team_id WHERE st.season_id = 1`,
  sql`SELECT id AS gameid, home, away, homescore, awayscore, gamestatusid FROM season_games WHERE season_id = 1 AND game_type = 'regular' AND gamestatusid IN (4, 6, 7)`,
  sql`SELECT tb.tiebreaker AS code, tb."SortDirection" AS sort_direction, st.priority FROM season_tiebreakers st JOIN tiebreakers tb ON tb.id = st.tiebreaker_id WHERE st.season_id = 1 ORDER BY st.priority ASC`,
  sql`SELECT maxrundiff, COALESCE(forfeit_run_diff, 0) AS forfeit_run_diff FROM seasons WHERE id = 1`,
]);

const config = {
  maxrundiff: Number(configRows[0]?.maxrundiff ?? 10),
  forfeit_run_diff: Number(configRows[0]?.forfeit_run_diff ?? 0),
};
const tiebreakers = tbRows.map((r) => ({ code: r.code, sortDirection: r.sort_direction, priority: Number(r.priority) }));

console.log("Tiebreakers:", tiebreakers.map((t) => t.code).join(" → "));
console.log("Config:", config);
console.log("");

// --- baseStats ---
const statsMap = new Map();
for (const t of teamRows) {
  statsMap.set(Number(t.teamid), {
    teamid: Number(t.teamid), team: t.team,
    wins: 0, games: 0, runsscored: 0, runsagainst: 0, rundifferential: 0, forfeits: 0,
  });
}

const completedGames = gameRows.map((g) => ({
  gameid: Number(g.gameid),
  home: Number(g.home), away: Number(g.away),
  homescore: g.homescore != null ? Number(g.homescore) : null,
  awayscore: g.awayscore != null ? Number(g.awayscore) : null,
  winnerSide: g.gamestatusid === 6 ? "away" : g.gamestatusid === 7 ? "home" : null,
}));

for (const g of completedGames) {
  const home = statsMap.get(g.home);
  const away = statsMap.get(g.away);
  if (!home || !away) continue;

  if (g.winnerSide === "home") {
    // away forfeited
    home.wins += 1;
    home.games += 1; away.games += 1;
    home.rundifferential += config.forfeit_run_diff;
    away.rundifferential -= config.forfeit_run_diff;
    away.forfeits += 1;
  } else if (g.winnerSide === "away") {
    // home forfeited
    away.wins += 1;
    home.games += 1; away.games += 1;
    away.rundifferential += config.forfeit_run_diff;
    home.rundifferential -= config.forfeit_run_diff;
    home.forfeits += 1;
  } else {
    const hs = g.homescore, as_ = g.awayscore;
    const diff = Math.min(Math.max(hs - as_, -(config.maxrundiff || 99)), config.maxrundiff || 99);
    home.games += 1; away.games += 1;
    home.runsscored += hs; home.runsagainst += as_;
    away.runsscored += as_; away.runsagainst += hs;
    home.rundifferential += diff; away.rundifferential -= diff;
    if (hs > as_) { home.wins += 1; }
    else if (as_ > hs) { away.wins += 1; }
    else { home.wins += 0.5; away.wins += 0.5; }
  }
}

for (const s of statsMap.values()) {
  s.wltpct = s.games > 0 ? s.wins / s.games : 0;
  s.average_run_differential = s.games > 0 ? s.rundifferential / s.games : 0;
  s.average_runs_scored = s.games > 0 ? s.runsscored / s.games : 0;
  s.average_runs_against = s.games > 0 ? s.runsagainst / s.games : 0;
}

// --- simple tiebreaker value lookup ---
function simpleValue(code, teamId) {
  const s = statsMap.get(teamId);
  switch (code) {
    case "wltpct": return s.wltpct;
    case "rundifferential": case "adjusted_run_differential": return s.rundifferential;
    case "runsscored": case "adjusted_runs_scored": return s.runsscored;
    case "runsagainst": case "adjusted_runs_against": return s.runsagainst;
    case "average_run_differential": return s.average_run_differential;
    case "average_runs_scored": return s.average_runs_scored;
    case "average_runs_against": return s.average_runs_against;
    case "fewest_forfeits": return s.forfeits;
    default: return null;
  }
}

// --- H2H helpers ---
function h2hValue(code, teamId, memberIds, strictGroupOnly) {
  const memberSet = new Set(memberIds);
  const h2hGames = completedGames.filter(
    (g) => memberSet.has(g.home) && memberSet.has(g.away) && g.winnerSide === null
  );
  const n = memberIds.length;
  const pairTotals = new Map(); // `min-max` → { teamId: wins }
  for (const g of h2hGames) {
    const key = Math.min(g.home, g.away) + "-" + Math.max(g.home, g.away);
    if (!pairTotals.has(key)) pairTotals.set(key, new Map());
    const m = pairTotals.get(key);
    const hs = g.homescore, as_ = g.awayscore;
    if (hs > as_) m.set(g.home, (m.get(g.home) || 0) + 1);
    else if (as_ > hs) m.set(g.away, (m.get(g.away) || 0) + 1);
    else { m.set(g.home, (m.get(g.home) || 0) + 0.5); m.set(g.away, (m.get(g.away) || 0) + 0.5); }
  }

  const playedPairs = new Set([...pairTotals.keys()]);
  const expectedPairs = n * (n - 1) / 2;
  const allPairsPlayed = playedPairs.size >= expectedPairs;

  if (code === "head_to_group_rundiff" || code === "head_to_head_rundiff") {
    if (!allPairsPlayed && strictGroupOnly) return null;
    let rd = 0, played = 0;
    for (const g of h2hGames) {
      if (g.home === teamId || g.away === teamId) {
        const hs = g.homescore, as_ = g.awayscore;
        const diff = Math.min(Math.max(hs - as_, -(config.maxrundiff || 99)), config.maxrundiff || 99);
        rd += g.home === teamId ? diff : -diff;
        played++;
      }
    }
    return played > 0 ? rd : null;
  }

  if (code === "head_to_head_runs_against" || code === "head_to_group_runs_against") {
    if (!allPairsPlayed && strictGroupOnly) return null;
    let ra = 0, played = 0;
    for (const g of h2hGames) {
      if (g.home === teamId) { ra += g.awayscore; played++; }
      else if (g.away === teamId) { ra += g.homescore; played++; }
    }
    return played > 0 ? ra : null;
  }

  // head_to_head / head_to_group win pct
  if (allPairsPlayed) {
    let wins = 0, games = 0;
    for (const g of h2hGames) {
      if (g.home === teamId || g.away === teamId) {
        const hs = g.homescore, as_ = g.awayscore;
        if (g.home === teamId) { wins += hs > as_ ? 1 : as_ > hs ? 0 : 0.5; }
        else { wins += as_ > hs ? 1 : hs > as_ ? 0 : 0.5; }
        games++;
      }
    }
    return games > 0 ? wins / games : null;
  }
  if (strictGroupOnly) return null;

  // dominant team BFS
  const beats = new Map(memberIds.map((id) => [id, new Set()]));
  for (const [, m] of pairTotals) {
    let best = null, bestW = -1;
    for (const [id, w] of m) if (w > bestW) { bestW = w; best = id; }
    if (best != null) {
      const loser = [...m.keys()].find((id) => id !== best);
      if (loser != null) beats.get(best)?.add(loser);
    }
  }
  // transitive reach up to depth 4
  const reach = new Map(memberIds.map((id) => [id, new Set(beats.get(id))]));
  for (let d = 0; d < 3; d++) {
    for (const [id, r] of reach) {
      for (const beaten of [...r]) {
        for (const transitive of reach.get(beaten) || []) r.add(transitive);
      }
    }
  }
  const dominantTeams = memberIds.filter((id) => reach.get(id)?.size === n - 1);
  if (dominantTeams.length === 1) return dominantTeams[0] === teamId ? 1.0 : 0.0;
  return null;
}

// --- ranker ---
const B = teamRows.length + 1;
const lexiKeys = new Map(teamRows.map((t) => [Number(t.teamid), 0]));
const details = new Map(teamRows.map((t) => [Number(t.teamid), {}]));

for (const tb of tiebreakers) {
  // group by current lexi key
  const groups = new Map();
  for (const [id, key] of lexiKeys) {
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(id);
  }

  for (const [groupKey, members] of groups) {
    if (members.length <= 1) continue;

    // evaluate tiebreaker for each member
    const values = new Map();
    for (const id of members) {
      const isH2H = ["head_to_head", "head_to_group", "head_to_head_rundiff", "head_to_group_rundiff",
        "head_to_head_runs_against", "head_to_group_runs_against"].includes(tb.code);
      const strictGroupOnly = ["head_to_group", "head_to_group_rundiff", "head_to_group_runs_against"].includes(tb.code);
      const val = isH2H ? h2hValue(tb.code, id, members, strictGroupOnly) : simpleValue(tb.code, id);
      values.set(id, val);
      details.get(id)[tb.code] = val;
    }

    // rank within group — all null → all rank 1
    const nonNullMembers = members.filter((id) => values.get(id) != null);
    if (nonNullMembers.length === 0) continue; // all null → skip, lexi keys unchanged

    // sort non-null by value
    const sorted = [...nonNullMembers].sort((a, b) => {
      const va = values.get(a), vb = values.get(b);
      return tb.sortDirection === "ASC" ? va - vb : vb - va;
    });

    // dense rank among non-null
    const rankMap = new Map();
    let rank = 1;
    for (let i = 0; i < sorted.length; i++) {
      if (i > 0 && values.get(sorted[i]) !== values.get(sorted[i - 1])) rank = i + 1;
      rankMap.set(sorted[i], rank);
    }
    // null members get rank = max non-null rank + 1
    const nullRank = rank + 1;
    for (const id of members) {
      if (values.get(id) == null) rankMap.set(id, nullRank);
    }

    for (const id of members) {
      lexiKeys.set(id, groupKey * B + rankMap.get(id));
    }
  }
}

// dense rank final
const sortedKeys = [...new Set([...lexiKeys.values()])].sort((a, b) => a - b);
const keyToRank = new Map(sortedKeys.map((k, i) => [k, i + 1]));

const standings = teamRows.map((t) => {
  const id = Number(t.teamid);
  const s = statsMap.get(id);
  return { ...s, rank_final: keyToRank.get(lexiKeys.get(id)), lexi_key: lexiKeys.get(id), details: details.get(id) };
}).sort((a, b) => a.rank_final - b.rank_final);

standings.forEach((r) => {
  const d = Object.entries(r.details).map(([k, v]) => `${k}=${v ?? "NULL"}`).join(" ");
  console.log(`${r.rank_final}. ${r.team.padEnd(12)} ${r.wins}W/${r.games}G (${r.wltpct.toFixed(3)})  rd:${r.rundifferential}  rs:${r.runsscored}  ${d}`);
});
