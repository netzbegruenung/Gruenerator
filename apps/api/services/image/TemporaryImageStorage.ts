/**
 * TemporaryImageStorage - Temporary image storage for sharepic generation
 *
 * Handles temporary storage of images uploaded specifically for sharepic generation.
 * Images are stored with short TTL and automatically deleted after use to prevent
 * unwanted reuse across different sharepic requests.
 */

import type {
  ImageAttachment,
  ImageStorageSession,
  ImageStorageStats
} from './types.js';

interface RedisClient {
  setEx(key: string, seconds: number, value: string): Promise<string>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<number>;
  exists(key: string): Promise<number>;
}

class TemporaryImageStorage {
  private redis: RedisClient;
  private activeSessions: Map<string, ImageStorageSession>;
  private readonly defaultTTL: number = 120;

  constructor(redisClient: RedisClient) {
    this.redis = redisClient;
    this.activeSessions = new Map();
  }

  /**
   * Store an image temporarily for a specific sharepic request
   * @param requestId - Unique request identifier
   * @param userId - User ID for tracking
   * @param imageAttachment - Image attachment object
   * @returns Storage key for the image
   */
  async storeForRequest(
    requestId: string,
    userId: string,
    imageAttachment: ImageAttachment
  ): Promise<string> {
    const key = `sharepic:${requestId}:img`;

    console.log(`[TemporaryImageStorage] Storing image for request ${requestId}`);

    await this.redis.setEx(key, this.defaultTTL, JSON.stringify(imageAttachment));

    this.activeSessions.set(requestId, {
      userId,
      timestamp: Date.now(),
      key,
      imageName: imageAttachment.name || 'unknown'
    });

    console.log(`[TemporaryImageStorage] Image stored with key: ${key}, TTL: ${this.defaultTTL}s`);
    return key;
  }

  /**
   * Retrieve and immediately delete an image (consume pattern)
   * @param requestId - Request identifier
   * @returns Image attachment or null if not found
   */
  async retrieveAndConsume(requestId: string): Promise<ImageAttachment | null> {
    const key = `sharepic:${requestId}:img`;

    console.log(`[TemporaryImageStorage] Retrieving and consuming image for request ${requestId}`);

    const data = await this.redis.get(key);

    if (data) {
      await this.redis.del(key);
      this.activeSessions.delete(requestId);

      const imageAttachment = JSON.parse(data) as ImageAttachment;
      console.log(`[TemporaryImageStorage] Image consumed: ${imageAttachment.name || 'unknown'}`);

      return imageAttachment;
    } else {
      console.log(`[TemporaryImageStorage] No image found for request ${requestId}`);
      this.activeSessions.delete(requestId);
      return null;
    }
  }

  /**
   * Check if an image exists for a request without consuming it
   * @param requestId - Request identifier
   * @returns True if image exists
   */
  async hasImageForRequest(requestId: string): Promise<boolean> {
    const key = `sharepic:${requestId}:img`;
    const exists = await this.redis.exists(key);
    return exists === 1;
  }

  /**
   * Manually delete an image for a request (cleanup without retrieval)
   * @param requestId - Request identifier
   * @returns True if image was deleted
   */
  async deleteImageForRequest(requestId: string): Promise<boolean> {
    const key = `sharepic:${requestId}:img`;

    console.log(`[TemporaryImageStorage] Manually deleting image for request ${requestId}`);

    const deleted = await this.redis.del(key);
    this.activeSessions.delete(requestId);

    return deleted > 0;
  }

  /**
   * Get statistics about active image sessions
   * @returns Statistics object
   */
  getStats(): ImageStorageStats {
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
  async cleanupExpiredSessions(): Promise<number> {
    const now = Date.now();
    let cleanedCount = 0;

    console.log('[TemporaryImageStorage] Starting cleanup of expired sessions...');

    for (const [requestId, session] of this.activeSessions) {
      const age = now - session.timestamp;

      if (age > this.defaultTTL * 1000) {
        const exists = await this.redis.exists(session.key);

        if (exists) {
          await this.redis.del(session.key);
          console.log(`[TemporaryImageStorage] Cleaned up orphaned session: ${requestId} (age: ${Math.round(age / 1000)}s)`);
        }

        this.activeSessions.delete(requestId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`[TemporaryImageStorage] Cleanup completed: ${cleanedCount} expired sessions removed`);
    }

    return cleanedCount;
  }

  /**
   * Clear all active sessions (for testing or emergency cleanup)
   */
  async clearAllSessions(): Promise<number> {
    console.log('[TemporaryImageStorage] Clearing all active sessions...');

    let deletedCount = 0;
    for (const [requestId, session] of this.activeSessions) {
      const deleted = await this.redis.del(session.key);
      if (deleted > 0) deletedCount++;
    }

    this.activeSessions.clear();

    console.log(`[TemporaryImageStorage] All sessions cleared: ${deletedCount} images deleted`);
    return deletedCount;
  }
}

export default TemporaryImageStorage;
