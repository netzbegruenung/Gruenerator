/**
 * Counter Service Types
 */

/**
 * Minimal Redis client interface for counter operations.
 * Structurally compatible with both the `redis` package (RedisClientType)
 * and `ioredis` (Redis), so counters can be used with either client.
 */
export interface RedisClient {
  get(key: string): Promise<string | null>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<boolean | number>;
  del(...keys: string[]): Promise<number>;
}

/**
 * Message object for token counting
 */
export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp?: string | undefined;
  [key: string]: unknown;
}

/**
 * Token statistics for conversations
 */
export interface TokenStats {
  totalTokens: number;
  messageCount: number;
  averageTokensPerMessage: number;
  systemMessages: number;
  userMessages: number;
  assistantMessages: number;
}

/**
 * Image generation limit status
 */
export interface ImageGenerationStatus {
  count: number;
  remaining: number;
  limit: number;
  canGenerate: boolean;
}

/**
 * Image generation increment result
 */
export interface ImageGenerationResult extends ImageGenerationStatus {
  success: boolean;
}
