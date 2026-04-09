/**
 * TypeScript type definitions for PostgresService
 */

import type { Pool, PoolClient, PoolConfig } from 'pg';

export interface PostgresConfig extends PoolConfig {
  connectionString?: string | undefined;
  host?: string | undefined;
  port?: number | undefined;
  user?: string | undefined;
  password?: string | undefined;
  database?: string | undefined;
  ssl?: boolean | { rejectUnauthorized: boolean };
  max?: number | undefined;
  idleTimeoutMillis?: number | undefined;
  connectionTimeoutMillis?: number | undefined;
}

export interface SafeConfigForLog {
  mode?: string | undefined;
  host?: string | undefined;
  port?: number | undefined;
  user?: string | undefined;
  database?: string | undefined;
  ssl: boolean;
  autoCreateDb?: boolean | undefined;
}

export interface HealthStatus {
  isHealthy: boolean;
  isInitialized: boolean;
  status: 'initializing' | 'connecting' | 'healthy' | 'error';
  lastError: string | null;
  pool: PoolStatus | null;
}

export interface PoolStatus {
  totalCount: number;
  idleCount: number;
  waitingCount: number;
  initialized?: boolean | undefined;
}

export interface ColumnDefinition {
  name: string;
  type: string;
  constraints?: string | undefined;
  nullable?: boolean | undefined;
  default?: string | null | undefined;
}

export interface SchemaCache {
  [tableName: string]: ColumnDefinition[];
}

export interface ExecResult {
  changes: number;
  lastID?: string | number | undefined;
}

export interface UpdateResult {
  changes: number;
  data: Record<string, unknown>[];
}

export interface DeleteResult {
  changes: number;
  data: Record<string, unknown>[];
}

export interface AlterStatement {
  table: string;
  column: string;
  statement: string;
}

export interface TransactionQuery {
  sql: string;
  params?: unknown[] | undefined;
}

export interface DatabaseStats {
  tables: TableStat[];
  database_size: string;
  connections: PoolStatus;
  error?: string | undefined;
}

export interface TableStat {
  schemaname: string;
  tablename: string;
  inserts: number;
  updates: number;
  deletes: number;
  live_tuples: number;
  dead_tuples: number;
}

export interface RouteUsageStat {
  route_pattern: string;
  method: string;
  request_count: number;
  last_accessed: Date;
  created_at: Date;
}

export interface QueryOptions {
  table?: string | undefined;
}

export type TransactionCallback<T> = (client: PoolClient) => Promise<T>;

export type { Pool, PoolClient };
