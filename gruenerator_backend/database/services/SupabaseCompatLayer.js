import { getDatabaseAdapter } from './DatabaseAdapter.js';
import { getQdrantInstance } from './QdrantService.js';
import { NextcloudApiClient } from '../../services/nextcloudApiClient.js';

/**
 * Supabase Compatibility Layer
 * Provides a drop-in replacement for Supabase client API
 * Maps Supabase calls to SQLite/Qdrant/Nextcloud operations
 */

/**
 * Query builder that mimics Supabase's query API
 */
class DatabaseQueryBuilder {
    constructor(table, databaseService) {
        this.table = table;
        this.db = databaseService;
        this.filters = [];
        this.selectColumns = '*';
        this.orderByClause = null;
        this.limitCount = null;
        this.offsetCount = null;
        this.single = false;
    }

    /**
     * Select specific columns
     */
    select(columns = '*') {
        this.selectColumns = columns;
        return this;
    }

    /**
     * Filter by equality
     */
    eq(column, value) {
        this.filters.push({ column, operator: '=', value });
        return this;
    }

    /**
     * Filter by not equal
     */
    neq(column, value) {
        this.filters.push({ column, operator: '!=', value });
        return this;
    }

    /**
     * Filter by greater than
     */
    gt(column, value) {
        this.filters.push({ column, operator: '>', value });
        return this;
    }

    /**
     * Filter by greater than or equal
     */
    gte(column, value) {
        this.filters.push({ column, operator: '>=', value });
        return this;
    }

    /**
     * Filter by less than
     */
    lt(column, value) {
        this.filters.push({ column, operator: '<', value });
        return this;
    }

    /**
     * Filter by less than or equal
     */
    lte(column, value) {
        this.filters.push({ column, operator: '<=', value });
        return this;
    }

    /**
     * Filter by LIKE pattern
     */
    like(column, pattern) {
        this.filters.push({ column, operator: 'LIKE', value: pattern });
        return this;
    }

    /**
     * Filter by case-insensitive LIKE pattern
     */
    ilike(column, pattern) {
        this.filters.push({ column, operator: 'LIKE', value: pattern, caseInsensitive: true });
        return this;
    }

    /**
     * Filter by IN array
     */
    in(column, values) {
        this.filters.push({ column, operator: 'IN', value: values, isArray: true });
        return this;
    }

    /**
     * Filter by NOT IN array
     */
    not(column, values) {
        if (Array.isArray(values)) {
            this.filters.push({ column, operator: 'NOT IN', value: values, isArray: true });
        } else {
            this.filters.push({ column, operator: '!=', value: values });
        }
        return this;
    }

    /**
     * Filter by IS NULL
     */
    is(column, value) {
        if (value === null) {
            this.filters.push({ column, operator: 'IS NULL', value: null, noValue: true });
        } else {
            this.filters.push({ column, operator: '=', value });
        }
        return this;
    }

    /**
     * Order by column
     */
    order(column, { ascending = true } = {}) {
        this.orderByClause = `${column} ${ascending ? 'ASC' : 'DESC'}`;
        return this;
    }

    /**
     * Limit results
     */
    limit(count) {
        this.limitCount = count;
        return this;
    }

    /**
     * Offset results
     */
    range(from, to) {
        this.offsetCount = from;
        this.limitCount = to - from + 1;
        return this;
    }

    /**
     * Return only a single result
     */
    single() {
        this.single = true;
        this.limitCount = 1;
        return this;
    }

    /**
     * Insert data
     */
    insert(data) {
        return new PostgresInsertBuilder(this.table, this.db, data);
    }

    /**
     * Update data
     */
    update(data) {
        return new PostgresUpdateBuilder(this.table, this.db, data, this.filters);
    }

    /**
     * Delete data
     */
    delete() {
        return new PostgresDeleteBuilder(this.table, this.db, this.filters);
    }

    /**
     * Upsert data
     */
    upsert(data) {
        return new PostgresUpsertBuilder(this.table, this.db, data);
    }

    /**
     * Execute the query and return results
     */
    async then(resolve, reject) {
        try {
            const sql = this.buildSelectSQL();
            const params = this.buildParams();
            
            const result = this.single 
                ? await this.db.queryOne(sql, params, { table: this.table })
                : await this.db.query(sql, params, { table: this.table });

            resolve({ data: result, error: null });
        } catch (error) {
            console.error('[DatabaseQueryBuilder] Query execution failed:', error);
            reject({ data: null, error: { message: error.message, details: error } });
        }
    }

