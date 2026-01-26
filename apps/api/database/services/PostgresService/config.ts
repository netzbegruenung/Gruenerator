/**
 * PostgreSQL configuration loading and validation
 */

import type { PostgresConfig, SafeConfigForLog } from './types.js';

/**
 * Load PostgreSQL configuration from environment variables
 */
export function loadConfig(customConfig: PostgresConfig | null = null): PostgresConfig {
  if (customConfig) {
    return customConfig;
  }

  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      ssl:
        process.env.POSTGRES_SSL === 'true'
          ? {
              rejectUnauthorized: process.env.POSTGRES_SSL_REJECT_UNAUTHORIZED !== 'false',
            }
          : false,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    };
  }

  const host = process.env.POSTGRES_HOST || process.env.PGHOST || 'localhost';
  const port = parseInt(process.env.POSTGRES_PORT || process.env.PGPORT || '5432', 10);
  const user = process.env.POSTGRES_USER || process.env.PGUSER || 'gruenerator';
  const passwordRaw =
    process.env.POSTGRES_PASSWORD !== undefined
      ? process.env.POSTGRES_PASSWORD
      : process.env.PGPASSWORD !== undefined
        ? process.env.PGPASSWORD
        : '';
  const password = typeof passwordRaw === 'string' ? passwordRaw : String(passwordRaw);
  const database = process.env.POSTGRES_DATABASE || process.env.PGDATABASE || 'gruenerator';
  const ssl =
    process.env.POSTGRES_SSL === 'true'
      ? {
          rejectUnauthorized: process.env.POSTGRES_SSL_REJECT_UNAUTHORIZED !== 'false',
        }
      : false;

  return {
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

/**
 * Get a safe version of config for logging (no passwords)
 */
export function getSafeConfigForLog(config: PostgresConfig): SafeConfigForLog {
  if (config?.connectionString) {
    return {
      mode: 'connection_string',
      ssl: !!config.ssl,
    };
  }
  return {
    host: config?.host,
    port: config?.port,
    user: config?.user,
    database: config?.database,
    ssl: !!config?.ssl,
    autoCreateDb: process.env.POSTGRES_AUTO_CREATE_DB !== 'false',
  };
}
