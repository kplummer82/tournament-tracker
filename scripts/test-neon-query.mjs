/**
 * One-off script to test Neon connection with a simple query.
 * Run: node --env-file=.env.local scripts/test-neon-query.mjs
 */
import { neon } from '@neondatabase/serverless';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set. Use --env-file=.env.local');
  process.exit(1);
}

const sql = neon(connectionString);

try {
  const rows = await sql`SELECT 1 AS one, current_database() AS db, current_user AS usr`;
  console.log('Neon connection OK:', rows[0]);
} catch (err) {
  console.error('Neon connection failed:', err.message);
  process.exit(1);
}
