import pkg from 'pg';
const { Pool, Client } = pkg;
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getEncryptionService, SENSITIVE_FIELDS } from './EncryptionService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * PostgreSQL Service for Grünerator
 * Handles all PostgreSQL operations with connection pooling and high performance
 */
class PostgresService {
    constructor(config = null) {
        this.config = config || {
            host: process.env.POSTGRES_HOST || 'localhost',
            port: process.env.POSTGRES_PORT || 5432,
            user: process.env.POSTGRES_USER || 'postgres',
            password: process.env.POSTGRES_PASSWORD || '',
            database: process.env.POSTGRES_DATABASE || 'gruenerator',
            ssl: process.env.POSTGRES_SSL === 'true' ? { 
                rejectUnauthorized: process.env.POSTGRES_SSL_REJECT_UNAUTHORIZED !== 'false',
                // Coolify handles SSL certificates automatically
            } : false,
            max: 20, // max number of clients in the pool
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
        };
        this.pool = null;
        this.isInitialized = false;
        this.initPromise = null;
        this.encryption = getEncryptionService();
        // Don't call init() in constructor - it's async
    }

    /**
     * Initialize the PostgreSQL connection pool
     */
    async init() {
        try {
            // Try to create database if it doesn't exist
            await this.createDatabaseIfNotExists();
            
            // Create connection pool to the target database
            this.pool = new Pool(this.config);
            
            // Test connection
            await this.testConnection();
            
            // Initialize schema
            await this.initSchema();
            
            this.isInitialized = true;
            console.log('[PostgresService] PostgreSQL database initialized successfully');
            
        } catch (error) {
            console.error('[PostgresService] Failed to initialize PostgreSQL database:', error);
            throw new Error(`PostgreSQL initialization failed: ${error.message}`);
        }
    }

