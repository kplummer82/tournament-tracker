const { neon } = require("@neondatabase/serverless");
const fs = require("fs");

// Connect to DB
let dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  const envFile = fs.readFileSync(".env.local", "utf8");
  dbUrl = envFile.match(/DATABASE_URL=(.*)/)[1];
}
const sql = neon(dbUrl);

// Same game list as update script — reset these back to unscored/scheduled
const completedGames = [
  ["2026-02-24", "Mariners", "Cubs"],
  ["2026-02-24", "Blue Jays", "Astros"],
  ["2026-02-26", "Yankees", "Red Sox"],
  ["2026-02-26", "Athletics", "Braves"],
  ["2026-02-28", "Rays", "Mariners"],
  ["2026-02-28", "Dodgers", "Red Sox"],
  ["2026-02-28", "Athletics", "Astros"],
  ["2026-02-28", "Orioles", "Blue Jays"],
  ["2026-02-28", "Braves", "Padres"],
  ["2026-02-28", "Yankees", "Giants"],
  ["2026-02-28", "Brewers", "White Sox"],
  ["2026-02-28", "Angels", "Nationals"],
  ["2026-02-28", "Rockies", "Marlins"],
  ["2026-02-28", "Cubs", "Pirates"],
  ["2026-03-03", "Nationals", "Orioles"],
  ["2026-03-03", "Padres", "Marlins"],
  ["2026-03-05", "Dodgers", "Giants"],
  ["2026-03-05", "White Sox", "Rays"],
  ["2026-03-07", "Giants", "Orioles"],
  ["2026-03-07", "Mariners", "Braves"],
  ["2026-03-07", "Marlins", "Brewers"],
  ["2026-03-07", "Red Sox", "Athletics"],
  ["2026-03-07", "Padres", "Dodgers"],
  ["2026-03-07", "White Sox", "Nationals"],
  ["2026-03-07", "Astros", "Pirates"],
  ["2026-03-07", "Rockies", "Rays"],
  ["2026-03-07", "Blue Jays", "Cubs"],
  ["2026-03-07", "Angels", "Yankees"],
  ["2026-03-10", "Pirates", "Angels"],
  ["2026-03-10", "Brewers", "Athletics"],
  ["2026-03-12", "Rockies", "Cubs"],
  ["2026-03-12", "Braves", "Blue Jays"],
  ["2026-03-14", "Red Sox", "Blue Jays"],
  ["2026-03-14", "Athletics", "Pirates"],
  ["2026-03-14", "Dodgers", "Mariners"],
  ["2026-03-14", "Astros", "Padres"],
  ["2026-03-14", "Rays", "Brewers"],
  ["2026-03-14", "Orioles", "Angels"],
  ["2026-03-14", "Braves", "Rockies"],
  ["2026-03-14", "Yankees", "White Sox"],
  ["2026-03-14", "Cubs", "Giants"],
  ["2026-03-14", "Nationals", "Marlins"],
  ["2026-03-17", "Astros", "White Sox"],
  ["2026-03-17", "Giants", "Mariners"],
  ["2026-03-19", "Yankees", "Orioles"],
  ["2026-03-21", "Marlins", "Yankees"],
  ["2026-03-21", "Athletics", "Blue Jays"],
  ["2026-03-21", "Dodgers", "Rockies"],
  ["2026-03-21", "Giants", "Red Sox"],
  ["2026-03-21", "Pirates", "Padres"],
  ["2026-03-21", "Brewers", "Braves"],
];

(async () => {
  try {
    const games = await sql`
      SELECT g.id, g.gamedate,
             ht.name AS home_team, at.name AS away_team
      FROM season_games g
      LEFT JOIN teams ht ON ht.teamid = g.home
      LEFT JOIN teams at ON at.teamid = g.away
      WHERE g.season_id = 2 AND g.game_type = 'regular'
    `;

    const lookup = {};
    for (const g of games) {
      const date = g.gamedate ? new Date(g.gamedate).toISOString().slice(0, 10) : "";
      const key = `${date}|${(g.home_team || "").toLowerCase()}|${(g.away_team || "").toLowerCase()}`;
      lookup[key] = g;
    }

    let rolled = 0;
    let notFound = 0;

    for (const [date, home, away] of completedGames) {
      const key = `${date}|${home.toLowerCase()}|${away.toLowerCase()}`;
      const existing = lookup[key];

      if (!existing) {
        console.log(`NOT FOUND: ${date} ${home} vs ${away}`);
        notFound++;
        continue;
      }

      await sql`
        UPDATE season_games
        SET homescore = NULL, awayscore = NULL, gamestatusid = 1
        WHERE id = ${existing.id}
      `;
      console.log(`ROLLED BACK: ${date} ${home} vs ${away} (game #${existing.id})`);
      rolled++;
    }

    console.log(`\nDone! Rolled back: ${rolled}, Not found: ${notFound}`);
  } catch (e) {
    console.error("Error:", e.message);
    process.exit(1);
  }
})();