    /**
     * Build SELECT SQL
     */
    buildSelectSQL() {
        let sql = `SELECT ${this.selectColumns} FROM ${this.table}`;
        
        if (this.filters.length > 0) {
            const whereClause = this.buildWhereClause();
            sql += ` WHERE ${whereClause}`;
        }
        
        if (this.orderByClause) {
            sql += ` ORDER BY ${this.orderByClause}`;
        }
        
        if (this.limitCount) {
            sql += ` LIMIT ${this.limitCount}`;
        }
        
        if (this.offsetCount) {
            sql += ` OFFSET ${this.offsetCount}`;
        }
        
        return sql;
    }

    /**
     * Build WHERE clause
     */
    buildWhereClause() {
        let paramIndex = 1;
        return this.filters.map(filter => {
            if (filter.noValue) {
                return `${filter.column} ${filter.operator}`;
            } else if (filter.isArray) {
                const placeholders = filter.value.map(() => `$${paramIndex++}`).join(', ');
                return `${filter.column} ${filter.operator} (${placeholders})`;
            } else if (filter.caseInsensitive) {
                const placeholder = `$${paramIndex++}`;
                return `LOWER(${filter.column}) ${filter.operator} LOWER(${placeholder})`;
            } else {
                return `${filter.column} ${filter.operator} $${paramIndex++}`;
            }
        }).join(' AND ');
    }

    /**
     * Build parameters array
     */
    buildParams() {
        const params = [];
        for (const filter of this.filters) {
            if (!filter.noValue) {
                if (filter.isArray) {
                    params.push(...filter.value);
                } else {
                    params.push(filter.value);
                }
            }
        }
        return params;
    }
}

/**
 * Insert builder
 */
class PostgresInsertBuilder {
    constructor(table, db, data) {
        this.table = table;
        this.db = db;
        this.data = Array.isArray(data) ? data : [data];
        this.shouldSelect = false;
    }

    select(columns = '*') {
        this.shouldSelect = columns;
        return this;
    }

    single() {
        return this;
    }

    async then(resolve, reject) {
        try {
            if (this.data.length === 1) {
                const result = await this.db.insert(this.table, this.data[0]);
                resolve({ data: result, error: null });
            } else {
                const result = await this.db.bulkInsert(this.table, this.data);
                resolve({ data: result, error: null });
            }
        } catch (error) {
            console.error('[PostgresInsertBuilder] Insert failed:', error);
            reject({ data: null, error: { message: error.message, details: error } });
        }
    }
}

/**
 * Update builder
 */
class PostgresUpdateBuilder {
    constructor(table, db, data, filters) {
        this.table = table;
        this.db = db;
        this.data = data;
        this.filters = filters;
        this.shouldSelect = false;
    }

    eq(column, value) {
        this.filters.push({ column, operator: '=', value });
        return this;
    }

    select(columns = '*') {
        this.shouldSelect = columns;
        return this;
    }

    single() {
        return this;
    }

    async then(resolve, reject) {
        try {
            const whereConditions = {};
            this.filters.forEach(filter => {
                if (filter.operator === '=') {
                    whereConditions[filter.column] = filter.value;
                }
            });

            const result = await this.db.update(this.table, this.data, whereConditions);
            resolve({ data: result, error: null });
        } catch (error) {
            console.error('[PostgresUpdateBuilder] Update failed:', error);
            reject({ data: null, error: { message: error.message, details: error } });
        }
    }
}

/**
 * Delete builder
 */
class PostgresDeleteBuilder {
    constructor(table, db, filters) {
        this.table = table;
        this.db = db;
        this.filters = filters;
        this.shouldSelect = false;
    }

    eq(column, value) {
        this.filters.push({ column, operator: '=', value });
        return this;
    }

    in(column, values) {
        this.filters.push({ column, operator: 'IN', value: values, isArray: true });
        return this;
    }

    select(columns = '*') {
        this.shouldSelect = columns;
        return this;
    }

