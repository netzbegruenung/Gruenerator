/**
 * PostgresService - Backward compatible exports
 *
 * All existing imports will continue to work:
 * - import { getPostgresInstance } from '../database/services/PostgresService.js'
 * - import { PostgresService } from '../database/services/PostgresService.js'
 * - import PostgresService from '../database/services/PostgresService.js'
 */

export { PostgresService, getPostgresInstance } from './PostgresService.js';

export type {
  PostgresConfig,
  SafeConfigForLog,
  HealthStatus,
  PoolStatus,
  ColumnDefinition,
  SchemaCache,
  ExecResult,
  UpdateResult,
  DeleteResult,
  AlterStatement,
  TransactionQuery,
  DatabaseStats,
  TableStat,
  RouteUsageStat,
  QueryOptions,
  TransactionCallback,
  Pool,
  PoolClient
} from './types.js';

export { loadConfig, getSafeConfigForLog } from './config.js';

export {
  parseSchemaFile,
  getSchemaPath,
  getMigrationsPath,
  loadSchemaCache,
  validateTableName,
  validateColumnNames,
  generateAlterStatements,
  sanitizeBackupPath
} from './schema.js';

export { runMigrations, createDatabaseIfNotExists } from './migrations.js';

export {
  buildInsertQuery,
  buildUpdateQuery,
  buildDeleteQuery,
  buildUpsertQuery,
  buildBulkInsertQuery,
  transactionQuery,
  transactionQueryOne,
  transactionExec
} from './queries.js';

import { PostgresService } from './PostgresService.js';
export default PostgresService;
