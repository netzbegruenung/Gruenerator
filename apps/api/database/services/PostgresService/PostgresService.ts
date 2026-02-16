/**
 * PostgreSQL Service for Grünerator
 * Handles all PostgreSQL operations with connection pooling and high performance
 */

import pkg from 'pg';

const { Pool } = pkg;
import fs from 'fs';

import { loadConfig, getSafeConfigForLog } from './config.js';
import { runMigrations, createDatabaseIfNotExists } from './migrations.js';
import {
  buildInsertQuery,
  buildUpdateQuery,
  buildDeleteQuery,
  buildUpsertQuery,
  buildBulkInsertQuery,
  transactionQuery,
  transactionQueryOne,
  transactionExec,
} from './queries.js';
import {
  parseSchemaFile,
  extractCreateTableStatements,
  getSchemaPath,
  loadSchemaCache,
  validateTableName as schemaValidateTableName,
  validateColumnNames as schemaValidateColumnNames,
  generateAlterStatements,
  sanitizeBackupPath,
} from './schema.js';

import type {
  PostgresConfig,
  HealthStatus,
  PoolStatus,
  SchemaCache,
  ColumnDefinition,
  ExecResult,
  UpdateResult,
  DeleteResult,
  DatabaseStats,
  RouteUsageStat,
  QueryOptions,
  TransactionCallback,
  Pool as PoolType,
  PoolClient,
} from './types.js';

export class PostgresService {
  config: PostgresConfig;
  pool: PoolType | null = null;
  isInitialized = false;
  isHealthy = false;
  healthStatus: 'initializing' | 'connecting' | 'healthy' | 'error' = 'initializing';
  lastError: string | null = null;
  initPromise: Promise<void> | null = null;
  schemaCache: SchemaCache | null = null;
  schemaValidationEnabled = true;

  constructor(config: PostgresConfig | null = null) {
    this.config = loadConfig(config);
  }

  getSafeConfigForLog() {
    return getSafeConfigForLog(this.config);
  }

  async init(): Promise<void> {
    console.log('[PostgresService] Starting minimal initialization...');
    try {
      this.healthStatus = 'connecting';
      console.log('[PostgresService] Effective configuration:', this.getSafeConfigForLog());

      console.log('[PostgresService] Creating connection pool...');
      this.pool = new Pool(this.config);
      console.log('[PostgresService] Pool created, testing connection...');

      await this.testConnection();
      console.log('[PostgresService] Connection test successful');

      this.isInitialized = true;
      this.isHealthy = true;
      this.healthStatus = 'healthy';
      this.lastError = null;
      console.log(
        '[PostgresService] PostgreSQL minimal initialization successful (connection only)'
      );

      // Auto-sync schema columns
      try {
        await this.syncSchemaColumns();
        console.log('[PostgresService] ✓ Schema columns synchronized');
      } catch (error) {
        // Graceful failure: log warning but don't throw
        console.warn(
          '[PostgresService] ⚠️ Schema column sync failed (non-critical):',
          (error as Error).message
        );
      }
    } catch (error) {
      this.isInitialized = false;
      this.isHealthy = false;
      this.healthStatus = 'error';
      this.lastError = (error as Error).message;

      console.error('[PostgresService] Failed to initialize PostgreSQL connection:', error);

      console.log('[PostgresService] Scheduling retry in 5 seconds...');
      setTimeout(() => {
        console.log('[PostgresService] Retry timer fired, calling retryInit()');
        this.retryInit();
      }, 5000);
      console.log('[PostgresService] Retry scheduled, continuing...');

      console.warn(
        '[PostgresService] Database connection failed, but application will continue. Some features may be unavailable.'
      );
    }
  }

  async retryInit(): Promise<void> {
    console.log('[PostgresService] Retrying database initialization...');
    await this.init();
  }

  initSchemaValidation(): void {
    this.schemaCache = loadSchemaCache();
    if (!this.schemaCache) {
      this.schemaValidationEnabled = false;
    }
  }

