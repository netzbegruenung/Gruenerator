/**
 * SharepicImageManager - Temporary image storage for sharepic generation
 *
 * Handles temporary storage of images uploaded specifically for sharepic generation.
 * Images are stored with short TTL and automatically deleted after use to prevent
 * unwanted reuse across different sharepic requests.
 */

import crypto from 'crypto';

class SharepicImageManager {
  constructor(redisClient) {
    this.redis = redisClient;
    this.activeSessions = new Map();
    this.defaultTTL = 120; // 2 minutes fallback TTL
  }

  /**
   * Store an image temporarily for a specific sharepic request
   * @param {string} requestId - Unique request identifier
   * @param {string} userId - User ID for tracking
   * @param {Object} imageAttachment - Image attachment object
   * @returns {string} Storage key for the image
   */
  async storeForRequest(requestId, userId, imageAttachment) {
    const key = `sharepic:${requestId}:img`;

    console.log(`[SharepicImageManager] Storing image for request ${requestId}`);

    // Store with short TTL as fallback cleanup
    await this.redis.setEx(key, this.defaultTTL, JSON.stringify(imageAttachment));

    // Track active session for monitoring and cleanup
    this.activeSessions.set(requestId, {
      userId,
      timestamp: Date.now(),
      key,
      imageName: imageAttachment.name || 'unknown'
    });

    console.log(`[SharepicImageManager] Image stored with key: ${key}, TTL: ${this.defaultTTL}s`);
    return key;
  }

  /**
   * Retrieve and immediately delete an image (consume pattern)
   * @param {string} requestId - Request identifier
   * @returns {Object|null} Image attachment or null if not found
   */
  async retrieveAndConsume(requestId) {
    const key = `sharepic:${requestId}:img`;

    console.log(`[SharepicImageManager] Retrieving and consuming image for request ${requestId}`);

    // Get the image data
    const data = await this.redis.get(key);

    if (data) {
      // Immediate deletion after retrieval to prevent reuse
      await this.redis.del(key);
      this.activeSessions.delete(requestId);

      const imageAttachment = JSON.parse(data);
      console.log(`[SharepicImageManager] Image consumed: ${imageAttachment.name || 'unknown'}`);

      return imageAttachment;
    } else {
      console.log(`[SharepicImageManager] No image found for request ${requestId}`);
      this.activeSessions.delete(requestId);
      return null;
    }
  }

  /**
   * Check if an image exists for a request without consuming it
   * @param {string} requestId - Request identifier
   * @returns {boolean} True if image exists
   */
  async hasImageForRequest(requestId) {
    const key = `sharepic:${requestId}:img`;
    const exists = await this.redis.exists(key);
    return exists === 1;
  }

  /**
   * Manually delete an image for a request (cleanup without retrieval)
   * @param {string} requestId - Request identifier
   * @returns {boolean} True if image was deleted
   */
  async deleteImageForRequest(requestId) {
    const key = `sharepic:${requestId}:img`;

    console.log(`[SharepicImageManager] Manually deleting image for request ${requestId}`);

    const deleted = await this.redis.del(key);
    this.activeSessions.delete(requestId);

    return deleted > 0;
  }

  /**
   * Get statistics about active image sessions
   * @returns {Object} Statistics object
   */
  getStats() {
    const now = Date.now();
    const sessions = Array.from(this.activeSessions.values());

    return {
      totalActiveSessions: sessions.length,
      oldestSession: sessions.length > 0 ? Math.min(...sessions.map(s => s.timestamp)) : null,
      sessionsOlderThan1Min: sessions.filter(s => now - s.timestamp > 60000).length,
      sessionsOlderThan2Min: sessions.filter(s => now - s.timestamp > 120000).length
    };
  }

  /**
   * Cleanup expired sessions (optional, TTL handles automatic cleanup)
   * This can be called periodically for monitoring and cleanup of tracking data
   */
  async cleanupExpiredSessions() {
    const now = Date.now();
    let cleanedCount = 0;

    console.log('[SharepicImageManager] Starting cleanup of expired sessions...');

    for (const [requestId, session] of this.activeSessions) {
      const age = now - session.timestamp;

      // Clean up sessions older than TTL
      if (age > this.defaultTTL * 1000) {
        // Check if key still exists in Redis
        const exists = await this.redis.exists(session.key);

        if (exists) {
          // Key still exists, delete it
          await this.redis.del(session.key);
          console.log(`[SharepicImageManager] Cleaned up orphaned session: ${requestId} (age: ${Math.round(age / 1000)}s)`);
        }

        // Remove from tracking
        this.activeSessions.delete(requestId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`[SharepicImageManager] Cleanup completed: ${cleanedCount} expired sessions removed`);
    }

    return cleanedCount;
  }

  /**
   * Clear all active sessions (for testing or emergency cleanup)
   */
  async clearAllSessions() {
    console.log('[SharepicImageManager] Clearing all active sessions...');

    let deletedCount = 0;
    for (const [requestId, session] of this.activeSessions) {
      const deleted = await this.redis.del(session.key);
      if (deleted > 0) deletedCount++;
    }

    this.activeSessions.clear();

    console.log(`[SharepicImageManager] All sessions cleared: ${deletedCount} images deleted`);
    return deletedCount;
  }
}

export default SharepicImageManager;