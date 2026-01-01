/**
 * Re-export from PostgresService folder for backward compatibility
 * This allows existing imports like:
 *   import { getPostgresInstance } from '../database/services/PostgresService.js'
 * to continue working without modification
 */
export * from './PostgresService/index.js';
export { default } from './PostgresService/index.js';
