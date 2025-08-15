import { getPostgresInstance } from './PostgresService.js';
import { getMariaDBInstance } from './MariaDBService.js';

/**
 * Database Adapter - Factory pattern for database services
 * Provides a unified interface that can switch between PostgreSQL and MariaDB
 * based on environment configuration
 */
class DatabaseAdapter {
    constructor() {
        this.dbType = process.env.DATABASE_TYPE || 'supabase'; // 'postgres', 'mariadb', or 'supabase'
        this.instance = null;
        this.initialized = false;
    }

    /**
     * Get the appropriate database instance based on configuration
     */
    getInstance() {
        if (this.instance) {
            return this.instance;
        }

        switch (this.dbType.toLowerCase()) {
            case 'postgres':
            case 'postgresql':
                this.instance = getPostgresInstance();
                console.log('[DatabaseAdapter] Using PostgreSQL database');
                break;
                
            case 'mariadb':
            case 'mysql':
                this.instance = getMariaDBInstance();
                console.log('[DatabaseAdapter] Using MariaDB database');
                break;
                
            case 'supabase':
            default:
                // Return null for Supabase - handled by SupabaseCompatLayer
                console.log('[DatabaseAdapter] Using Supabase database (default)');
                return null;
        }

        return this.instance;
    }

    /**
     * Initialize the database service
     */
    async init() {
        if (this.initialized) return;

        const instance = this.getInstance();
        if (instance) {
            await instance.init();
        }
        
        this.initialized = true;
    }

    /**
     * Check if a local database (non-Supabase) is configured
     */
    isLocalDatabase() {
        return this.dbType.toLowerCase() !== 'supabase';
    }

    /**
     * Get the database type
     */
    getDatabaseType() {
        return this.dbType;
    }

    /**
     * Proxy all database methods to the active instance
     */
    async query(sql, params = [], options = {}) {
        const instance = this.getInstance();
        if (!instance) {
            throw new Error('No local database configured. Using Supabase.');
        }
        return await instance.query(sql, params, options);
    }

    async queryOne(sql, params = [], options = {}) {
        const instance = this.getInstance();
        if (!instance) {
            throw new Error('No local database configured. Using Supabase.');
        }
        return await instance.queryOne(sql, params, options);
    }

    async exec(sql, params = []) {
        const instance = this.getInstance();
        if (!instance) {
            throw new Error('No local database configured. Using Supabase.');
        }
        return await instance.exec(sql, params);
    }

    async insert(table, data) {
        const instance = this.getInstance();
        if (!instance) {
            throw new Error('No local database configured. Using Supabase.');
        }
        return await instance.insert(table, data);
    }

    async update(table, data, whereConditions) {
        const instance = this.getInstance();
        if (!instance) {
            throw new Error('No local database configured. Using Supabase.');
        }
        return await instance.update(table, data, whereConditions);
    }

    async delete(table, whereConditions) {
        const instance = this.getInstance();
        if (!instance) {
            throw new Error('No local database configured. Using Supabase.');
        }
        return await instance.delete(table, whereConditions);
    }

    async upsert(table, data, conflictColumns = ['id']) {
        const instance = this.getInstance();
        if (!instance) {
            throw new Error('No local database configured. Using Supabase.');
        }
        return await instance.upsert(table, data, conflictColumns);
    }

    async bulkInsert(table, records) {
        const instance = this.getInstance();
        if (!instance) {
            throw new Error('No local database configured. Using Supabase.');
        }
        return await instance.bulkInsert(table, records);
    }

    async transaction(queries) {
        const instance = this.getInstance();
        if (!instance) {
            throw new Error('No local database configured. Using Supabase.');
        }
        return await instance.transaction(queries);
    }

    async createBackup(backupPath) {
        const instance = this.getInstance();
        if (!instance) {
            throw new Error('No local database configured. Using Supabase.');
        }
        return await instance.createBackup(backupPath);
    }

    async getStats() {
        const instance = this.getInstance();
        if (!instance) {
            throw new Error('No local database configured. Using Supabase.');
        }
        return await instance.getStats();
    }

    getPoolStatus() {
        const instance = this.getInstance();
        if (!instance) {
            return { error: 'No local database configured. Using Supabase.' };
        }
        return instance.getPoolStatus();
    }

    async close() {
        const instance = this.getInstance();
        if (instance) {
            await instance.close();
        }
        this.initialized = false;
    }

    /**
     * Get database-specific information
     */
    getDatabaseInfo() {
        const instance = this.getInstance();
        return {
            type: this.dbType,
            isLocal: this.isLocalDatabase(),
            hasInstance: !!instance,
            initialized: this.initialized,
            poolStatus: instance ? instance.getPoolStatus() : null
        };
    }

    /**
     * Health check for the current database
     */
    async healthCheck() {
        try {
            const instance = this.getInstance();
            if (!instance) {
                return {
                    status: 'healthy',
                    type: 'supabase',
                    message: 'Using Supabase database'
                };
            }

            // Test connection with a simple query
            await instance.ensureInitialized();
            const result = await instance.query('SELECT 1 as test');
            
            return {
                status: 'healthy',
                type: this.dbType,
                message: 'Database connection successful',
                testResult: result
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                type: this.dbType,
                message: error.message,
                error: error
            };
        }
    }
}

// Export singleton instance
let databaseAdapterInstance = null;

export function getDatabaseAdapter() {
    if (!databaseAdapterInstance) {
        databaseAdapterInstance = new DatabaseAdapter();
    }
    return databaseAdapterInstance;
}

export { DatabaseAdapter };
export default DatabaseAdapter;