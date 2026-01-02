/**
 * QdrantService Utility Functions
 * Re-exports hash utilities from the central hashUtils module
 *
 * NOTE: This file re-exports from utils/hashUtils.ts which is the
 * single source of truth for all hash functions in the codebase.
 */

export {
    stringToNumericHash as stringToNumericId,
    chunkToNumericId
} from '../../../utils/validation/index.js';
