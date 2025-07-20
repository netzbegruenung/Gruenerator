const redis = require('redis');

// Load environment variables
require('dotenv').config();

/**
 * Redis OAuth State Manager
 * 
 * Manages OAuth state storage in Redis for reliable cross-session persistence.
 * Handles PKCE values, user context, and automatic expiration.
 */
class RedisOAuthStateManager {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.init();
  }

  /**
   * Initialize Redis connection
   */
  async init() {
    try {
      if (!process.env.REDIS_URL) {
        console.warn('[Redis OAuth] No REDIS_URL configured - OAuth state will use fallback storage');
        return;
      }

      console.log('[Redis OAuth] Initializing Redis client with URL:', process.env.REDIS_URL.replace(/:\/\/(.*:)?(.*)@/, '://<user>:<password>@'));

      this.client = redis.createClient({
        url: process.env.REDIS_URL,
        retry_strategy: (options) => {
          if (options.error && options.error.code === 'ECONNREFUSED') {
            console.error('[Redis OAuth] Redis server connection refused');
            return new Error('Redis server connection refused');
          }
          if (options.total_retry_time > 1000 * 60 * 60) {
            console.error('[Redis OAuth] Retry time exhausted');
            return new Error('Retry time exhausted');
          }
          if (options.attempt > 10) {
            console.error('[Redis OAuth] Too many retry attempts');
            return undefined;
          }
          // Reconnect after this time
          return Math.min(options.attempt * 100, 3000);
        }
      });

      this.client.on('error', (err) => {
        console.error('[Redis OAuth] Connection error:', err.message);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        console.log('[Redis OAuth] Connected to Redis server');
        this.isConnected = true;
      });

      this.client.on('ready', () => {
        console.log('[Redis OAuth] Redis client ready');
        this.isConnected = true;
      });

      this.client.on('end', () => {
        console.log('[Redis OAuth] Redis connection ended');
        this.isConnected = false;
      });

      await this.client.connect();
      
    } catch (error) {
      console.error('[Redis OAuth] Failed to initialize Redis:', error.message);
      this.isConnected = false;
    }
  }

  /**
   * Generate Redis key for OAuth state
   * @param {string} state - OAuth state parameter
   * @returns {string} Redis key
   */
  getStateKey(state) {
    return `oauth:canva:state:${state}`;
  }

  /**
   * Store OAuth state in Redis
   * @param {string} state - OAuth state parameter
   * @param {Object} data - OAuth data to store
   * @param {number} ttlSeconds - TTL in seconds (default: 600 = 10 minutes)
   * @returns {Promise<boolean>} Success status
   */
  async storeState(state, data, ttlSeconds = 600) {
    try {
      if (!this.isConnected || !this.client) {
        console.warn('[Redis OAuth] Redis not available for storing state');
        return false;
      }

      const key = this.getStateKey(state);
      const stateData = {
        ...data,
        createdAt: Date.now(),
        expiresAt: Date.now() + (ttlSeconds * 1000)
      };

      await this.client.setEx(key, ttlSeconds, JSON.stringify(stateData));
      
      console.log('[Redis OAuth] OAuth state stored', {
        state: state.substring(0, 20) + '...',
        userId: data.userId,
        ttl: ttlSeconds,
        expiresAt: new Date(stateData.expiresAt).toISOString()
      });

      return true;

    } catch (error) {
      console.error('[Redis OAuth] Error storing OAuth state:', error.message);
      return false;
    }
  }

  /**
   * Retrieve and delete OAuth state from Redis
   * @param {string} state - OAuth state parameter
   * @returns {Promise<Object|null>} OAuth data or null if not found
   */
  async retrieveState(state) {
    try {
      if (!this.isConnected || !this.client) {
        console.warn('[Redis OAuth] Redis not available for retrieving state');
        return null;
      }

      const key = this.getStateKey(state);
      
      // Get and delete in one atomic operation
      const multi = this.client.multi();
      multi.get(key);
      multi.del(key);
      const results = await multi.exec();
      
      const dataString = results[0];
      
      if (!dataString) {
        console.log('[Redis OAuth] OAuth state not found', {
          state: state.substring(0, 20) + '...'
        });
        return null;
      }

      const data = JSON.parse(dataString);
      
      // Double-check expiration (Redis TTL should handle this, but be safe)
      if (Date.now() > data.expiresAt) {
        console.log('[Redis OAuth] OAuth state expired', {
          state: state.substring(0, 20) + '...',
          expiredAt: new Date(data.expiresAt).toISOString()
        });
        return null;
      }

      console.log('[Redis OAuth] OAuth state retrieved', {
        state: state.substring(0, 20) + '...',
        userId: data.userId,
        age: Math.round((Date.now() - data.createdAt) / 1000) + 's'
      });

      return data;

    } catch (error) {
      console.error('[Redis OAuth] Error retrieving OAuth state:', error.message);
      return null;
    }
  }

  /**
   * Check if Redis is available
   * @returns {boolean} Connection status
   */
  isAvailable() {
    return this.isConnected && this.client;
  }

  /**
   * Clean up expired OAuth states (manual cleanup - Redis TTL should handle most cases)
   * @returns {Promise<number>} Number of states cleaned up
   */
  async cleanupExpiredStates() {
    try {
      if (!this.isConnected || !this.client) {
        return 0;
      }

      const pattern = 'oauth:canva:state:*';
      const keys = await this.client.keys(pattern);
      
      if (keys.length === 0) {
        return 0;
      }

      let cleaned = 0;
      const now = Date.now();

      for (const key of keys) {
        try {
          const dataString = await this.client.get(key);
          if (dataString) {
            const data = JSON.parse(dataString);
            if (now > data.expiresAt) {
              await this.client.del(key);
              cleaned++;
            }
          }
        } catch (parseError) {
          // If we can't parse the data, delete the key
          await this.client.del(key);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        console.log(`[Redis OAuth] Manually cleaned up ${cleaned} expired OAuth states`);
      }

      return cleaned;

    } catch (error) {
      console.error('[Redis OAuth] Error during cleanup:', error.message);
      return 0;
    }
  }

  /**
   * Get statistics about stored OAuth states
   * @returns {Promise<Object>} Statistics object
   */
  async getStats() {
    try {
      if (!this.isConnected || !this.client) {
        return { available: false, count: 0 };
      }

      const pattern = 'oauth:canva:state:*';
      const keys = await this.client.keys(pattern);

      return {
        available: true,
        count: keys.length,
        connected: this.isConnected
      };

    } catch (error) {
      console.error('[Redis OAuth] Error getting stats:', error.message);
      return { available: false, count: 0, error: error.message };
    }
  }

  /**
   * Close Redis connection
   */
  async close() {
    try {
      if (this.client) {
        await this.client.quit();
        console.log('[Redis OAuth] Redis connection closed');
      }
    } catch (error) {
      console.error('[Redis OAuth] Error closing Redis connection:', error.message);
    }
  }
}

// Export singleton instance
const redisOAuthStateManager = new RedisOAuthStateManager();

module.exports = redisOAuthStateManager;