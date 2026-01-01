/**
 * FastEmbedService - Backward Compatibility Wrapper
 *
 * Re-exports from ./FastEmbedService/ folder module.
 * This allows existing imports to continue working:
 *
 * import { fastEmbedService } from '../services/FastEmbedService.js'
 * import { FastEmbedService } from '../services/FastEmbedService.js'
 *
 * Both the folder path and root-level path will work identically.
 */

export * from './FastEmbedService/index.js';
export { default } from './FastEmbedService/index.js';
