import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getEncryptionService, SENSITIVE_FIELDS } from './EncryptionService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * MariaDB Service for Grünerator
 * Handles all MariaDB operations with connection pooling and high performance
 */
class MariaDBService {
    constructor(config = null) {
        this.config = config || {
            host: process.env.MARIADB_HOST || 'localhost',
            port: parseInt(process.env.MARIADB_PORT) || 3306,
            user: process.env.MARIADB_USER || 'root',
            password: process.env.MARIADB_PASSWORD || '',
            database: process.env.MARIADB_DATABASE || 'gruenerator',
            ssl: process.env.MARIADB_SSL === 'true' ? { 
                rejectUnauthorized: false // Accept self-signed certificates
            } : false,
            connectionLimit: 20,
            acquireTimeout: 60000,
            timeout: 60000,
            reconnect: true
        };
        this.pool = null;
        this.isInitialized = false;
        this.initPromise = null;
        this.encryption = getEncryptionService();
    }

    /**
     * Initialize the MariaDB connection pool
     */
    async init() {
        try {
            // Create connection pool
            this.pool = mysql.createPool(this.config);
            
            // Test connection
            await this.testConnection();
            
            // Initialize schema
            await this.initSchema();
            
            this.isInitialized = true;
            console.log('[MariaDBService] MariaDB database initialized successfully');
            
        } catch (error) {
            console.error('[MariaDBService] Failed to initialize MariaDB database:', error);
            throw new Error(`MariaDB initialization failed: ${error.message}`);
        }
    }

    /**
     * Test database connection
     */
    async testConnection() {
        try {
            const [rows] = await this.pool.execute('SELECT NOW() as now');
            console.log('[MariaDBService] Database connection successful:', rows[0].now);
        } catch (error) {
            throw new Error(`Connection test failed: ${error.message}`);
        }
    }

