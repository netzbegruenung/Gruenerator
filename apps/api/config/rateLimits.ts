/**
 * Rate Limiting Configuration
 * Centralized configuration for all resource types and user tiers
 *
 * Resource Types:
 * - image: AI image generation (Flux)
 * - text: AI text generation (Claude)
 * - pdf_export: PDF document export
 *
 * User Tiers:
 * - anonymous: Unauthenticated users (session/IP-based)
 * - authenticated: Logged-in users
 * - premium: Future premium tier (not yet implemented)
 *
 * Time Windows:
 * - daily: Resets at midnight
 * - hourly: Resets every hour
 * - monthly: Resets on 1st of month
 */

interface ResourceLimit {
  limit: number;
  window: 'daily' | 'hourly' | 'monthly';
}

interface ResourceConfig {
  anonymous: ResourceLimit;
  authenticated: ResourceLimit;
  premium: ResourceLimit;
}

interface DevelopmentConfig {
  enabled: boolean;
  multiplier: number;
}

export interface RateLimitConfig {
  resources: {
    image: ResourceConfig;
    text: ResourceConfig;
    pdf_export: ResourceConfig;
  };
  anonymousIdentifierStrategy: ('sessionID' | 'ip')[];
  enableAnalytics: boolean;
  redisKeyPrefix: string;
  allowOnRedisError: boolean;
  development: DevelopmentConfig;
}

const rateLimitConfig: RateLimitConfig = {
  // Resource limit definitions
  resources: {
    // AI Image Generation (Flux)
    image: {
      anonymous: { limit: 0, window: 'daily' },      // Anonymous users can't generate images
      authenticated: { limit: 5, window: 'daily' },   // Logged-in users: 5 images per day
      premium: { limit: 50, window: 'daily' }         // Future premium tier: 50 images per day
    },

    // AI Text Generation (Claude)
    text: {
      anonymous: { limit: 5, window: 'daily' },       // Anonymous: 5 total generations per day
      authenticated: { limit: Infinity, window: 'daily' },  // Unlimited for logged-in users
      premium: { limit: Infinity, window: 'daily' }         // Unlimited for premium users
    },

    // PDF Export
    pdf_export: {
      anonymous: { limit: 2, window: 'daily' },       // Anonymous: 2 PDF exports per day
      authenticated: { limit: 20, window: 'daily' },   // Authenticated: 20 exports per day
      premium: { limit: 100, window: 'daily' }         // Premium: 100 exports per day
    }

    // Easy to add more resource types:
    // audio: { ... },
    // video: { ... },
    // translation: { ... }
  },

  // Identifier strategy for anonymous users (tried in order)
  // - sessionID: Express session ID (requires saveUninitialized: true)
  // - ip: Client IP address (from req.ip or x-forwarded-for)
  anonymousIdentifierStrategy: ['sessionID', 'ip'],

  // Global settings
  enableAnalytics: process.env.ENABLE_RATE_LIMIT_ANALYTICS === 'true',  // Track usage for analytics
  redisKeyPrefix: 'rate_limit',                                           // Prefix for all Redis keys

  // Error handling
  allowOnRedisError: true,  // If true, allow requests when Redis is down (fail-open)

  // Development overrides
  development: {
    enabled: process.env.DISABLE_RATE_LIMITS !== 'true',  // Can disable in dev with env var
    multiplier: 1  // Can multiply all limits by N in dev (e.g., 10x for testing)
  }
};

export default rateLimitConfig;
export type { ResourceLimit, ResourceConfig, DevelopmentConfig };
