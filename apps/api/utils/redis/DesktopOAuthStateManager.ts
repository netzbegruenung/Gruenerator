/**
 * Redis Desktop OAuth State Manager
 *
 * Manages PKCE state storage in Redis for desktop app authentication.
 * Stores code_challenge during OAuth initiation and validates during token exchange.
 */

import * as dotenv from 'dotenv';
import * as redis from 'redis';

import type { DesktopOAuthStateData } from './types.js';
import type { RedisClientType } from 'redis';

dotenv.config({ quiet: true });

const DEFAULT_TTL_SECONDS = 600; // 10 minutes

/**
 * Manages Desktop OAuth PKCE state in Redis with automatic expiration
 */
class DesktopOAuthStateManager {
  private client: RedisClientType | null = null;
  private isConnected: boolean = false;
  private initPromise: Promise<void>;

  constructor() {
    this.initPromise = this.init();
  }

  private async init(): Promise<void> {
    try {
      if (!process.env.REDIS_URL) {
        console.warn(
          '[Redis DesktopOAuth] No REDIS_URL configured - Desktop OAuth state will fail'
        );
        return;
      }

      this.client = redis.createClient({
        url: process.env.REDIS_URL,
        socket: {
          reconnectStrategy: (retries: number) => {
            if (retries > 10) {
              console.error('[Redis DesktopOAuth] Too many retry attempts');
              return new Error('Too many retry attempts');
            }
            return Math.min(retries * 100, 3000);
          },
        },
      });

      this.client.on('error', (err: Error) => {
        console.error('[Redis DesktopOAuth] Connection error:', err.message);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        console.log('[Redis DesktopOAuth] Connected to Redis server');
        this.isConnected = true;
      });

      this.client.on('ready', () => {
        console.log('[Redis DesktopOAuth] Redis client ready');
        this.isConnected = true;
      });

      this.client.on('end', () => {
        console.log('[Redis DesktopOAuth] Redis connection ended');
        this.isConnected = false;
      });

      await this.client.connect();
    } catch (error) {
      console.error('[Redis DesktopOAuth] Failed to initialize Redis:', (error as Error).message);
      this.isConnected = false;
    }
  }

  /**
   * Wait for Redis connection to be ready
   */
  async waitForConnection(): Promise<boolean> {
    await this.initPromise;
    return this.isConnected;
  }

  /**
   * Generate Redis key for Desktop OAuth PKCE state
   */
  private getStateKey(stateId: string): string {
    return `oauth:desktop:pkce:${stateId}`;
  }

  /**
   * Store PKCE state in Redis
   * @param stateId - Unique state identifier
   * @param codeChallenge - PKCE code challenge (SHA-256 hash of verifier)
   * @param userAgent - Optional user agent for audit
   * @param ttlSeconds - TTL in seconds (default: 600 = 10 minutes)
   * @returns Success status
   */
  async storeState(
    stateId: string,
    codeChallenge: string,
    userAgent?: string,
    ttlSeconds: number = DEFAULT_TTL_SECONDS
  ): Promise<boolean> {
    try {
      await this.initPromise;

      if (!this.isConnected || !this.client) {
        console.warn('[Redis DesktopOAuth] Redis not available for storing state');
        return false;
      }

      const key = this.getStateKey(stateId);
      const now = Date.now();
      const stateData: DesktopOAuthStateData = {
        state_id: stateId,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        user_agent: userAgent,
        created_at: now,
        expires_at: now + ttlSeconds * 1000,
      };

      await this.client.setEx(key, ttlSeconds, JSON.stringify(stateData));

      console.log('[Redis DesktopOAuth] PKCE state stored', {
        stateId: stateId.substring(0, 12) + '...',
        challengePrefix: codeChallenge.substring(0, 8) + '...',
        ttl: ttlSeconds,
      });

      return true;
    } catch (error) {
      console.error('[Redis DesktopOAuth] Error storing PKCE state:', (error as Error).message);
      return false;
    }
  }

