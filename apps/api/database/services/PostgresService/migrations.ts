/**
 * Database migration runner
 *
 * Uses a PostgreSQL advisory lock to ensure only one process runs
 * migrations at a time (safe for Node.js cluster mode).
 */

import fs from 'fs';

import { getMigrationsPath } from './schema.js';

import type { Pool } from 'pg';

const MIGRATION_LOCK_ID = 42_000_001;

/**
 * Run database migrations with advisory lock and timeout protection
 */
export async function runMigrations(pool: Pool): Promise<void> {
  const migrationsPath = getMigrationsPath();

  if (!fs.existsSync(migrationsPath)) {
    console.log('[PostgresService] Migrations directory not found, skipping migrations');
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('SET statement_timeout = 60000');

    const lockResult = await client.query(
      `SELECT pg_try_advisory_lock(${MIGRATION_LOCK_ID}) AS acquired`
    );
    if (!lockResult.rows[0].acquired) {
      console.log('[PostgresService] Migrations already running in another worker, skipping');
      return;
    }

    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          id SERIAL PRIMARY KEY,
          filename TEXT NOT NULL UNIQUE,
          applied_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
      `);

      const migrationFiles = fs
        .readdirSync(migrationsPath)
        .filter((file) => file.endsWith('.sql'))
        .sort();

      if (migrationFiles.length === 0) {
        console.log('[PostgresService] No migration files found');
        return;
      }

      const appliedResult = await client.query('SELECT filename FROM schema_migrations');
      const appliedFilenames = new Set(
        appliedResult.rows.map((row: { filename: string }) => row.filename)
      );
      const pendingFiles = migrationFiles.filter((f) => !appliedFilenames.has(f));

      console.log(
        `[PostgresService] Migrations: ${migrationFiles.length} total, ${appliedFilenames.size} applied, ${pendingFiles.length} pending`
      );

      if (pendingFiles.length === 0) return;

      for (const filename of pendingFiles) {
        await runSingleMigration(pool, migrationsPath, filename);
      }
    } finally {
      await client.query(`SELECT pg_advisory_unlock(${MIGRATION_LOCK_ID})`);
    }
  } catch (error) {
    console.error('[PostgresService] Error running migrations:', error);
  } finally {
    try {
      await client.query('SET statement_timeout = 0');
    } catch {
      // ignore
    }
    client.release();
  }
}

/**
 * Run a single migration file using the already-locked client
 */
async function runSingleMigration(
  pool: Pool,
  migrationsPath: string,
  filename: string
): Promise<void> {
  console.log(`[PostgresService] Running migration ${filename}...`);
  const startTime = Date.now();

  const migrationPath = `${migrationsPath}/${filename}`;
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');

  console.log(`[PostgresService] Migration ${filename} size: ${migrationSql.length} characters`);

  const migrationClient = await pool.connect();
  try {
    await migrationClient.query('SET statement_timeout = 30000');
    await migrationClient.query('BEGIN');
    await migrationClient.query(migrationSql);
    await migrationClient.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
    await migrationClient.query('COMMIT');

    const duration = Date.now() - startTime;
    console.log(`[PostgresService] ✅ Migration ${filename} applied successfully in ${duration}ms`);
  } catch (error) {
    try {
      await migrationClient.query('ROLLBACK');
    } catch (rollbackError) {
      console.error(
        `[PostgresService] Rollback failed for ${filename}:`,
        (rollbackError as Error).message
      );
    }

    console.error(`[PostgresService] ❌ Migration ${filename} failed:`, (error as Error).message);
  } finally {
    try {
      await migrationClient.query('SET statement_timeout = 0');
    } catch {
      // ignore
    }
    migrationClient.release();
  }
}

/**
 * Create database if it doesn't exist
 */
export async function createDatabaseIfNotExists(config: {
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  ssl?: boolean | { rejectUnauthorized: boolean };
  connectionString?: string;
}): Promise<void> {
  if (config.connectionString || process.env.POSTGRES_AUTO_CREATE_DB === 'false') {
    return;
  }

  const dbName = config.database;
  if (!dbName) return;

  const { Client } = await import('pg');
  const tempConfig = { ...config, database: 'postgres' };
  const tempClient = new Client(tempConfig);

  try {
    await tempClient.connect();

    const result = await tempClient.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);

    if (result.rows.length === 0) {
      await tempClient.query(`CREATE DATABASE "${dbName}"`);
      console.log(`[PostgresService] Created database '${dbName}'`);
    } else {
      console.log(`[PostgresService] Database '${dbName}' already exists`);
    }
  } catch (error) {
    console.warn(`[PostgresService] Database creation check failed: ${(error as Error).message}`);
  } finally {
    await tempClient.end();
  }
}
