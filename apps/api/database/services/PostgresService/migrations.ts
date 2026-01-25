/**
 * Database migration runner
 */

import fs from 'fs';
import type { Pool, PoolClient } from 'pg';
import { getMigrationsPath } from './schema.js';

/**
 * Run database migrations with timeout protection
 */
export async function runMigrations(pool: Pool): Promise<void> {
  try {
    const migrationsPath = getMigrationsPath();

    if (!fs.existsSync(migrationsPath)) {
      console.log('[PostgresService] Migrations directory not found, skipping migrations');
      return;
    }

    const client = await pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          id SERIAL PRIMARY KEY,
          filename TEXT NOT NULL UNIQUE,
          applied_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
      `);
    } finally {
      client.release();
    }

    const migrationFiles = fs
      .readdirSync(migrationsPath)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    if (migrationFiles.length === 0) {
      console.log('[PostgresService] No migration files found');
      return;
    }

    const appliedResult = await pool.query('SELECT filename FROM schema_migrations');
    const appliedFilenames = new Set(appliedResult.rows.map((row) => row.filename));

    for (const filename of migrationFiles) {
      if (appliedFilenames.has(filename)) {
        console.log(`[PostgresService] Migration ${filename} already applied`);
        continue;
      }

      await runSingleMigration(pool, migrationsPath, filename);
    }
  } catch (error) {
    console.error('[PostgresService] Error running migrations:', error);
  }
}

/**
 * Run a single migration file
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

  if (migrationSql.includes('FOREIGN KEY') && migrationSql.includes('REFERENCES')) {
    console.warn(
      `[PostgresService] ⚠️ Skipping migration ${filename} - contains foreign key constraint that may hang`
    );
    console.warn('[PostgresService] Foreign key constraints will be handled by schema.sql instead');
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('SET statement_timeout = 10000');
    await client.query('BEGIN');

    await client.query(migrationSql);

    await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
    await client.query('COMMIT');

    const duration = Date.now() - startTime;
    console.log(`[PostgresService] ✅ Migration ${filename} applied successfully in ${duration}ms`);
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error(
        `[PostgresService] Rollback failed for ${filename}:`,
        (rollbackError as Error).message
      );
    }

    console.error(`[PostgresService] ❌ Migration ${filename} failed:`, (error as Error).message);
  } finally {
    try {
      await client.query('SET statement_timeout = 0');
    } catch (resetError) {
      console.warn(
        '[PostgresService] Failed to reset statement timeout:',
        (resetError as Error).message
      );
    }
    client.release();
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
