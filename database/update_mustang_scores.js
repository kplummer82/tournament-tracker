const { neon } = require("@neondatabase/serverless");
const fs = require("fs");

// Connect to DB
let dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  const envFile = fs.readFileSync(".env.local", "utf8");
  dbUrl = envFile.match(/DATABASE_URL=(.*)/)[1];
}
const sql = neon(dbUrl);

// All completed games from sanmarcosyouthbaseball.com/schedule/649540/mustang
// Format: [date, home_mascot, away_mascot, home_score, away_score, field_number]
// Forfeits use "W"/"L" for scores -> gamestatusid=7 (Away Team Forfeit), null scores
const completedGames = [
  // Week 2 (Feb 24-28)
  ["2026-02-24", "Pirates", "Rays", 14, 2, 1],
  ["2026-02-24", "Orioles", "Astros", 4, 7, 4],
  ["2026-02-24", "White Sox", "Braves", 1, 5, 1],
  ["2026-02-24", "Yankees", "Marlins", 4, 14, 4],
  ["2026-02-26", "Nationals", "Padres", 0, 2, 1],
  ["2026-02-26", "Brewers", "Cubs", 2, 11, 4],
  ["2026-02-26", "Giants", "Blue Jays", 5, 6, 1],
  ["2026-02-26", "Mariners", "Dodgers", 13, 5, 4],
  ["2026-02-28", "Red Sox", "Rockies", 3, 2, 1],
  ["2026-02-28", "Astros", "Cubs", 5, 6, 4],
  ["2026-02-28", "Giants", "Athletics", 1, 4, 1],
  ["2026-02-28", "Nationals", "Orioles", 0, 9, 4],
  ["2026-02-28", "Braves", "Angels", 4, 4, 1],
  ["2026-02-28", "Rays", "Padres", 6, 3, 4],
  ["2026-02-28", "White Sox", "Marlins", 9, 5, 1],
  ["2026-02-28", "Blue Jays", "Mariners", 4, 6, 4],
  ["2026-02-28", "Yankees", "Brewers", 12, 4, 1],
  ["2026-02-28", "Pirates", "Dodgers", 14, 4, 4],
  // Week 3 (Mar 3-7)
  ["2026-03-03", "Rockies", "Athletics", 8, 1, 1],
  ["2026-03-03", "Padres", "Dodgers", 8, 2, 4],
  ["2026-03-03", "Mariners", "Red Sox", 6, 1, 1],
  ["2026-03-03", "Blue Jays", "Pirates", 8, 1, 4],
  ["2026-03-05", "Angels", "Giants", 4, 15, 1],
  ["2026-03-05", "Rays", "Orioles", 8, 10, 4],
  ["2026-03-05", "Cubs", "Nationals", 8, 2, 1],
  ["2026-03-05", "Brewers", "White Sox", 9, 4, 4],
  ["2026-03-07", "Padres", "Blue Jays", 5, 2, 1],
  ["2026-03-07", "Nationals", "Yankees", 6, 6, 4],
  ["2026-03-07", "Orioles", "Dodgers", 7, 0, 1],
  ["2026-03-07", "Giants", "Red Sox", 11, 5, 4],
  ["2026-03-07", "Marlins", "Rockies", 5, 9, 1],
  ["2026-03-07", "Angels", "Brewers", 10, 8, 4],
  ["2026-03-07", "Astros", "White Sox", 8, 3, 1],
  ["2026-03-07", "Mariners", "Pirates", 2, 1, 4],
  ["2026-03-07", "Rays", "Cubs", 8, 8, 1],
  ["2026-03-07", "Athletics", "Braves", 3, 15, 4],
  // Week 4 (Mar 10-14)
  ["2026-03-10", "White Sox", "Nationals", 10, 4, 1],
  ["2026-03-10", "Athletics", "Red Sox", 8, 6, 4],
  ["2026-03-10", "Orioles", "Blue Jays", 5, 4, 1],
  ["2026-03-10", "Marlins", "Angels", 7, 11, 4],
  ["2026-03-12", "Braves", "Rockies", 4, 10, 1],
  ["2026-03-12", "Giants", "Pirates", 6, 5, 4],
  ["2026-03-12", "Mariners", "Padres", 3, 7, 1],
  ["2026-03-12", "Astros", "Yankees", 13, 6, 4],
  ["2026-03-14", "Marlins", "Red Sox", 4, 5, 1],
  ["2026-03-14", "White Sox", "Rays", 1, 4, 4],
  ["2026-03-14", "Braves", "Giants", 1, 3, 1],
  ["2026-03-14", "Cubs", "Blue Jays", 3, 3, 4],
  ["2026-03-14", "Yankees", "Dodgers", 9, 10, 1],
  ["2026-03-14", "Mariners", "Orioles", 5, 2, 4],
  ["2026-03-14", "Nationals", "Angels", 1, 3, 1],
  ["2026-03-14", "Brewers", "Athletics", 8, 13, 4],
  ["2026-03-14", "Pirates", "Padres", 3, 2, 1],
  ["2026-03-14", "Rockies", "Astros", 2, 1, 4],
  // Week 5 (Mar 17-21)
  ["2026-03-17", "Marlins", "Athletics", 4, 15, 1],
  ["2026-03-17", "Rockies", "Brewers", 7, 4, 4],
  ["2026-03-17", "Dodgers", "Cubs", 4, 9, 1],
  ["2026-03-17", "Padres", "Giants", 10, 2, 4],
  ["2026-03-19", "Yankees", "Rays", 6, 1, 1],
  ["2026-03-19", "Angels", "Astros", 0, 11, 4],
  ["2026-03-19", "Pirates", "Orioles", 5, 0, 1],
  ["2026-03-19", "Red Sox", "Braves", 6, 0, 4],
  ["2026-03-21", "Angels", "Dodgers", 4, 5, 1],
  ["2026-03-21", "Athletics", "Nationals", 4, 3, 4],
  ["2026-03-21", "Giants", "Marlins", 14, 11, 1],
  ["2026-03-21", "Pirates", "Cubs", 8, 14, 4],
  ["2026-03-21", "Brewers", "Braves", 3, 9, 1],
  ["2026-03-21", "Blue Jays", "White Sox", 2, 3, 4],
  ["2026-03-21", "Orioles", "Padres", 7, 2, 1],
  ["2026-03-21", "Rays", "Rockies", 8, 7, 4],
  ["2026-03-21", "Red Sox", "Astros", 0, 12, 1],
  ["2026-03-21", "Mariners", "Yankees", 10, 1, 4],
  // Week 6 (Mar 24-28)
  ["2026-03-24", "Blue Jays", "Yankees", 7, 12, 1],
  ["2026-03-24", "Brewers", "Red Sox", 10, 7, 4],
  ["2026-03-24", "Athletics", "Astros", 3, 2, 1],
  ["2026-03-24", "Dodgers", "White Sox", 4, 9, 4],
  ["2026-03-26", "Cubs", "Mariners", 4, 3, 1],
  ["2026-03-26", "Rockies", "Nationals", "W", "L", 4],  // Forfeit
  ["2026-03-26", "Rays", "Angels", 7, 5, 1],
  ["2026-03-26", "Braves", "Marlins", 12, 4, 4],
  ["2026-03-28", "White Sox", "Pirates", 12, 4, 1],
  ["2026-03-28", "Red Sox", "Rays", 5, 4, 4],
  ["2026-03-28", "Astros", "Marlins", 8, 3, 1],
  ["2026-03-28", "Mariners", "Angels", 4, 1, 4],
  ["2026-03-28", "Dodgers", "Athletics", 7, 3, 1],
  ["2026-03-28", "Yankees", "Padres", 2, 12, 4],
  ["2026-03-28", "Cubs", "Rockies", "W", "L", 1],       // Forfeit
  ["2026-03-28", "Braves", "Orioles", 6, 11, 4],
  ["2026-03-28", "Blue Jays", "Nationals", 10, 9, 1],
  ["2026-03-28", "Brewers", "Giants", 7, 6, 4],
  // Week 8 (Apr 7-11)
  ["2026-04-07", "Padres", "Cubs", 3, 6, 1],
  ["2026-04-07", "White Sox", "Mariners", 2, 12, 4],
  ["2026-04-07", "Yankees", "Pirates", 1, 11, 1],
  ["2026-04-07", "Nationals", "Red Sox", 2, 6, 4],
  ["2026-04-09", "Marlins", "Brewers", 2, 3, 1],
  ["2026-04-09", "Angels", "Blue Jays", 18, 4, 4],
  ["2026-04-09", "Rays", "Athletics", 0, 5, 1],
  ["2026-04-09", "Dodgers", "Rockies", 6, 8, 4],
  ["2026-04-11", "Cubs", "Angels", 10, 6, 1],
  ["2026-04-11", "Braves", "Mariners", 6, 9, 4],
  ["2026-04-11", "Astros", "Rays", 15, 7, 1],
  ["2026-04-11", "White Sox", "Yankees", 11, 7, 4],
  ["2026-04-11", "Red Sox", "Pirates", 0, 5, 1],
  ["2026-04-11", "Rockies", "Orioles", 1, 8, 4],
  ["2026-04-11", "Dodgers", "Brewers", 11, 6, 1],
  ["2026-04-11", "Blue Jays", "Marlins", 9, 6, 4],
  ["2026-04-11", "Nationals", "Giants", 5, 4, 1],
  ["2026-04-11", "Padres", "Athletics", 4, 9, 4],
  // Week 9 (Apr 14-18)
  ["2026-04-14", "Giants", "Orioles", 6, 6, 1],
  ["2026-04-14", "Astros", "Braves", 6, 3, 4],
  ["2026-04-14", "Rockies", "Mariners", 3, 10, 1],
  ["2026-04-14", "Marlins", "Nationals", 4, 6, 4],
  ["2026-04-16", "Red Sox", "Dodgers", 7, 5, 1],
  ["2026-04-16", "Athletics", "Blue Jays", 6, 2, 4],
  ["2026-04-16", "Padres", "White Sox", 3, 3, 1],
  ["2026-04-16", "Pirates", "Angels", 9, 5, 4],
  ["2026-04-18", "Yankees", "Rockies", 1, 8, 1],
  ["2026-04-18", "Astros", "Blue Jays", 7, 6, 4],
  ["2026-04-18", "Mariners", "Brewers", 12, 2, 1],
  ["2026-04-18", "Athletics", "Cubs", 7, 6, 4],
  ["2026-04-18", "Dodgers", "Nationals", 8, 8, 1],
  ["2026-04-18", "Pirates", "Marlins", 3, 3, 4],
  ["2026-04-18", "Braves", "Padres", 12, 8, 1],
  ["2026-04-18", "Giants", "Rays", "W", "L", 4],        // Forfeit
  ["2026-04-18", "Orioles", "Red Sox", 10, 4, 1],
  ["2026-04-18", "Angels", "White Sox", 8, 2, 4],
  // Week 10 (Apr 21-25)
  ["2026-04-21", "Orioles", "Yankees", 16, 0, 1],
  ["2026-04-21", "Cubs", "Giants", 5, 8, 4],
  ["2026-04-21", "Braves", "Rays", 5, 0, 1],
  ["2026-04-21", "Brewers", "Astros", 4, 13, 4],
  ["2026-04-23", "White Sox", "Red Sox", 10, 9, 1],
  ["2026-04-23", "Blue Jays", "Dodgers", 13, 1, 4],
  ["2026-04-23", "Angels", "Athletics", 1, 5, 1],
  ["2026-04-23", "Nationals", "Pirates", 7, 4, 4],
  ["2026-04-25", "Padres", "Brewers", 11, 4, 1],
  ["2026-04-25", "Marlins", "Orioles", 9, 14, 4],
  ["2026-04-25", "Cubs", "Braves", 3, 2, 1],
  ["2026-04-25", "Red Sox", "Yankees", 15, 6, 4],
  ["2026-04-25", "Astros", "Pirates", 13, 1, 1],
  ["2026-04-25", "Dodgers", "Giants", 12, 2, 4],
  ["2026-04-25", "Nationals", "Mariners", 5, 10, 1],
  ["2026-04-25", "Athletics", "White Sox", 16, 9, 4],
  ["2026-04-25", "Blue Jays", "Rays", 5, 5, 1],
  ["2026-04-25", "Rockies", "Angels", "W", "L", 4],     // Forfeit
  // Week 11 partial (Apr 28-30)
  ["2026-04-28", "Rockies", "Giants", 6, 19, 1],
  ["2026-04-28", "Marlins", "Cubs", 4, 12, 4],
  ["2026-04-30", "Orioles", "Brewers", 7, 8, 1],
];

