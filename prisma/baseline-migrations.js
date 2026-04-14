/**
 * ONE-TIME / LEGACY ONLY — do not run on an empty database.
 *
 * Marks every folder in prisma/migrations as applied in `_prisma_migrations`
 * WITHOUT executing migration.sql. Use only when the schema already exists
 * (e.g. created with `prisma db push`) and you need Prisma to treat migrations
 * as already applied.
 *
 * Never add this to default deploy startup for a fresh DB: you would get
 * `_prisma_migrations` rows but no tables, and `prisma migrate deploy` would skip
 * all DDL (P2021 missing tables at runtime).
 *
 * Usage:
 *   DATABASE_URL=<url> node prisma/baseline-migrations.js
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Client } = pg;

async function baselineMigrations() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('Checking if migration baseline is needed...');
    
    // Check if _prisma_migrations table exists and has entries
    try {
      const result = await client.query(`
        SELECT COUNT(*) as count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL
      `);
      const count = parseInt(result.rows[0]?.count || 0);

      if (count > 0) {
        const adminCheck = await client.query(
          `SELECT to_regclass('public."Admin"') IS NOT NULL AS admin_exists`,
        );
        const adminExists = adminCheck.rows[0]?.admin_exists === true;
        if (!adminExists) {
          console.error(
            '\n❌ Migration history lists applied migrations but the "Admin" table is missing.\n' +
              'This usually means baselining ran on an empty DB (rows were inserted without running migration SQL).\n\n' +
              'Fix (Neon / Postgres): connect with the same DATABASE_URL and run:\n' +
              '  TRUNCATE TABLE "_prisma_migrations";\n' +
              'Then redeploy so `prisma migrate deploy` can apply all migrations.\n',
          );
          process.exit(1);
        }
        console.log(`✓ Migration history already exists (${count} migrations found). Skipping baseline.`);
        return;
      }
    } catch (error) {
      // Table doesn't exist, we'll create it
      console.log('Migration history table not found. Creating baseline...');
    }
    
    console.log('Starting migration baseline...');
    
    // Get all migration directories
    const migrationsDir = path.join(__dirname, 'migrations');
    const migrations = fs.readdirSync(migrationsDir)
      .filter(item => {
        const itemPath = path.join(migrationsDir, item);
        return fs.statSync(itemPath).isDirectory() && item !== 'migration_lock.toml';
      })
      .sort();

    console.log(`Found ${migrations.length} migrations to baseline`);

    // Check if _prisma_migrations table exists, create if not
    await client.query(`
      CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
        "id" VARCHAR(36) NOT NULL,
        "checksum" VARCHAR(64) NOT NULL,
        "finished_at" TIMESTAMP,
        "migration_name" VARCHAR(255) NOT NULL,
        "logs" TEXT,
        "rolled_back_at" TIMESTAMP,
        "started_at" TIMESTAMP NOT NULL DEFAULT now(),
        "applied_steps_count" INTEGER NOT NULL DEFAULT 0,
        CONSTRAINT "_prisma_migrations_pkey" PRIMARY KEY ("id")
      );
    `);

    const appTables = await client.query(`
      SELECT COUNT(*)::int AS n FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        AND table_name NOT IN ('_prisma_migrations')
    `);
    const appTableCount = appTables.rows[0]?.n ?? 0;
    if (appTableCount === 0) {
      console.error(
        '\n❌ Refusing baseline: this database has no application tables yet.\n' +
          'Baselining only inserts into "_prisma_migrations" and does not run migration.sql.\n' +
          'On a fresh Neon/database, run `prisma migrate deploy` only (do not run this script).\n',
      );
      process.exit(1);
    }

    // Mark each migration as applied
    for (const migration of migrations) {
      const migrationPath = path.join(migrationsDir, migration, 'migration.sql');
      
      if (!fs.existsSync(migrationPath)) {
        console.log(`⚠️  Skipping ${migration} - no migration.sql found`);
        continue;
      }

      const migrationSql = fs.readFileSync(migrationPath, 'utf8');
      const checksum = crypto.createHash('sha256').update(migrationSql).digest('hex');
      
      // Check if already marked as applied
      const existing = await client.query(`
        SELECT id FROM "_prisma_migrations" WHERE migration_name = $1
      `, [migration]);

      if (existing.rows && existing.rows.length > 0) {
        console.log(`✓ ${migration} already marked as applied`);
        continue;
      }

      // Mark as applied
      await client.query(`
        INSERT INTO "_prisma_migrations" (
          "id",
          "checksum",
          "finished_at",
          "migration_name",
          "started_at",
          "applied_steps_count"
        ) VALUES (
          gen_random_uuid()::text,
          $1,
          now(),
          $2,
          now(),
          1
        )
      `, [checksum, migration]);

      console.log(`✓ Marked ${migration} as applied`);
    }

    console.log('\n✅ All migrations have been baselined!');
    console.log('You can now use "prisma migrate deploy" in production.');
    
  } catch (error) {
    console.error('❌ Error baselining migrations:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

baselineMigrations();