    /**
     * Create database if it doesn't exist
     */
    async createDatabaseIfNotExists() {
        const dbName = this.config.database;
        
        // Connect to postgres database to create our target database
        const tempConfig = { ...this.config, database: 'postgres' };
        const tempClient = new Client(tempConfig);
        
        try {
            await tempClient.connect();
            
            // Check if database exists
            const result = await tempClient.query(
                'SELECT 1 FROM pg_database WHERE datname = $1',
                [dbName]
            );
            
            if (result.rows.length === 0) {
                // Database doesn't exist, create it
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
     * Initialize database schema from SQL file
     */
    async initSchema() {
        try {
            const schemaPath = path.join(__dirname, '../postgres/schema.sql');
            
            if (!fs.existsSync(schemaPath)) {
                console.warn('[PostgresService] Schema file not found, skipping schema initialization');
                return;
            }

            const schema = fs.readFileSync(schemaPath, 'utf8');
            
            const client = await this.pool.connect();
            try {
                // Execute schema
                await client.query(schema);
                console.log('[PostgresService] Database schema initialized');
            } catch (error) {
                // Log but don't fail on duplicate table errors
                if (!error.message.includes('already exists')) {
                    console.warn('[PostgresService] Schema initialization warning:', error.message);
                }
            } finally {
                client.release();
            }
            
        } catch (error) {
            console.error('[PostgresService] Failed to initialize schema:', error);
            throw error;
        }
    }

    /**
     * Get sensitive fields for a table
     */
    getSensitiveFields(table) {
        return SENSITIVE_FIELDS[table] || [];
    }

    /**
     * Encrypt sensitive fields in data before storing
     */
    encryptSensitiveFields(table, data) {
        const sensitiveFields = this.getSensitiveFields(table);
        if (sensitiveFields.length === 0) {
            return data;
        }

        const encrypted = { ...data };
        for (const field of sensitiveFields) {
            if (encrypted[field] !== undefined && encrypted[field] !== null && encrypted[field] !== '') {
                try {
                    encrypted[field] = this.encryption.encrypt(encrypted[field]);
                } catch (error) {
                    console.error(`[PostgresService] Failed to encrypt field ${field}:`, error);
                }
            }
        }
        return encrypted;
    }

    /**
     * Decrypt sensitive fields in data after reading
     */
    decryptSensitiveFields(table, data) {
        if (!data) return data;
        
        const sensitiveFields = this.getSensitiveFields(table);
        if (sensitiveFields.length === 0) {
            return data;
        }

        const decrypted = { ...data };
        for (const field of sensitiveFields) {
            if (decrypted[field]) {
                try {
                    decrypted[field] = this.encryption.decrypt(decrypted[field]);
                } catch (error) {
                    console.warn(`[PostgresService] Failed to decrypt field ${field}:`, error);
                    // Leave field as is if decryption fails
                }
            }
        }
        return decrypted;
    }

    /**
     * Process array of results with decryption
     */
    decryptResultArray(table, results) {
        if (!Array.isArray(results)) return results;
        return results.map(item => this.decryptSensitiveFields(table, item));
    }

    /**
     * Ensure service is initialized
     */
    async ensureInitialized() {
        if (!this.isInitialized && !this.initPromise) {
            this.initPromise = this.init();
        }
        if (this.initPromise) {
            await this.initPromise;
        }
        if (!this.isInitialized) {
            throw new Error('PostgresService failed to initialize');
        }
    }

    /**
     * Execute a raw SQL query
     */
    async query(sql, params = [], options = {}) {
        await this.ensureInitialized();
        const client = await this.pool.connect();
        try {
            const result = await client.query(sql, params);
            
            // If table is specified in options, decrypt sensitive fields
            if (options.table) {
                return this.decryptResultArray(options.table, result.rows);
            }
            
            return result.rows;
        } catch (error) {
            console.error('[PostgresService] Query error:', error, { sql, params });
            throw new Error(`SQL query failed: ${error.message}`);
        } finally {
            client.release();
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
        // Encrypt sensitive fields before inserting
        const encryptedData = this.encryptSensitiveFields(table, data);
        
        const columns = Object.keys(encryptedData);
        const values = Object.values(encryptedData);
        const placeholders = values.map((_, index) => `$${index + 1}`);

        const sql = `
            INSERT INTO ${table} (${columns.join(', ')}) 
            VALUES (${placeholders.join(', ')}) 
            RETURNING *
        `;

        try {
            const result = await this.query(sql, values);
            // Return decrypted result
            return this.decryptSensitiveFields(table, result[0]);
        } catch (error) {
            console.error('[PostgresService] Insert error:', error, { table, data });
            throw new Error(`Insert failed: ${error.message}`);
        }
    }

    /**
     * Update records in a table
     */
    async update(table, data, whereConditions) {
        // Encrypt sensitive fields before updating
        const encryptedData = this.encryptSensitiveFields(table, data);
        
        const setClause = Object.keys(encryptedData).map((key, index) => `${key} = $${index + 1}`);
        const whereClause = Object.keys(whereConditions).map((key, index) => 
            `${key} = $${Object.keys(encryptedData).length + index + 1}`
        );

        const sql = `
            UPDATE ${table} 
            SET ${setClause.join(', ')}, updated_at = CURRENT_TIMESTAMP
            WHERE ${whereClause.join(' AND ')} 
            RETURNING *
        `;

        const values = [...Object.values(encryptedData), ...Object.values(whereConditions)];

        try {
            const result = await this.query(sql, values);
            // Return decrypted results
            return { 
                changes: result.length, 
                data: this.decryptResultArray(table, result) 
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
        // Encrypt sensitive fields before upserting
        const encryptedData = this.encryptSensitiveFields(table, data);
        
        const columns = Object.keys(encryptedData);
        const values = Object.values(encryptedData);
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
            // Return decrypted result
            return this.decryptSensitiveFields(table, result[0]);
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

        // Encrypt sensitive fields in all records
        const encryptedRecords = records.map(record => 
            this.encryptSensitiveFields(table, record)
        );

        const columns = Object.keys(encryptedRecords[0]);
        const valuesClause = encryptedRecords.map((_, recordIndex) => {
            const placeholders = columns.map((_, colIndex) => 
                `$${recordIndex * columns.length + colIndex + 1}`
            );
            return `(${placeholders.join(', ')})`;
        }).join(', ');

        const values = encryptedRecords.flatMap(record => Object.values(record));

        const sql = `
            INSERT INTO ${table} (${columns.join(', ')}) 
            VALUES ${valuesClause} 
            RETURNING *
        `;

        try {
            const result = await this.query(sql, values);
            // Return decrypted results
            return this.decryptResultArray(table, result);
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
        const { spawn } = require('child_process');
        
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