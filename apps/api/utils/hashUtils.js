import crypto from 'crypto';

/**
 * Hash utilities for consistent ID generation
 */

/**
 * Generate a numeric hash from a string (for Qdrant point IDs)
 * @param {string} str - Input string to hash
 * @returns {number} - Positive integer hash
 */
export function stringToNumericHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
}

/**
 * Generate MD5 hash for content change detection
 * @param {string} content - Content to hash
 * @returns {string} - MD5 hex string
 */
export function generateContentHash(content) {
    return crypto.createHash('md5').update(content.trim()).digest('hex');
}

/**
 * Generate a combined point ID for Qdrant from multiple components
 * @param {string} prefix - ID prefix
 * @param {string|number} id - Primary ID
 * @param {number} index - Index or sequence number
 * @returns {number} - Numeric hash suitable for Qdrant
 */
export function generatePointId(prefix, id, index = 0) {
    const combined = `${prefix}_${id}_${index}`;
    return stringToNumericHash(combined);
}

export default {
    stringToNumericHash,
    generateContentHash,
    generatePointId
};