  /**
   * Retrieve PKCE state from Redis (does NOT delete - use consumeState for that)
   * @param stateId - State identifier
   * @returns PKCE state data or null if not found/expired
   */
  async getState(stateId: string): Promise<DesktopOAuthStateData | null> {
    try {
      await this.initPromise;

      if (!this.isConnected || !this.client) {
        console.warn('[Redis DesktopOAuth] Redis not available for retrieving state');
        return null;
      }

      const key = this.getStateKey(stateId);
      const dataString = await this.client.get(key);

      if (!dataString || typeof dataString !== 'string') {
        console.log('[Redis DesktopOAuth] PKCE state not found', {
          stateId: stateId.substring(0, 12) + '...',
        });
        return null;
      }

      const data = JSON.parse(dataString) as DesktopOAuthStateData;

      if (Date.now() > data.expires_at) {
        console.log('[Redis DesktopOAuth] PKCE state expired', {
          stateId: stateId.substring(0, 12) + '...',
        });
        await this.client.del(key);
        return null;
      }

      return data;
    } catch (error) {
      console.error('[Redis DesktopOAuth] Error retrieving PKCE state:', (error as Error).message);
      return null;
    }
  }

  /**
   * Consume (retrieve and delete) PKCE state from Redis
   * This should be used during token exchange to ensure one-time use
   * @param stateId - State identifier
   * @returns PKCE state data or null if not found/expired
   */
  async consumeState(stateId: string): Promise<DesktopOAuthStateData | null> {
    try {
      await this.initPromise;

      if (!this.isConnected || !this.client) {
        console.warn('[Redis DesktopOAuth] Redis not available for consuming state');
        return null;
      }

      const key = this.getStateKey(stateId);

      // Get and delete atomically
      const multi = this.client.multi();
      multi.get(key);
      multi.del(key);
      const results = await multi.exec();

      const dataString = results[0] as unknown as string | null;

      if (!dataString) {
        console.log('[Redis DesktopOAuth] PKCE state not found for consumption', {
          stateId: stateId.substring(0, 12) + '...',
        });
        return null;
      }

      const data = JSON.parse(dataString) as DesktopOAuthStateData;

      if (Date.now() > data.expires_at) {
        console.log('[Redis DesktopOAuth] PKCE state expired during consumption', {
          stateId: stateId.substring(0, 12) + '...',
        });
        return null;
      }

      console.log('[Redis DesktopOAuth] PKCE state consumed', {
        stateId: stateId.substring(0, 12) + '...',
        age: Math.round((Date.now() - data.created_at) / 1000) + 's',
      });

      return data;
    } catch (error) {
      console.error('[Redis DesktopOAuth] Error consuming PKCE state:', (error as Error).message);
      return null;
    }
  }

  /**
   * Delete PKCE state from Redis
   * @param stateId - State identifier
   */
  async deleteState(stateId: string): Promise<boolean> {
    try {
      await this.initPromise;

      if (!this.isConnected || !this.client) {
        return false;
      }

      const key = this.getStateKey(stateId);
      await this.client.del(key);
      return true;
    } catch (error) {
      console.error('[Redis DesktopOAuth] Error deleting PKCE state:', (error as Error).message);
      return false;
    }
  }

  /**
   * Check if Redis is available
   */
  isAvailable(): boolean {
    return this.isConnected && this.client !== null;
  }

  /**
   * Get statistics about stored Desktop OAuth states
   */
  async getStats(): Promise<{
    available: boolean;
    count: number;
    connected?: boolean;
    error?: string;
  }> {
    try {
      await this.initPromise;

      if (!this.isConnected || !this.client) {
        return { available: false, count: 0 };
      }

      const pattern = 'oauth:desktop:pkce:*';
      const keys = await this.client.keys(pattern);

      return {
        available: true,
        count: keys.length,
        connected: this.isConnected,
      };
    } catch (error) {
      console.error('[Redis DesktopOAuth] Error getting stats:', (error as Error).message);
      return { available: false, count: 0, error: (error as Error).message };
    }
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    try {
      if (this.client) {
        await this.client.quit();
        console.log('[Redis DesktopOAuth] Redis connection closed');
      }
    } catch (error) {
      console.error(
        '[Redis DesktopOAuth] Error closing Redis connection:',
        (error as Error).message
      );
    }
  }
}

// Export singleton instance
const desktopOAuthStateManager = new DesktopOAuthStateManager();

export default desktopOAuthStateManager;

export { desktopOAuthStateManager, DesktopOAuthStateManager };