    async then(resolve, reject) {
        try {
            const whereConditions = {};
            
            // Handle simple equality filters
            this.filters.forEach(filter => {
                if (filter.operator === '=' && !filter.isArray) {
                    whereConditions[filter.column] = filter.value;
                } else if (filter.operator === 'IN' && filter.isArray) {
                    // For IN queries, we need to run multiple deletes or use raw SQL
                    // For now, convert to multiple single deletes
                    filter.value.forEach(async (val) => {
                        await this.db.delete(this.table, { [filter.column]: val });
                    });
                    return;
                }
            });

            if (Object.keys(whereConditions).length > 0) {
                const result = await this.db.delete(this.table, whereConditions);
                resolve({ data: result, error: null });
            } else {
                resolve({ data: { changes: 0 }, error: null });
            }
        } catch (error) {
            console.error('[PostgresDeleteBuilder] Delete failed:', error);
            reject({ data: null, error: { message: error.message, details: error } });
        }
    }
}

/**
 * Upsert builder
 */
class PostgresUpsertBuilder {
    constructor(table, db, data) {
        this.table = table;
        this.db = db;
        this.data = Array.isArray(data) ? data : [data];
        this.shouldSelect = false;
    }

    select(columns = '*') {
        this.shouldSelect = columns;
        return this;
    }

    single() {
        return this;
    }

    async then(resolve, reject) {
        try {
            if (this.data.length === 1) {
                const result = await this.db.upsert(this.table, this.data[0]);
                resolve({ data: result, error: null });
            } else {
                // For multiple upserts, do them one by one
                const results = await Promise.all(
                    this.data.map(item => this.db.upsert(this.table, item))
                );
                resolve({ data: results, error: null });
            }
        } catch (error) {
            console.error('[PostgresUpsertBuilder] Upsert failed:', error);
            reject({ data: null, error: { message: error.message, details: error } });
        }
    }
}

/**
 * Storage adapter that uses Nextcloud
 */
class NextcloudStorageAdapter {
    constructor() {
        this.defaultShareLink = process.env.NEXTCLOUD_SHARE_LINK;
        this.client = null;
        if (this.defaultShareLink) {
            try {
                this.client = new NextcloudApiClient(this.defaultShareLink);
            } catch (error) {
                console.warn('[NextcloudStorageAdapter] Failed to initialize default client:', error);
            }
        }
    }

    from(bucket) {
        return {
            upload: async (path, file, options = {}) => {
                try {
                    if (!this.client) {
                        throw new Error('Nextcloud client not configured');
                    }
                    
                    // Upload to Nextcloud
                    const result = await this.client.uploadFile(path, file, options);
                    
                    return { data: result, error: null };
                } catch (error) {
                    console.error('[NextcloudStorageAdapter] Upload failed:', error);
                    return { data: null, error: { message: error.message } };
                }
            },

            download: async (path) => {
                try {
                    if (!this.client) {
                        throw new Error('Nextcloud client not configured');
                    }
                    
                    const result = await this.client.downloadFile(path);
                    return { data: result, error: null };
                } catch (error) {
                    console.error('[NextcloudStorageAdapter] Download failed:', error);
                    return { data: null, error: { message: error.message } };
                }
            },

            remove: async (paths) => {
                try {
                    if (!this.client) {
                        throw new Error('Nextcloud client not configured');
                    }
                    
                    const pathList = Array.isArray(paths) ? paths : [paths];
                    const results = await Promise.all(
                        pathList.map(path => this.client.deleteFile(path))
                    );
                    
                    return { data: results, error: null };
                } catch (error) {
                    console.error('[NextcloudStorageAdapter] Remove failed:', error);
                    return { data: null, error: { message: error.message } };
                }
            },

            list: async (path, options = {}) => {
                try {
                    if (!this.client) {
                        throw new Error('Nextcloud client not configured');
                    }
                    
                    const result = await this.client.listFiles(path, options);
                    return { data: result, error: null };
                } catch (error) {
                    console.error('[NextcloudStorageAdapter] List failed:', error);
                    return { data: null, error: { message: error.message } };
                }
            }
        };
    }
}

/**
 * Auth adapter that handles user management
 */
class AuthAdapter {
    constructor(databaseAdapter) {
        this.db = databaseAdapter;
    }