  validateTableName(tableName: string): void {
    if (!this.schemaValidationEnabled) return;
    if (!this.schemaCache) {
      this.initSchemaValidation();
    }
    schemaValidateTableName(this.schemaCache, tableName);
  }

  validateColumnNames(tableName: string, columnNames: string[]): void {
    if (!this.schemaValidationEnabled) return;
    if (!this.schemaCache) {
      this.initSchemaValidation();
    }
    schemaValidateColumnNames(this.schemaCache, tableName, columnNames);
  }

  getHealth(): HealthStatus {
    return {
      isHealthy: this.isHealthy,
      isInitialized: this.isInitialized,
      status: this.healthStatus,
      lastError: this.lastError,
      pool: this.pool
        ? {
            totalCount: this.pool.totalCount,
            idleCount: this.pool.idleCount,
            waitingCount: this.pool.waitingCount,
          }
        : null,
    };
  }

  async createDatabaseIfNotExists(): Promise<void> {
    await createDatabaseIfNotExists(this.config);
  }

  async testConnection(): Promise<void> {
    if (!this.pool) throw new Error('Pool not initialized');
    const client = await this.pool.connect();
    try {
      const result = await client.query('SELECT NOW()');
      console.log('[PostgresService] Database connection successful:', result.rows[0].now);
    } catch (error) {
      throw new Error(`Connection test failed: ${(error as Error).message}`);
    } finally {
      client.release();
    }
  }

  async getExistingColumns(): Promise<Record<string, ColumnDefinition[]>> {
    const query = `
      SELECT
        table_name,
        column_name,
        data_type,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position
    `;

    const result = await this.query(query);
    const tables: Record<string, ColumnDefinition[]> = {};

    result.forEach((row: Record<string, unknown>) => {
      const tableName = row.table_name as string;
      if (!tables[tableName]) {
        tables[tableName] = [];
      }
      tables[tableName].push({
        name: row.column_name as string,
        type: row.data_type as string,
        nullable: row.is_nullable === 'YES',
        default: row.column_default as string | null,
      });
    });

    return tables;
  }

  async syncSchemaColumns(): Promise<void> {
    try {
      const schemaPath = getSchemaPath();

      if (!fs.existsSync(schemaPath)) {
        console.log('[PostgresService] Schema file not found, skipping column sync');
        return;
      }

      const schemaContent = fs.readFileSync(schemaPath, 'utf8');
      const expectedTables = parseSchemaFile(schemaContent);
      let existingTables = await this.getExistingColumns();

      // Create missing tables before syncing columns
      const missingTableNames = Object.keys(expectedTables).filter((t) => !existingTables[t]);
      if (missingTableNames.length > 0) {
        console.log(
          `[PostgresService] Found ${missingTableNames.length} missing tables to create: ${missingTableNames.join(', ')}`
        );
        const createStatements = extractCreateTableStatements(schemaContent);
        const client = await this.pool!.connect();
        try {
          for (const tableName of missingTableNames) {
            if (!createStatements[tableName]) continue;
            try {
              await client.query(createStatements[tableName]);
              console.log(`[PostgresService] ✅ Created table ${tableName}`);
            } catch (error) {
              console.warn(
                `[PostgresService] ⚠️ Failed to create table ${tableName}:`,
                (error as Error).message
              );
            }
          }
        } finally {
          client.release();
        }
        // Re-fetch after creating tables so column sync doesn't duplicate
        existingTables = await this.getExistingColumns();
      }

      const alterStatements = generateAlterStatements(expectedTables, existingTables);

      if (alterStatements.length > 0) {
        console.log(`[PostgresService] Found ${alterStatements.length} missing columns to add`);

        let successCount = 0;
        let failCount = 0;

        const client = await this.pool!.connect();
        try {
          for (const alter of alterStatements) {
            try {
              await client.query(alter.statement);
              console.log(`[PostgresService] ✅ Added column ${alter.table}.${alter.column}`);
              successCount++;
            } catch (error) {
              console.warn(
                `[PostgresService] ⚠️ Failed to add column ${alter.table}.${alter.column}:`,
                (error as Error).message
              );
              failCount++;
            }
          }
        } finally {
          client.release();
        }

        console.log(
          `[PostgresService] Schema sync complete: ${successCount} added, ${failCount} failed`
        );
      } else {
        console.log('[PostgresService] All schema columns are up to date');
      }
    } catch (error) {
      console.error('[PostgresService] Error during schema column sync:', error);
      throw error;
    }
  }

