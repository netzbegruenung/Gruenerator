import pkg from 'pg';
const { Pool, Client } = pkg;
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * PostgreSQL Service for Grünerator
 * Handles all PostgreSQL operations with connection pooling and high performance
 */
class PostgresService {
    constructor(config = null) {
        if (config) {
            this.config = config;
        } else if (process.env.DATABASE_URL) {
            // Support single connection string via env
            this.config = {
                connectionString: process.env.DATABASE_URL,
                ssl: process.env.POSTGRES_SSL === 'true' ? {
                    rejectUnauthorized: process.env.POSTGRES_SSL_REJECT_UNAUTHORIZED !== 'false',
                } : false,
                max: 20,
                idleTimeoutMillis: 30000,
                connectionTimeoutMillis: 10000,
            };
        } else {
            // Support discrete env vars (fallbacks to PG* as well)
            const host = process.env.POSTGRES_HOST || process.env.PGHOST || 'localhost';
            const port = parseInt(process.env.POSTGRES_PORT || process.env.PGPORT || '5432', 10);
            const user = process.env.POSTGRES_USER || process.env.PGUSER || 'gruenerator';
            const passwordRaw = (process.env.POSTGRES_PASSWORD !== undefined)
                ? process.env.POSTGRES_PASSWORD
                : (process.env.PGPASSWORD !== undefined ? process.env.PGPASSWORD : '');
            const password = typeof passwordRaw === 'string' ? passwordRaw : String(passwordRaw);
            const database = process.env.POSTGRES_DATABASE || process.env.PGDATABASE || 'gruenerator';
            const ssl = process.env.POSTGRES_SSL === 'true' ? {
                rejectUnauthorized: process.env.POSTGRES_SSL_REJECT_UNAUTHORIZED !== 'false',
            } : false;

            this.config = {
                host,
                port,
                user,
                password,
                database,
                ssl,
                max: 20,
                idleTimeoutMillis: 30000,
                connectionTimeoutMillis: 10000,
            };
        }
        this.pool = null;
        this.isInitialized = false;
        this.isHealthy = false;
        this.healthStatus = 'initializing';
        this.lastError = null;
        this.initPromise = null;
    }

    getSafeConfigForLog() {
        if (this.config?.connectionString) {
            return {
                mode: 'connection_string',
                ssl: !!(this.config.ssl),
            };
        }
        return {
            host: this.config?.host,
            port: this.config?.port,
            user: this.config?.user,
            database: this.config?.database,
            ssl: !!(this.config?.ssl),
            autoCreateDb: process.env.POSTGRES_AUTO_CREATE_DB !== 'false'
        };
    }