    get admin() {
        return {
            getUserById: async (userId) => {
                try {
                    const user = await this.db.queryOne('SELECT * FROM profiles WHERE id = $1', [userId]);
                    return { 
                        data: { 
                            user: user ? {
                                ...user,
                                email: user.email,
                                email_verified: !!user.email,
                                user_metadata: {},
                                app_metadata: {}
                            } : null 
                        }, 
                        error: null 
                    };
                } catch (error) {
                    return { data: null, error: { message: error.message } };
                }
            },

            updateUserById: async (userId, updates) => {
                try {
                    if (updates.email) {
                        await this.db.update('profiles', { email: updates.email }, { id: userId });
                    }
                    
                    const user = await this.db.queryOne('SELECT * FROM profiles WHERE id = $1', [userId]);
                    return { data: { user }, error: null };
                } catch (error) {
                    return { data: null, error: { message: error.message } };
                }
            },

            deleteUser: async (userId) => {
                try {
                    const result = await this.db.delete('profiles', { id: userId });
                    
                    // Also clean up from Qdrant
                    const qdrant = getQdrantInstance();
                    if (qdrant.isAvailable()) {
                        try {
                            await qdrant.deleteUserVectors(userId);
                        } catch (qdrantError) {
                            console.warn('[AuthAdapter] Failed to delete user vectors:', qdrantError);
                        }
                    }
                    
                    return { data: result, error: null };
                } catch (error) {
                    return { data: null, error: { message: error.message } };
                }
            }
        };
    }
}

/**
 * RPC function adapter
 */
class RPCAdapter {
    constructor(databaseAdapter) {
        this.db = databaseAdapter;
    }

    async rpc(functionName, params = {}) {
        try {
            // Handle specific RPC functions that were used in the original code
            switch (functionName) {
                case 'get_embedding_stats':
                    return this.getEmbeddingStats(params);
                default:
                    throw new Error(`RPC function ${functionName} not implemented`);
            }
        } catch (error) {
            return { data: null, error: { message: error.message } };
        }
    }

    async getEmbeddingStats(params) {
        try {
            const { user_id_filter } = params;
            
            // Get document count for user
            const docCount = await this.db.queryOne(
                'SELECT COUNT(*) as total_documents FROM documents WHERE user_id = $1 AND status = $2',
                [user_id_filter, 'completed']
            );

            // For now, return basic stats since we moved embeddings to Qdrant
            const stats = {
                total_documents: docCount?.total_documents || 0,
                documents_with_embeddings: docCount?.total_documents || 0,
                total_chunks: 0,
                avg_chunks_per_document: 0
            };

            // Try to get Qdrant stats if available
            const qdrant = getQdrantInstance();
            if (qdrant.isAvailable()) {
                try {
                    const qdrantStats = await qdrant.getCollectionStats();
                    stats.total_chunks = qdrantStats.vectors_count || 0;
                    stats.avg_chunks_per_document = stats.total_documents > 0 
                        ? Math.round(stats.total_chunks / stats.total_documents) 
                        : 0;
                } catch (qdrantError) {
                    console.warn('[RPCAdapter] Failed to get Qdrant stats:', qdrantError);
                }
            }

            return { data: [stats], error: null };
        } catch (error) {
            return { data: null, error: { message: error.message } };
        }
    }
}

/**
 * Main compatibility service that replaces supabaseService
 */
class SupabaseCompatibilityService {
    constructor() {
        this.databaseAdapter = getDatabaseAdapter();
        this.storage = new NextcloudStorageAdapter();
        this.auth = new AuthAdapter(this.databaseAdapter);
        this.rpcAdapter = new RPCAdapter(this.databaseAdapter);
    }

    /**
     * Main query interface - mimics supabase.from(table)
     */
    from(table) {
        return new DatabaseQueryBuilder(table, this.databaseAdapter);
    }

    /**
     * RPC function calls
     */
    async rpc(functionName, params = {}) {
        return this.rpcAdapter.rpc(functionName, params);
    }

    /**
     * Get service health
     */
    getHealth() {
        return {
            database: this.databaseAdapter.initialized,
            qdrant: getQdrantInstance().isAvailable(),
            nextcloud: !!this.storage.client
        };
    }
}

// Export singleton instance
let compatInstance = null;

export function getSupabaseCompatService() {
    if (!compatInstance) {
        compatInstance = new SupabaseCompatibilityService();
    }
    return compatInstance;
}

export { SupabaseCompatibilityService };
export default SupabaseCompatibilityService;