  async initSchema(): Promise<void> {
    console.log('[PostgresService] initSchema() called - FOR MANUAL USE ONLY');
    try {
      const schemaPath = getSchemaPath();
      console.log('[PostgresService] Looking for schema at:', schemaPath);

      if (!fs.existsSync(schemaPath)) {
        console.warn('[PostgresService] Schema file not found, skipping schema initialization');
        return;
      }

      const schema = fs.readFileSync(schemaPath, 'utf8');

      const client = await this.pool!.connect();
      try {
        await client.query(schema);
        console.log('[PostgresService] Database schema initialized');
      } catch (error) {
        if (
          !(error as Error).message.includes('already exists') &&
          !(error as Error).message.includes('permission denied')
        ) {
          console.warn(
            '[PostgresService] Schema initialization warning:',
            (error as Error).message
          );
        } else if ((error as Error).message.includes('permission denied')) {
          console.warn(
            '[PostgresService] Schema initialization - permission issue (continuing):',
            (error as Error).message
          );
        }
      } finally {
        client.release();
      }

      console.log('[PostgresService] Running migrations...');
      await runMigrations(this.pool!);
      console.log('[PostgresService] Migrations complete');

      console.log('[PostgresService] Syncing schema columns...');
      await this.syncSchemaColumns();
      console.log('[PostgresService] Schema column sync complete');
    } catch (error) {
      console.error('[PostgresService] Failed to initialize schema:', error);
      console.warn('[PostgresService] Schema initialization failed, but application will continue');
    }
  }

  async runMigrations(): Promise<void> {
    if (!this.pool) throw new Error('Pool not initialized');
    await runMigrations(this.pool);
  }

  async ensureInitialized(): Promise<void> {
    if (this.isInitialized) return;

    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    if (!this.isInitialized && !this.initPromise) {
      console.log('[PostgresService] ensureInitialized: Starting initialization...');
      this.initPromise = this.init();
      await this.initPromise;
    }

    if (!this.isInitialized) {
      throw new Error(
        `PostgresService failed to initialize: ${this.lastError || 'Unknown error'}. Database operations are not available.`
      );
    }
  }

  async query(
    sql: string,
    params: unknown[] = [],
    _options: QueryOptions = {}
  ): Promise<Record<string, unknown>[]> {
    try {
      await this.ensureInitialized();
    } catch (initError) {
      console.error('[PostgresService] Database not initialized:', (initError as Error).message);
      throw new Error('Database service unavailable. Please try again later.');
    }

    const client = await this.pool!.connect();
    try {
      const result = await client.query(sql, params);
      return result.rows;
    } catch (error) {
      console.error('[PostgresService] Query error:', error, { sql, params });

      const err = error as { code?: string; message: string };
      if (err.code === 'ECONNREFUSED') {
        throw new Error('Database connection refused. Please check database server.');
      } else if (err.code === 'ETIMEDOUT') {
        throw new Error('Database connection timeout. Please try again.');
      } else if (err.code === '42P01') {
        throw new Error('Database table not found. Schema may need updating.');
      } else if (err.code === '42703') {
        throw new Error('Database column not found. Schema may need updating.');
      } else {
        throw new Error(`Database query failed: ${err.message}`);
      }
    } finally {
      client.release();
    }
  }

  async queryOne(
    sql: string,
    params: unknown[] = [],
    options: QueryOptions = {}
  ): Promise<Record<string, unknown> | null> {
    const results = await this.query(sql, params, options);
    return results.length > 0 ? results[0] : null;
  }

