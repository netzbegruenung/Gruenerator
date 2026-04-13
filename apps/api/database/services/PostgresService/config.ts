/**
 * PostgreSQL configuration loading and validation
 */

import { env } from '../../../config/env.js';

import type { PostgresConfig, SafeConfigForLog } from './types.js';

/**
 * Load PostgreSQL configuration from environment variables
 */
export function loadConfig(customConfig: PostgresConfig | null = null): PostgresConfig {
  if (customConfig) {
    return customConfig;
  }

  if (env.DATABASE_URL != null) {
    return {
      connectionString: env.DATABASE_URL,
      ssl: env.POSTGRES_SSL ? { rejectUnauthorized: env.POSTGRES_SSL_REJECT_UNAUTHORIZED } : false,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    };
  }

  const host = env.POSTGRES_HOST ?? env.PGHOST ?? 'localhost';
  const port = env.POSTGRES_PORT || env.PGPORT || 5432;
  const user = env.POSTGRES_USER ?? env.PGUSER ?? 'gruenerator';
  const password = env.POSTGRES_PASSWORD ?? env.PGPASSWORD ?? '';
  const database = env.POSTGRES_DATABASE ?? env.PGDATABASE ?? 'gruenerator';
  const ssl = env.POSTGRES_SSL
    ? { rejectUnauthorized: env.POSTGRES_SSL_REJECT_UNAUTHORIZED }
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
    autoCreateDb: env.POSTGRES_AUTO_CREATE_DB,
  };
}
