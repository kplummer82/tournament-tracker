const { neon } = require("@neondatabase/serverless");
const fs = require("fs");

const envFile = fs.readFileSync(".env.local", "utf8");
const dbUrl = envFile.match(/DATABASE_URL=(.*)/)[1];
const sql = neon(dbUrl);

(async () => {
  try {
    await sql`CREATE TABLE IF NOT EXISTS user_roles (
      id         SERIAL PRIMARY KEY,
      user_id    TEXT NOT NULL,
      role       TEXT NOT NULL,
      scope_type TEXT NOT NULL,
      scope_id   INT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by TEXT,
      UNIQUE(user_id, role, scope_type, scope_id)
    )`;
    console.log("Created user_roles table");

    await sql`CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_user_roles_scope ON user_roles(scope_type, scope_id)`;
    console.log("Created indexes");

    await sql`ALTER TABLE leagues ADD COLUMN IF NOT EXISTS created_by TEXT`;
    console.log("Added created_by to leagues");

    await sql`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS created_by TEXT`;
    console.log("Added created_by to tournaments");

    await sql`ALTER TABLE teams ADD COLUMN IF NOT EXISTS created_by TEXT`;
    console.log("Added created_by to teams");

    const result = await sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'user_roles' ORDER BY ordinal_position`;
    console.log("user_roles columns:", JSON.stringify(result, null, 2));

    console.log("\nMigration complete!");
  } catch (e) {
    console.error("Error:", e.message);
    process.exit(1);
  }
})();