    async init() {
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
            console.log('[PostgresService] PostgreSQL minimal initialization successful (connection only)');
            
        } catch (error) {
            this.isInitialized = false;
            this.isHealthy = false;
            this.healthStatus = 'error';
            this.lastError = error.message;
            
            console.error('[PostgresService] Failed to initialize PostgreSQL connection:', error);

            console.log('[PostgresService] Scheduling retry in 5 seconds...');
            setTimeout(() => {
                console.log('[PostgresService] Retry timer fired, calling retryInit()');
                this.retryInit();
            }, 5000);
            console.log('[PostgresService] Retry scheduled, continuing...');
            
            // Don't throw - let the application continue
            console.warn('[PostgresService] Database connection failed, but application will continue. Some features may be unavailable.');
        }
    }

    /**
     * Retry database initialization
     */
    async retryInit() {
        console.log('[PostgresService] Retrying database initialization...');
        await this.init();
    }

    /**
     * Get database health status
     */
    getHealth() {
        return {
            isHealthy: this.isHealthy,
            isInitialized: this.isInitialized,
            status: this.healthStatus,
            lastError: this.lastError,
            pool: this.pool ? {
                totalCount: this.pool.totalCount,
                idleCount: this.pool.idleCount,
                waitingCount: this.pool.waitingCount
            } : null
        };
    }

    /**
     * Create database if it doesn't exist
     */
    async createDatabaseIfNotExists() {
        if (this.config.connectionString || process.env.POSTGRES_AUTO_CREATE_DB === 'false') {
            return;
        }
        const dbName = this.config.database;

        const tempConfig = { ...this.config, database: 'postgres' };
        const tempClient = new Client(tempConfig);
        
        try {
            await tempClient.connect();

            const result = await tempClient.query(
                'SELECT 1 FROM pg_database WHERE datname = $1',
                [dbName]
            );

            if (result.rows.length === 0) {
                await tempClient.query(`CREATE DATABASE "${dbName}"`);
                console.log(`[PostgresService] Created database '${dbName}'`);
            } else {
                console.log(`[PostgresService] Database '${dbName}' already exists`);
            }
            
        } catch (error) {
            console.warn(`[PostgresService] Database creation check failed: ${error.message}`);
        } finally {
            await tempClient.end();
        }
    }

    /**
     * Test database connection
     */
    async testConnection() {
        const client = await this.pool.connect();
        try {
            const result = await client.query('SELECT NOW()');
            console.log('[PostgresService] Database connection successful:', result.rows[0].now);
        } catch (error) {
            throw new Error(`Connection test failed: ${error.message}`);
        } finally {
            client.release();
        }
    }

    /**
     * Parse schema.sql file to extract table definitions and columns
     */
    parseSchemaFile(schemaContent) {
        const tables = {};

        const tableMatches = schemaContent.match(/CREATE TABLE IF NOT EXISTS (\w+)\s*\(([\s\S]*?)\);/g);
        
        if (!tableMatches) return tables;
        
        tableMatches.forEach(tableMatch => {
            const tableNameMatch = tableMatch.match(/CREATE TABLE IF NOT EXISTS (\w+)/);
            if (!tableNameMatch) return;
            
            const tableName = tableNameMatch[1];

            const columnSectionMatch = tableMatch.match(/CREATE TABLE IF NOT EXISTS \w+\s*\(([\s\S]*)\);/);
            if (!columnSectionMatch) return;
            
            const columnSection = columnSectionMatch[1];
            const columns = [];

            const lines = columnSection.split('\n').map(line => line.trim()).filter(line => line);

            for (const line of lines) {
                if (line.startsWith('--') || 
                    line.includes('CONSTRAINT') || 
                    line.includes('UNIQUE(') ||
                    line.includes('REFERENCES') ||
                    line.includes('CHECK(') ||
                    line.includes('PRIMARY KEY') ||
                    line.includes('FOREIGN KEY')) {
                    continue;
                }

                const columnMatch = line.match(/^([a-zA-Z_]\w*)\s+([A-Z]+(?:\([^)]+\))?(?:\s*\[\])?)\s*(.*?)(?:,\s*)?$/);
                if (columnMatch) {
                    const [, columnName, dataType, constraints] = columnMatch;
                    columns.push({
                        name: columnName,
                        type: dataType,
                        constraints: constraints.trim()
                    });
                }
            }
            
            if (columns.length > 0) {
                tables[tableName] = columns;
            }
        });
        
        return tables;
    }

    /**
     * Get existing columns from database for all tables
     */
    async getExistingColumns() {
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
        const tables = {};
        
        result.forEach(row => {
            if (!tables[row.table_name]) {
                tables[row.table_name] = [];
            }
            tables[row.table_name].push({
                name: row.column_name,
                type: row.data_type,
                nullable: row.is_nullable === 'YES',
                default: row.column_default
            });
        });
        
        return tables;
    }

    /**
     * Synchronize schema columns - add missing columns to existing tables
     */
    async syncSchemaColumns() {
        try {
            const schemaPath = path.join(__dirname, '../postgres/schema.sql');
            
            if (!fs.existsSync(schemaPath)) {
                console.log('[PostgresService] Schema file not found, skipping column sync');
                return;
            }

            const schemaContent = fs.readFileSync(schemaPath, 'utf8');
            const expectedTables = this.parseSchemaFile(schemaContent);
            const existingTables = await this.getExistingColumns();
            
            const alterStatements = [];

            for (const [tableName, expectedColumns] of Object.entries(expectedTables)) {
                const existingColumns = existingTables[tableName] || [];
                const existingColumnNames = existingColumns.map(col => col.name);

                for (const expectedColumn of expectedColumns) {
                    if (!existingColumnNames.includes(expectedColumn.name)) {
                        let alterStatement = `ALTER TABLE ${tableName} ADD COLUMN ${expectedColumn.name} ${expectedColumn.type}`;

                        if (expectedColumn.constraints) {
                            if (expectedColumn.constraints.includes('NOT NULL')) {
                                if (expectedColumn.constraints.includes('DEFAULT')) {
                                    alterStatement += ` ${expectedColumn.constraints}`;
                                } else {
                                    // Just add the column without NOT NULL for existing tables
                                    const constraintsWithoutNotNull = expectedColumn.constraints.replace(/NOT NULL/g, '').trim();
                                    if (constraintsWithoutNotNull) {
                                        alterStatement += ` ${constraintsWithoutNotNull}`;
                                    }
                                }
                            } else {
                                alterStatement += ` ${expectedColumn.constraints}`;
                            }
                        }
                        
                        alterStatements.push({
                            table: tableName,
                            column: expectedColumn.name,
                            statement: alterStatement
                        });
                    }
                }
            }
            
            // Execute ALTER statements
            if (alterStatements.length > 0) {
                console.log(`[PostgresService] Found ${alterStatements.length} missing columns to add`);
                
                const client = await this.pool.connect();
                try {
                    for (const alter of alterStatements) {
                        try {
                            await client.query(alter.statement);
                            console.log(`[PostgresService] ✅ Added column ${alter.table}.${alter.column}`);
                        } catch (error) {
                            console.warn(`[PostgresService] ⚠️ Failed to add column ${alter.table}.${alter.column}:`, error.message);
                        }
                    }
                } finally {
                    client.release();
                }
            } else {
                console.log('[PostgresService] All schema columns are up to date');
            }
            
        } catch (error) {
            console.error('[PostgresService] Error during schema column sync:', error);
            // Don't throw - let the application continue even if schema sync fails
        }
    }

    /**
     * Initialize database schema from SQL file (MANUAL USE ONLY - COMMENTED OUT FROM AUTO-INIT)
     */
    async initSchema() {
        console.log('[PostgresService] initSchema() called - FOR MANUAL USE ONLY');
        try {
            const schemaPath = path.join(__dirname, '../postgres/schema.sql');
            console.log('[PostgresService] Looking for schema at:', schemaPath);
            
            if (!fs.existsSync(schemaPath)) {
                console.warn('[PostgresService] Schema file not found, skipping schema initialization');
                return;
            }

            const schema = fs.readFileSync(schemaPath, 'utf8');
            
            const client = await this.pool.connect();
            try {
                // Execute schema - this creates tables, indexes, etc.
                await client.query(schema);
                console.log('[PostgresService] Database schema initialized');
            } catch (error) {
                // Log but don't fail on common errors
                if (!error.message.includes('already exists') && 
                    !error.message.includes('permission denied')) {
                    console.warn('[PostgresService] Schema initialization warning:', error.message);
                } else if (error.message.includes('permission denied')) {
                    console.warn('[PostgresService] Schema initialization - permission issue (continuing):', error.message);
                }
            } finally {
                client.release();
            }
            
            // Run migrations after schema initialization
            console.log('[PostgresService] Running migrations...');
            await this.runMigrations();
            console.log('[PostgresService] Migrations complete');
            
            // After schema initialization, sync any missing columns (non-blocking)
            console.log('[PostgresService] Syncing schema columns...');
            await this.syncSchemaColumns();
            console.log('[PostgresService] Schema column sync complete');
            
        } catch (error) {
            console.error('[PostgresService] Failed to initialize schema:', error);
            // Don't throw - log the error and continue
            // The application should still work even if schema sync fails
            console.warn('[PostgresService] Schema initialization failed, but application will continue');
        }
    }

    /**
     * Run database migrations with timeout protection
     */
    async runMigrations() {
        try {
            const migrationsPath = path.join(__dirname, '../migrations');
            
            if (!fs.existsSync(migrationsPath)) {
                console.log('[PostgresService] Migrations directory not found, skipping migrations');
                return;
            }

            // Create migrations tracking table if it doesn't exist
            await this.query(`
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    id SERIAL PRIMARY KEY,
                    filename TEXT NOT NULL UNIQUE,
                    applied_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Get list of migration files
            const migrationFiles = fs.readdirSync(migrationsPath)
                .filter(file => file.endsWith('.sql'))
                .sort();

            if (migrationFiles.length === 0) {
                console.log('[PostgresService] No migration files found');
                return;
            }

            // Check which migrations have already been applied
            const appliedMigrations = await this.query('SELECT filename FROM schema_migrations');
            const appliedFilenames = new Set(appliedMigrations.map(row => row.filename));

            // Run pending migrations with timeout protection
            for (const filename of migrationFiles) {
                if (appliedFilenames.has(filename)) {
                    console.log(`[PostgresService] Migration ${filename} already applied`);
                    continue;
                }

                console.log(`[PostgresService] Running migration ${filename}...`);
                const startTime = Date.now();
                
                const migrationPath = path.join(migrationsPath, filename);
                const migrationSql = fs.readFileSync(migrationPath, 'utf8');
                
                // Log migration file size for debugging
                console.log(`[PostgresService] Migration ${filename} size: ${migrationSql.length} characters`);

                // Skip migration if it contains problematic operations
                if (migrationSql.includes('FOREIGN KEY') && migrationSql.includes('REFERENCES')) {
                    console.warn(`[PostgresService] ⚠️ Skipping migration ${filename} - contains foreign key constraint that may hang`);
                    console.warn('[PostgresService] Foreign key constraints will be handled by schema.sql instead');
                    continue;
                }

                const client = await this.pool.connect();
                try {
                    
                    // Set statement timeout to prevent hanging (10 seconds)
                    await client.query('SET statement_timeout = 10000');
                    
                    // Run migration in transaction
                    await client.query('BEGIN');
                    
                    // Execute migration directly (timeout handled by PostgreSQL)
                    await client.query(migrationSql);
                    
                    await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
                    await client.query('COMMIT');
                    
                    const duration = Date.now() - startTime;
                    console.log(`[PostgresService] ✅ Migration ${filename} applied successfully in ${duration}ms`);
                } catch (error) {
                    try {
                        await client.query('ROLLBACK');
                    } catch (rollbackError) {
                        console.error(`[PostgresService] Rollback failed for ${filename}:`, rollbackError.message);
                    }
                    
                    console.error(`[PostgresService] ❌ Migration ${filename} failed:`, error.message);
                    // Don't stop on migration errors - log and continue
                } finally {
                    // Reset statement timeout and release client
                    try {
                        await client.query('SET statement_timeout = 0');
                    } catch (resetError) {
                        console.warn('[PostgresService] Failed to reset statement timeout:', resetError.message);
                    }
                    client.release();
                }
            }
            
        } catch (error) {
            console.error('[PostgresService] Error running migrations:', error);
            // Don't throw - let the application continue
        }
    }


    /**
     * Ensure service is initialized
     */
    async ensureInitialized() {
        // If already initialized, return immediately
        if (this.isInitialized) {
            return;
        }
        
        // If initialization is in progress, wait for it
        if (this.initPromise) {
            await this.initPromise;
            return;
        }
        
        // Only start initialization if not already started
        if (!this.isInitialized && !this.initPromise) {
            console.log('[PostgresService] ensureInitialized: Starting initialization...');
            this.initPromise = this.init();
            await this.initPromise;
        }
        
        // Check if initialization was successful
        if (!this.isInitialized) {
            throw new Error(`PostgresService failed to initialize: ${this.lastError || 'Unknown error'}. Database operations are not available.`);
        }
    }

    /**
     * Execute a raw SQL query
     */
    async query(sql, params = [], options = {}) {
        try {
            await this.ensureInitialized();
        } catch (initError) {
            console.error('[PostgresService] Database not initialized:', initError.message);
            throw new Error('Database service unavailable. Please try again later.');
        }

        const client = await this.pool.connect();
        try {
            const result = await client.query(sql, params);
            return result.rows;
        } catch (error) {
            console.error('[PostgresService] Query error:', error, { sql, params });
            
            // Provide more user-friendly error messages
            if (error.code === 'ECONNREFUSED') {
                throw new Error('Database connection refused. Please check database server.');
            } else if (error.code === 'ETIMEDOUT') {
                throw new Error('Database connection timeout. Please try again.');
            } else if (error.code === '42P01') {
                throw new Error('Database table not found. Schema may need updating.');
            } else if (error.code === '42703') {
                throw new Error('Database column not found. Schema may need updating.');
            } else {
                throw new Error(`Database query failed: ${error.message}`);
            }
        } finally {
            if (client) {
                client.release();
            }
        }
    }

    /**
     * Execute a query that returns a single result
     */
    async queryOne(sql, params = [], options = {}) {
        const results = await this.query(sql, params, options);
        return results.length > 0 ? results[0] : null;
    }

    /**
     * Execute a query and return the row count
     */
    async exec(sql, params = []) {
        await this.ensureInitialized();
        const client = await this.pool.connect();
        try {
            const result = await client.query(sql, params);
            return { changes: result.rowCount, lastID: result.rows[0]?.id };
        } catch (error) {
            console.error('[PostgresService] Exec error:', error, { sql, params });
            throw new Error(`SQL execution failed: ${error.message}`);
        } finally {
            client.release();
        }
    }

    /**
     * Insert a record into a table
     */
    async insert(table, data) {
        const columns = Object.keys(data);
        const values = Object.values(data);
        const placeholders = values.map((_, index) => `$${index + 1}`);

        const sql = `
            INSERT INTO ${table} (${columns.join(', ')})
            VALUES (${placeholders.join(', ')})
            RETURNING *
        `;

        try {
            const result = await this.query(sql, values);
            return result[0];
        } catch (error) {
            console.error('[PostgresService] Insert error:', error, { table, data });
            throw new Error(`Insert failed: ${error.message}`);
        }
    }

    /**
     * Update records in a table
     */
    async update(table, data, whereConditions) {
        const setClause = Object.keys(data).map((key, index) => `${key} = $${index + 1}`);
        const whereClause = Object.keys(whereConditions).map((key, index) =>
            `${key} = $${Object.keys(data).length + index + 1}`
        );

        const sql = `
            UPDATE ${table}
            SET ${setClause.join(', ')}, updated_at = CURRENT_TIMESTAMP
            WHERE ${whereClause.join(' AND ')}
            RETURNING *
        `;

        const values = [...Object.values(data), ...Object.values(whereConditions)];

        try {
            const result = await this.query(sql, values);
            return {
                changes: result.length,
                data: result
            };
        } catch (error) {
            console.error('[PostgresService] Update error:', error, { table, data, whereConditions });
            throw new Error(`Update failed: ${error.message}`);
        }
    }

    /**
     * Delete records from a table
     */
    async delete(table, whereConditions) {
        const whereClause = Object.keys(whereConditions).map((key, index) => `${key} = $${index + 1}`);
        
        const sql = `DELETE FROM ${table} WHERE ${whereClause.join(' AND ')} RETURNING *`;
        const values = Object.values(whereConditions);

        try {
            const result = await this.query(sql, values);
            return { changes: result.length, data: result };
        } catch (error) {
            console.error('[PostgresService] Delete error:', error, { table, whereConditions });
            throw new Error(`Delete failed: ${error.message}`);
        }
    }

    /**
     * Upsert (INSERT ... ON CONFLICT UPDATE) a record
     */
    async upsert(table, data, conflictColumns = ['id']) {
        const columns = Object.keys(data);
        const values = Object.values(data);
        const placeholders = values.map((_, index) => `$${index + 1}`);

        const updateColumns = columns.filter(col => !conflictColumns.includes(col));
        const updateClause = updateColumns.map(col => `${col} = EXCLUDED.${col}`).join(', ');

        const sql = `
            INSERT INTO ${table} (${columns.join(', ')})
            VALUES (${placeholders.join(', ')})
            ON CONFLICT (${conflictColumns.join(', ')})
            DO UPDATE SET ${updateClause}
            RETURNING *
        `;

        try {
            const result = await this.query(sql, values);
            return result[0];
        } catch (error) {
            console.error('[PostgresService] Upsert error:', error, { table, data });
            throw new Error(`Upsert failed: ${error.message}`);
        }
    }

    /**
     * Bulk insert multiple records
     */
    async bulkInsert(table, records) {
        if (!records.length) return [];

        const columns = Object.keys(records[0]);
        const valuesClause = records.map((_, recordIndex) => {
            const placeholders = columns.map((_, colIndex) =>
                `$${recordIndex * columns.length + colIndex + 1}`
            );
            return `(${placeholders.join(', ')})`;
        }).join(', ');

        const values = records.flatMap(record => Object.values(record));

        const sql = `
            INSERT INTO ${table} (${columns.join(', ')})
            VALUES ${valuesClause}
            RETURNING *
        `;

        try {
            const result = await this.query(sql, values);
            return result;
        } catch (error) {
            console.error('[PostgresService] Bulk insert error:', error, { table, count: records.length });
            throw new Error(`Bulk insert failed: ${error.message}`);
        }
    }

    /**
     * Execute multiple queries in a transaction
     */
    async transaction(queries) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            
            const results = [];
            for (const { sql, params } of queries) {
                const result = await client.query(sql, params || []);
                results.push(result.rows);
            }
            
            await client.query('COMMIT');
            return results;
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('[PostgresService] Transaction error:', error);
            throw new Error(`Transaction failed: ${error.message}`);
        } finally {
            client.release();
        }
    }

    /**
     * Create a database backup using pg_dump (if available)
     */
    async createBackup(backupPath) {
        const { spawn } = await import('child_process');
        
        return new Promise((resolve, reject) => {
            const pg_dump = spawn('pg_dump', [
                '-h', this.config.host,
                '-p', this.config.port,
                '-U', this.config.user,
                '-d', this.config.database,
                '-f', backupPath,
                '--verbose'
            ], {
                env: { ...process.env, PGPASSWORD: this.config.password }
            });

            pg_dump.on('close', (code) => {
                if (code === 0) {
                    console.log(`[PostgresService] Backup created successfully: ${backupPath}`);
                    resolve(backupPath);
                } else {
                    reject(new Error(`pg_dump failed with code ${code}`));
                }
            });

            pg_dump.on('error', (error) => {
                reject(new Error(`Backup failed: ${error.message}`));
            });
        });
    }

    /**
     * Get database statistics
     */
    async getStats() {
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
                tables: stats,
                database_size: dbSize.size,
                connections: {
                    total: this.pool.totalCount,
                    idle: this.pool.idleCount,
                    waiting: this.pool.waitingCount
                }
            };
        } catch (error) {
            console.error('[PostgresService] Failed to get stats:', error);
            return { error: error.message };
        }
    }


    /**
     * Get connection pool status
     */
    getPoolStatus() {
        return {
            totalCount: this.pool.totalCount,
            idleCount: this.pool.idleCount,
            waitingCount: this.pool.waitingCount,
            initialized: this.isInitialized
        };
    }

    /**
     * Execute a transaction with automatic rollback on error
     */
    async transaction(callback) {
        await this.ensureInitialized();
        const client = await this.pool.connect();
        
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

    /**
     * Transaction-aware query method
     */
    async transactionQuery(client, sql, params = [], options = {}) {
        try {
            const result = await client.query(sql, params);
            return result.rows;
        } catch (error) {
            console.error('[PostgresService] Transaction query error:', error, { sql, params });
            throw new Error(`Transaction SQL query failed: ${error.message}`);
        }
    }

    /**
     * Transaction-aware single query method
     */
    async transactionQueryOne(client, sql, params = [], options = {}) {
        const results = await this.transactionQuery(client, sql, params, options);
        return results.length > 0 ? results[0] : null;
    }

    /**
     * Transaction-aware exec method
     */
    async transactionExec(client, sql, params = []) {
        try {
            const result = await client.query(sql, params);
            return { changes: result.rowCount, lastID: result.rows[0]?.id };
        } catch (error) {
            console.error('[PostgresService] Transaction exec error:', error, { sql, params });
            throw new Error(`Transaction SQL execution failed: ${error.message}`);
        }
    }

    /**
     * Close all connections and clean up
     */
    async close() {
        if (this.pool) {
            await this.pool.end();
            this.isInitialized = false;
            console.log('[PostgresService] Connection pool closed');
        }
    }
}

// Export singleton instance
let postgresInstance = null;

export function getPostgresInstance() {
    if (!postgresInstance) {
        postgresInstance = new PostgresService();
    }
    return postgresInstance;
}

export { PostgresService };
export default PostgresService;
