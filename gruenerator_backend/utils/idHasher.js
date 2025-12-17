/**
 * String to Numeric ID Hash Utility
 * Converts string IDs to numeric IDs for Qdrant vector database
 * Uses djb2-style hash algorithm
 */

/**
 * Convert a string to a numeric ID using djb2 hash algorithm
 * @param {string} str - String to hash
 * @returns {number} Positive numeric hash
 */
export function stringToNumericId(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
}

/**
 * Generate a numeric ID from document ID and chunk index
 * @param {string} documentId - Document identifier
 * @param {number} index - Chunk index
 * @returns {number} Positive numeric hash
 */
export function chunkToNumericId(documentId, index) {
    return stringToNumericId(`${documentId}_${index}`);
}

export default { stringToNumericId, chunkToNumericId };
