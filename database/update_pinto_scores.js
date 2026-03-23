const { neon } = require("@neondatabase/serverless");
const fs = require("fs");

// Connect to DB
let dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  const envFile = fs.readFileSync(".env.local", "utf8");
  dbUrl = envFile.match(/DATABASE_URL=(.*)/)[1];
}
const sql = neon(dbUrl);

// All 51 completed games from sanmarcosyouthbaseball.com/schedule/649539/pinto
// Format: [date, home_mascot, away_mascot, home_score, away_score]
const completedGames = [
  // Week 2
  ["2026-02-24", "Mariners", "Cubs", 4, 3],
  ["2026-02-24", "Blue Jays", "Astros", 15, 5],
  ["2026-02-26", "Yankees", "Red Sox", 8, 9],
  ["2026-02-26", "Athletics", "Braves", 7, 11],
  ["2026-02-28", "Rays", "Mariners", 5, 0],
  ["2026-02-28", "Dodgers", "Red Sox", 10, 12],
  ["2026-02-28", "Athletics", "Astros", 9, 10],
  ["2026-02-28", "Orioles", "Blue Jays", 2, 17],
  ["2026-02-28", "Braves", "Padres", 7, 4],
  ["2026-02-28", "Yankees", "Giants", 12, 8],
  ["2026-02-28", "Brewers", "White Sox", 8, 9],
  ["2026-02-28", "Angels", "Nationals", 6, 10],
  ["2026-02-28", "Rockies", "Marlins", 10, 9],
  ["2026-02-28", "Cubs", "Pirates", 14, 4],
  // Week 3
  ["2026-03-03", "Nationals", "Orioles", 16, 9],
  ["2026-03-03", "Padres", "Marlins", 10, 6],
  ["2026-03-05", "Dodgers", "Giants", 9, 12],
  ["2026-03-05", "White Sox", "Rays", 10, 8],
  ["2026-03-07", "Giants", "Orioles", 9, 11],
  ["2026-03-07", "Mariners", "Braves", 9, 13],
  ["2026-03-07", "Marlins", "Brewers", 1, 14],
  ["2026-03-07", "Red Sox", "Athletics", 7, 7],
  ["2026-03-07", "Padres", "Dodgers", 12, 9],
  ["2026-03-07", "White Sox", "Nationals", 15, 6],
  ["2026-03-07", "Astros", "Pirates", 11, 20],
  ["2026-03-07", "Rockies", "Rays", 7, 9],
  ["2026-03-07", "Blue Jays", "Cubs", 10, 6],
  ["2026-03-07", "Angels", "Yankees", 7, 3],
  // Week 4
  ["2026-03-10", "Pirates", "Angels", 11, 2],
  ["2026-03-10", "Brewers", "Athletics", 7, 1],
  ["2026-03-12", "Rockies", "Cubs", 12, 11],
  ["2026-03-12", "Braves", "Blue Jays", 15, 10],
  ["2026-03-14", "Red Sox", "Blue Jays", 6, 10],
  ["2026-03-14", "Athletics", "Pirates", 6, 19],
  ["2026-03-14", "Dodgers", "Mariners", 4, 21],
  ["2026-03-14", "Astros", "Padres", 12, 9],
  ["2026-03-14", "Rays", "Brewers", 9, 15],
  ["2026-03-14", "Orioles", "Angels", 10, 18],
  ["2026-03-14", "Braves", "Rockies", 13, 8],
  ["2026-03-14", "Yankees", "White Sox", 10, 26],
  ["2026-03-14", "Cubs", "Giants", 8, 19],
  ["2026-03-14", "Nationals", "Marlins", 24, 15],
  // Week 5
  ["2026-03-17", "Astros", "White Sox", 10, 12],
  ["2026-03-17", "Giants", "Mariners", 8, 7],
  ["2026-03-19", "Yankees", "Orioles", 11, 10],
  ["2026-03-21", "Marlins", "Yankees", 11, 14],
  ["2026-03-21", "Athletics", "Blue Jays", 15, 15],
  ["2026-03-21", "Dodgers", "Rockies", 15, 7],
  ["2026-03-21", "Giants", "Red Sox", 20, 8],
  ["2026-03-21", "Pirates", "Padres", 9, 7],
  ["2026-03-21", "Brewers", "Braves", 15, 14],
];

(async () => {
  try {
    // 1. Get all games for season 2 with team names
    const games = await sql`
      SELECT g.id, g.gamedate, g.homescore, g.awayscore, g.gamestatusid,
             ht.name AS home_team, at.name AS away_team
      FROM season_games g
      LEFT JOIN teams ht ON ht.teamid = g.home
      LEFT JOIN teams at ON at.teamid = g.away
      WHERE g.season_id = 2 AND g.game_type = 'regular'
    `;

    console.log(`Found ${games.length} existing games in season 2\n`);

    // 2. Build lookup: "date|home|away" -> game row
    const lookup = {};
    for (const g of games) {
      const date = g.gamedate ? new Date(g.gamedate).toISOString().slice(0, 10) : "";
      const key = `${date}|${(g.home_team || "").toLowerCase()}|${(g.away_team || "").toLowerCase()}`;
      lookup[key] = g;
    }

    // 3. Update each completed game
    let updated = 0;
    let skipped = 0;
    let notFound = 0;

    for (const [date, home, away, hs, as] of completedGames) {
      const key = `${date}|${home.toLowerCase()}|${away.toLowerCase()}`;
      const existing = lookup[key];

      if (!existing) {
        console.log(`NOT FOUND: ${date} ${home} vs ${away}`);
        notFound++;
        continue;
      }

      if (existing.gamestatusid === 4 && existing.homescore === hs && existing.awayscore === as) {
        console.log(`SKIP (already final): ${date} ${home} ${hs}-${as} ${away}`);
        skipped++;
        continue;
      }

      await sql`
        UPDATE season_games
        SET homescore = ${hs}, awayscore = ${as}, gamestatusid = 4
        WHERE id = ${existing.id}
      `;
      console.log(`UPDATED: ${date} ${home} ${hs}-${as} ${away} (game #${existing.id})`);
      updated++;
    }

    console.log(`\nDone! Updated: ${updated}, Skipped: ${skipped}, Not found: ${notFound}`);
  } catch (e) {
    console.error("Error:", e.message);
    process.exit(1);
  }
})();
