/**
 * Applies the scenario_questions_v2 migration:
 *   - adds opponent_team_id column
 *   - makes target_seed nullable
 *   - expands question_type check to include 'first_round_matchup'
 *
 * Run: node --env-file=.env.local scripts/migrate-scenario-questions-v2.mjs
 */
import { neon } from '@neondatabase/serverless';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set. Use --env-file=.env.local');
  process.exit(1);
}

const sql = neon(connectionString);

try {
  console.log('Applying scenario_questions_v2 migration…');

  await sql`ALTER TABLE scenario_questions ADD COLUMN IF NOT EXISTS opponent_team_id INT`;
  console.log('  ✓ Added opponent_team_id column');

  await sql`ALTER TABLE scenario_questions ALTER COLUMN target_seed DROP NOT NULL`;
  console.log('  ✓ Made target_seed nullable');

  await sql`ALTER TABLE scenario_questions ALTER COLUMN target_seed DROP DEFAULT`;
  console.log('  ✓ Dropped target_seed default');

  await sql`ALTER TABLE scenario_questions DROP CONSTRAINT IF EXISTS scenario_questions_target_seed_check`;
  await sql`ALTER TABLE scenario_questions ADD CONSTRAINT scenario_questions_target_seed_check CHECK (target_seed IS NULL OR target_seed >= 1)`;
  console.log('  ✓ Updated target_seed check constraint');

  await sql`ALTER TABLE scenario_questions DROP CONSTRAINT IF EXISTS scenario_questions_question_type_check`;
  await sql`ALTER TABLE scenario_questions ADD CONSTRAINT scenario_questions_question_type_check CHECK (question_type IN ('seed_achievable', 'first_round_matchup'))`;
  console.log('  ✓ Updated question_type check constraint');

  console.log('\nMigration complete.');
} catch (err) {
  console.error('Migration failed:', err.message);
  process.exit(1);
}
