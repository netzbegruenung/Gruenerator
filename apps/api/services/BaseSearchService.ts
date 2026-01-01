/**
 * Re-export from BaseSearchService folder for backward compatibility
 * This allows existing imports like:
 *   import { BaseSearchService } from '../services/BaseSearchService.js'
 * to continue working without modification
 */
export * from './BaseSearchService/index.js';
export { default } from './BaseSearchService/index.js';