  async exec(sql: string, params: unknown[] = []): Promise<ExecResult> {
    await this.ensureInitialized();
    const client = await this.pool!.connect();
    try {
      const result = await client.query(sql, params);
      return { changes: result.rowCount || 0, lastID: result.rows[0]?.id };
    } catch (error) {
      console.error('[PostgresService] Exec error:', error, { sql, params });
      throw new Error(`SQL execution failed: ${(error as Error).message}`);
    } finally {
      client.release();
    }
  }

  async insert(table: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    this.validateTableName(table);
    const columns = Object.keys(data);
    this.validateColumnNames(table, columns);

    const { sql, values } = buildInsertQuery(table, data);

    try {
      const result = await this.query(sql, values);
      return result[0];
    } catch (error) {
      console.error('[PostgresService] Insert error:', error, { table, data });
      throw new Error(`Insert failed: ${(error as Error).message}`);
    }
  }

  async update(
    table: string,
    data: Record<string, unknown>,
    whereConditions: Record<string, unknown>
  ): Promise<UpdateResult> {
    this.validateTableName(table);
    const dataColumns = Object.keys(data);
    const whereColumns = Object.keys(whereConditions);
    this.validateColumnNames(table, [...dataColumns, ...whereColumns]);

    const { sql, values } = buildUpdateQuery(table, data, whereConditions);

    try {
      const result = await this.query(sql, values);
      return { changes: result.length, data: result };
    } catch (error) {
      console.error('[PostgresService] Update error:', error, { table, data, whereConditions });
      throw new Error(`Update failed: ${(error as Error).message}`);
    }
  }

  async delete(table: string, whereConditions: Record<string, unknown>): Promise<DeleteResult> {
    this.validateTableName(table);
    const whereColumns = Object.keys(whereConditions);
    this.validateColumnNames(table, whereColumns);

    const { sql, values } = buildDeleteQuery(table, whereConditions);

    try {
      const result = await this.query(sql, values);
      return { changes: result.length, data: result };
    } catch (error) {
      console.error('[PostgresService] Delete error:', error, { table, whereConditions });
      throw new Error(`Delete failed: ${(error as Error).message}`);
    }
  }

  async upsert(
    table: string,
    data: Record<string, unknown>,
    conflictColumns: string[] = ['id']
  ): Promise<Record<string, unknown>> {
    this.validateTableName(table);
    const columns = Object.keys(data);
    this.validateColumnNames(table, [...columns, ...conflictColumns]);

    const { sql, values } = buildUpsertQuery(table, data, conflictColumns);

    try {
      const result = await this.query(sql, values);
      return result[0];
    } catch (error) {
      console.error('[PostgresService] Upsert error:', error, { table, data });
      throw new Error(`Upsert failed: ${(error as Error).message}`);
    }
  }

  async bulkInsert(
    table: string,
    records: Record<string, unknown>[]
  ): Promise<Record<string, unknown>[]> {
    if (!records.length) return [];

    this.validateTableName(table);
    const columns = Object.keys(records[0]);
    this.validateColumnNames(table, columns);

    const { sql, values } = buildBulkInsertQuery(table, records);

    try {
      return await this.query(sql, values);
    } catch (error) {
      console.error('[PostgresService] Bulk insert error:', error, {
        table,
        count: records.length,
      });
      throw new Error(`Bulk insert failed: ${(error as Error).message}`);
    }
  }

