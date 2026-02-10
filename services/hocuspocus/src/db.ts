import pkg from 'pg';
const { Pool } = pkg;

import { createLogger } from './logger.js';

import type { DbQueryFn } from './types.js';

const log = createLogger('DB');

export function createPool(): InstanceType<typeof Pool> {
  const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    database: process.env.POSTGRES_DB || 'gruenerator',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  pool.on('error', (err) => {
    log.error(`Unexpected pool error: ${err.message}`);
  });

  return pool;
}

export function wrapPoolAsQueryFn(pool: InstanceType<typeof Pool>): DbQueryFn {
  return async (sql: string, params?: unknown[]): Promise<Record<string, unknown>[]> => {
    const result = await pool.query(sql, params);
    return result.rows as Record<string, unknown>[];
  };
}