    /**
     * Initialize database schema from SQL file
     */
    async initSchema() {
        try {
            const schemaPath = path.join(__dirname, '../mariadb/schema.sql');
            
            if (!fs.existsSync(schemaPath)) {
                console.warn('[MariaDBService] Schema file not found, skipping schema initialization');
                return;
            }

            const schema = fs.readFileSync(schemaPath, 'utf8');
            
            // Split schema into individual statements
            const statements = schema
                .split(';')
                .map(stmt => stmt.trim())
                .filter(stmt => stmt.length > 0);
            
            for (const statement of statements) {
                try {
                    await this.pool.execute(statement);
                } catch (error) {
                    // Log but don't fail on duplicate table errors or comments
                    if (!error.message.includes('already exists') && 
                        !error.message.includes('Table') &&
                        statement.startsWith('--') === false) {
                        console.warn('[MariaDBService] Schema statement warning:', error.message);
                    }
                }
            }
            
            console.log('[MariaDBService] Database schema initialized');
            
        } catch (error) {
            console.error('[MariaDBService] Failed to initialize schema:', error);
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
                    console.error(`[MariaDBService] Failed to encrypt field ${field}:`, error);
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
            if (decrypted[field] !== null && decrypted[field] !== undefined && decrypted[field] !== '') {
                try {
                    decrypted[field] = this.encryption.decrypt(decrypted[field]);
                } catch (error) {
                    console.warn(`[MariaDBService] Failed to decrypt field ${field}:`, error);
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
            throw new Error('MariaDBService failed to initialize');
        }
    }

    /**
     * Execute a raw SQL query
     */
    async query(sql, params = [], options = {}) {
        await this.ensureInitialized();
        try {
            const [rows] = await this.pool.execute(sql, params);
            
            // If table is specified in options, decrypt sensitive fields
            if (options.table) {
                return this.decryptResultArray(options.table, rows);
            }
            
            return rows;
        } catch (error) {
            console.error('[MariaDBService] Query error:', error, { sql, params });
            throw new Error(`SQL query failed: ${error.message}`);
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
        try {
            const [result] = await this.pool.execute(sql, params);
            return { changes: result.affectedRows, lastID: result.insertId };
        } catch (error) {
            console.error('[MariaDBService] Exec error:', error, { sql, params });
            throw new Error(`SQL execution failed: ${error.message}`);
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
        const placeholders = columns.map(() => '?');

        const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`;

        try {
            const [result] = await this.pool.execute(sql, values);
            
            // Get the inserted record back
            const insertedRecord = await this.queryOne(
                `SELECT * FROM ${table} WHERE id = ?`, 
                [result.insertId], 
                { table }
            );
            
            return insertedRecord;
        } catch (error) {
            console.error('[MariaDBService] Insert error:', error, { table, data });
            throw new Error(`Insert failed: ${error.message}`);
        }
    }

    /**
     * Update records in a table
     */
    async update(table, data, whereConditions) {
        // Encrypt sensitive fields before updating
        const encryptedData = this.encryptSensitiveFields(table, data);
        
        const setClause = Object.keys(encryptedData).map(key => `${key} = ?`);
        const whereClause = Object.keys(whereConditions).map(key => `${key} = ?`);

        const sql = `
            UPDATE ${table} 
            SET ${setClause.join(', ')}, updated_at = NOW()
            WHERE ${whereClause.join(' AND ')}
        `;

        const values = [...Object.values(encryptedData), ...Object.values(whereConditions)];

        try {
            const [result] = await this.pool.execute(sql, values);
            
            // Get updated records
            const updatedRecords = await this.query(
                `SELECT * FROM ${table} WHERE ${whereClause.join(' AND ')}`,
                Object.values(whereConditions),
                { table }
            );
            
            return { 
                changes: result.affectedRows, 
                data: updatedRecords 
            };
        } catch (error) {
            console.error('[MariaDBService] Update error:', error, { table, data, whereConditions });
            throw new Error(`Update failed: ${error.message}`);
        }
    }

    /**
     * Delete records from a table
     */
    async delete(table, whereConditions) {
        const whereClause = Object.keys(whereConditions).map(key => `${key} = ?`);
        
        // Get records before deleting for return value
        const recordsToDelete = await this.query(
            `SELECT * FROM ${table} WHERE ${whereClause.join(' AND ')}`,
            Object.values(whereConditions)
        );
        
        const sql = `DELETE FROM ${table} WHERE ${whereClause.join(' AND ')}`;

        try {
            const [result] = await this.pool.execute(sql, Object.values(whereConditions));
            return { changes: result.affectedRows, data: recordsToDelete };
        } catch (error) {
            console.error('[MariaDBService] Delete error:', error, { table, whereConditions });
            throw new Error(`Delete failed: ${error.message}`);
        }
    }

    /**
     * Upsert (INSERT ... ON DUPLICATE KEY UPDATE) a record
     */
    async upsert(table, data, conflictColumns = ['id']) {
        // Encrypt sensitive fields before upserting
        const encryptedData = this.encryptSensitiveFields(table, data);
        
        const columns = Object.keys(encryptedData);
        const values = Object.values(encryptedData);
        const placeholders = columns.map(() => '?');
        
        const updateColumns = columns.filter(col => !conflictColumns.includes(col));
        const updateClause = updateColumns.map(col => `${col} = VALUES(${col})`).join(', ');

        const sql = `
            INSERT INTO ${table} (${columns.join(', ')}) 
            VALUES (${placeholders.join(', ')})
            ON DUPLICATE KEY UPDATE ${updateClause}
        `;

        try {
            const [result] = await this.pool.execute(sql, values);
            
            // For MariaDB, we need to determine if it was insert or update
            let recordId;
            if (result.insertId > 0) {
                recordId = result.insertId;
            } else {
                // It was an update, find the record
                const whereClause = conflictColumns.map(col => `${col} = ?`).join(' AND ');
                const whereValues = conflictColumns.map(col => encryptedData[col]);
                const existingRecord = await this.queryOne(
                    `SELECT id FROM ${table} WHERE ${whereClause}`, 
                    whereValues
                );
                recordId = existingRecord?.id;
            }
            
            if (recordId) {
                const upsertedRecord = await this.queryOne(
                    `SELECT * FROM ${table} WHERE id = ?`, 
                    [recordId], 
                    { table }
                );
                return upsertedRecord;
            }
            
            return null;
        } catch (error) {
            console.error('[MariaDBService] Upsert error:', error, { table, data });
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
        const valuesClause = encryptedRecords.map(() => `(${columns.map(() => '?').join(', ')})`).join(', ');
        const values = encryptedRecords.flatMap(record => Object.values(record));

        const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${valuesClause}`;

        try {
            const [result] = await this.pool.execute(sql, values);
            
            // Get inserted records - MariaDB doesn't support RETURNING, so we approximate
            const firstId = result.insertId;
            const count = result.affectedRows;
            
            if (firstId && count > 0) {
                const insertedRecords = await this.query(
                    `SELECT * FROM ${table} WHERE id >= ? AND id < ? ORDER BY id`,
                    [firstId, firstId + count],
                    { table }
                );
                return insertedRecords;
            }
            
            return [];
        } catch (error) {
            console.error('[MariaDBService] Bulk insert error:', error, { table, count: records.length });
            throw new Error(`Bulk insert failed: ${error.message}`);
        }
    }

    /**
     * Execute multiple queries in a transaction
     */
    async transaction(queries) {
        const connection = await this.pool.getConnection();
        try {
            await connection.beginTransaction();
            
            const results = [];
            for (const { sql, params } of queries) {
                const [result] = await connection.execute(sql, params || []);
                results.push(result);
            }
            
            await connection.commit();
            return results;
        } catch (error) {
            await connection.rollback();
            console.error('[MariaDBService] Transaction error:', error);
            throw new Error(`Transaction failed: ${error.message}`);
        } finally {
            connection.release();
        }
    }

    /**
     * Create a database backup using mysqldump (if available)
     */
    async createBackup(backupPath) {
        const { spawn } = require('child_process');
        
        return new Promise((resolve, reject) => {
            const mysqldump = spawn('mysqldump', [
                '-h', this.config.host,
                '-P', this.config.port,
                '-u', this.config.user,
                `-p${this.config.password}`,
                this.config.database,
                '--result-file', backupPath,
                '--verbose'
            ]);

            mysqldump.on('close', (code) => {
                if (code === 0) {
                    console.log(`[MariaDBService] Backup created successfully: ${backupPath}`);
                    resolve(backupPath);
                } else {
                    reject(new Error(`mysqldump failed with code ${code}`));
                }
            });

            mysqldump.on('error', (error) => {
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
                    TABLE_SCHEMA as schema_name,
                    TABLE_NAME as table_name,
                    TABLE_ROWS as table_rows,
                    DATA_LENGTH as data_length,
                    INDEX_LENGTH as index_length
                FROM information_schema.TABLES 
                WHERE TABLE_SCHEMA = ?
                ORDER BY TABLE_ROWS DESC
            `, [this.config.database]);

            const dbSize = await this.queryOne(`
                SELECT 
                    ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS size_mb
                FROM information_schema.tables 
                WHERE table_schema = ?
            `, [this.config.database]);

            return {
                tables: stats,
                database_size: `${dbSize.size_mb} MB`,
                connections: {
                    total: this.config.connectionLimit,
                    active: this.config.connectionLimit - (this.pool._freeConnections?.length || 0),
                    idle: this.pool._freeConnections?.length || 0
                }
            };
        } catch (error) {
            console.error('[MariaDBService] Failed to get stats:', error);
            return { error: error.message };
        }
    }

    /**
     * Get connection pool status
     */
    getPoolStatus() {
        if (!this.pool) {
            return {
                totalCount: 0,
                idleCount: 0,
                activeCount: 0,
                initialized: this.isInitialized
            };
        }
        
        return {
            totalCount: this.config.connectionLimit || 0,
            idleCount: this.pool._freeConnections?.length || 0,
            activeCount: (this.config.connectionLimit || 0) - (this.pool._freeConnections?.length || 0),
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
            console.log('[MariaDBService] Connection pool closed');
        }
    }
}

// Export singleton instance
let mariadbInstance = null;

export function getMariaDBInstance() {
    if (!mariadbInstance) {
        mariadbInstance = new MariaDBService();
    }
    return mariadbInstance;
}

export { MariaDBService };
export default MariaDBService;