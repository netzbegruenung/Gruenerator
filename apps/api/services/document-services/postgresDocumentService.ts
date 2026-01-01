/**
 * postgresDocumentService - Backward Compatibility Wrapper
 *
 * Re-exports from ./PostgresDocumentService/ folder module.
 * This allows existing imports to continue working:
 *
 * import { getPostgresDocumentService } from '../services/postgresDocumentService.js'
 * import { PostgresDocumentService } from '../services/postgresDocumentService.js'
 */

export * from './PostgresDocumentService/index.js';
export { default } from './PostgresDocumentService/index.js';
