/**
 * DocumentSearchService - Backward Compatibility Wrapper
 *
 * Re-exports from ./DocumentSearchService/ folder module.
 * This allows existing imports to continue working:
 *
 * import { DocumentSearchService } from '../services/DocumentSearchService.js'
 *
 * Both the folder path and root-level path will work identically.
 */

export * from './DocumentSearchService/index.js';
export { default } from './DocumentSearchService/index.js';