  async transaction<T>(callback: TransactionCallback<T>): Promise<T> {
    await this.ensureInitialized();
    const client = await this.pool!.connect();

    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[PostgresService] Transaction rolled back:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async transactionQuery(
    client: PoolClient,
    sql: string,
    params: unknown[] = []
  ): Promise<Record<string, unknown>[]> {
    return transactionQuery(client, sql, params);
  }

  async transactionQueryOne(
    client: PoolClient,
    sql: string,
    params: unknown[] = []
  ): Promise<Record<string, unknown> | null> {
    return transactionQueryOne(client, sql, params);
  }

  async transactionExec(
    client: PoolClient,
    sql: string,
    params: unknown[] = []
  ): Promise<ExecResult> {
    return transactionExec(client, sql, params);
  }

  async createBackup(backupPath: string): Promise<string> {
    const { spawn } = await import('child_process');

    const sanitizedPath = sanitizeBackupPath(backupPath);

    return new Promise((resolve, reject) => {
      const pg_dump = spawn(
        'pg_dump',
        [
          '-h',
          this.config.host || 'localhost',
          '-p',
          String(this.config.port || 5432),
          '-U',
          this.config.user || 'gruenerator',
          '-d',
          this.config.database || 'gruenerator',
          '-f',
          sanitizedPath,
          '--verbose',
        ],
        {
          env: { ...process.env, PGPASSWORD: this.config.password || '' },
        }
      );

      pg_dump.on('close', (code) => {
        if (code === 0) {
          console.log(`[PostgresService] Backup created successfully: ${sanitizedPath}`);
          resolve(sanitizedPath);
        } else {
          reject(new Error(`pg_dump failed with code ${code}`));
        }
      });

      pg_dump.on('error', (error) => {
        reject(new Error(`Backup failed: ${error.message}`));
      });
    });
  }

  async getStats(): Promise<DatabaseStats> {
    try {
      const stats = await this.query(`
        SELECT
          schemaname,
          tablename,
          n_tup_ins as inserts,
          n_tup_upd as updates,
          n_tup_del as deletes,
          n_live_tup as live_tuples,
          n_dead_tup as dead_tuples
        FROM pg_stat_user_tables
        ORDER BY n_live_tup DESC
      `);

      const dbSize = await this.queryOne(`
        SELECT pg_size_pretty(pg_database_size(current_database())) as size
      `);

      return {
        tables: stats as unknown as DatabaseStats['tables'],
        database_size: (dbSize?.size as string) || 'unknown',
        connections: {
          totalCount: this.pool?.totalCount || 0,
          idleCount: this.pool?.idleCount || 0,
          waitingCount: this.pool?.waitingCount || 0,
        },
      };
    } catch (error) {
      console.error('[PostgresService] Failed to get stats:', error);
      return {
        tables: [],
        database_size: 'unknown',
        connections: { totalCount: 0, idleCount: 0, waitingCount: 0 },
        error: (error as Error).message,
      };
    }
  }

  getPoolStatus(): PoolStatus {
    return {
      totalCount: this.pool?.totalCount || 0,
      idleCount: this.pool?.idleCount || 0,
      waitingCount: this.pool?.waitingCount || 0,
      initialized: this.isInitialized,
    };
  }

  async batchUpdateRouteStats(statsMap: Map<string, number>): Promise<void> {
    if (!statsMap || statsMap.size === 0) return;

    try {
      await this.ensureInitialized();
      const client = await this.pool!.connect();

      try {
        await client.query('BEGIN');

        for (const [key, count] of statsMap.entries()) {
          const [method, ...pathParts] = key.split(' ');
          const routePattern = pathParts.join(' ');

          const sql = `
            INSERT INTO route_usage_stats (route_pattern, method, request_count, last_accessed)
            VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
            ON CONFLICT (route_pattern, method)
            DO UPDATE SET
              request_count = route_usage_stats.request_count + EXCLUDED.request_count,
              last_accessed = CURRENT_TIMESTAMP
          `;

          await client.query(sql, [routePattern, method, count]);
        }

        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch {
      // Silent failure - don't break the application
    }
  }

  async getRouteStats(limit = 50): Promise<RouteUsageStat[]> {
    try {
      await this.ensureInitialized();

      const sql = `
        SELECT
          route_pattern,
          method,
          request_count,
          last_accessed,
          created_at
        FROM route_usage_stats
        ORDER BY request_count DESC
        LIMIT $1
      `;

      return (await this.query(sql, [limit])) as unknown as RouteUsageStat[];
    } catch (error) {
      console.error('[PostgresService] Failed to get route stats:', error);
      return [];
    }
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.isInitialized = false;
      console.log('[PostgresService] Connection pool closed');
    }
  }
}

// Singleton instance
let postgresInstance: PostgresService | null = null;

export function getPostgresInstance(): PostgresService {
  if (!postgresInstance) {
    postgresInstance = new PostgresService();
  }
  return postgresInstance;
}
