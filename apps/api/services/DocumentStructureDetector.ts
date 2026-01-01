/**
 * DocumentStructureDetector - Backward Compatibility Wrapper
 *
 * Re-exports from ./DocumentStructureDetector/ folder module.
 * This allows existing imports to continue working:
 *
 * import { documentStructureDetector } from '../services/documentStructureDetector.js'
 * import { DocumentStructureDetector } from '../services/documentStructureDetector.js'
 *
 * Both the folder path and root-level path will work identically.
 */

export * from './DocumentStructureDetector/index.js';
export { default } from './DocumentStructureDetector/index.js';