const FIELD_MAP = { 1: "Field 1", 4: "Field 4" };

(async () => {
  try {
    // 1. Look up location_id for "Mission Sports Park"
    const locRows = await sql`
      SELECT id FROM locations WHERE name = 'Mission Sports Park'
    `;
    if (locRows.length === 0) {
      console.error("ERROR: Location 'Mission Sports Park' not found in locations table.");
      process.exit(1);
    }
    const locationId = locRows[0].id;
    console.log(`Found Mission Sports Park: location_id = ${locationId}\n`);

    // 2. Get all games for season 1 with team names
    const games = await sql`
      SELECT g.id, g.gamedate, g.homescore, g.awayscore, g.gamestatusid,
             g.location_id, g.field,
             ht.name AS home_team, at.name AS away_team
      FROM season_games g
      LEFT JOIN teams ht ON ht.teamid = g.home
      LEFT JOIN teams at ON at.teamid = g.away
      WHERE g.season_id = 1 AND g.game_type = 'regular'
    `;

    console.log(`Found ${games.length} existing games in season 1\n`);

    // 3. Build lookup: "date|home|away" -> game row
    const lookup = {};
    for (const g of games) {
      const date = g.gamedate ? new Date(g.gamedate).toISOString().slice(0, 10) : "";
      const key = `${date}|${(g.home_team || "").toLowerCase()}|${(g.away_team || "").toLowerCase()}`;
      lookup[key] = g;
    }

    // 4. Update each completed game
    let updated = 0;
    let skipped = 0;
    let notFound = 0;

    for (const [date, home, away, hs, as, fieldNum] of completedGames) {
      const key = `${date}|${home.toLowerCase()}|${away.toLowerCase()}`;
      const existing = lookup[key];

      if (!existing) {
        console.log(`NOT FOUND: ${date} ${home} vs ${away}`);
        notFound++;
        continue;
      }

      const isForfeit = hs === "W" && as === "L";
      const statusId = isForfeit ? 7 : 4;
      const homeScore = isForfeit ? null : hs;
      const awayScore = isForfeit ? null : as;
      const fieldName = FIELD_MAP[fieldNum];

      // Skip if already correct (scores + status + location + field all match)
      if (
        existing.gamestatusid === statusId &&
        existing.homescore === homeScore &&
        existing.awayscore === awayScore &&
        existing.location_id === locationId &&
        existing.field === fieldName
      ) {
        console.log(`SKIP (already up to date): ${date} ${home} ${isForfeit ? "W" : hs}-${isForfeit ? "L" : as} ${away}`);
        skipped++;
        continue;
      }

      await sql`
        UPDATE season_games
        SET homescore = ${homeScore}, awayscore = ${awayScore},
            gamestatusid = ${statusId},
            location_id = ${locationId}, field = ${fieldName}
        WHERE id = ${existing.id}
      `;
      console.log(`UPDATED: ${date} ${home} ${isForfeit ? "FORFEIT" : `${hs}-${as}`} ${away} → ${fieldName} (game #${existing.id})`);
      updated++;
    }

    console.log(`\nDone! Updated: ${updated}, Skipped: ${skipped}, Not found: ${notFound}`);
  } catch (e) {
    console.error("Error:", e.message);
    process.exit(1);
  }
})();
