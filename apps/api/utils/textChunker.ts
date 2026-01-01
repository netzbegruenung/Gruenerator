/**
 * textChunker - Backward Compatibility Wrapper
 *
 * Re-exports from ./TextChunker/ folder module.
 * This allows existing imports to continue working:
 *
 * import { smartChunkDocument } from './textChunker.js'
 * import { estimateTokens } from './textChunker.js'
 *
 * Both the folder path and root-level path will work identically.
 */

export * from './TextChunker/index.js';
