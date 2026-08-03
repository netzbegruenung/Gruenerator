/**
 * Counter Service Types
 */

/**
 * Minimal Redis client interface for counter operations.
 * Deliberately structural (not `RedisClientType`) so counters stay decoupled
 * from the concrete client and testable with a plain stub.
 *
 * `isReady` is optional: node-redis exposes it, a minimal stub doesn't.
 * Consumers that need to fail closed on a dead connection must check
 * `this.redis.isReady === false` (never `!this.redis.isReady`) — a client
 * that doesn't expose the field at all must NOT be treated as "not ready".
 */
export interface RedisClient {
  get(key: string): Promise<string | null>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<boolean | number>;
  del(...keys: string[]): Promise<number>;
  isReady?: boolean;
}

/**
 * Extension required by ImageGenerationCounter to support per-call increment
 * amounts (centi-credits per model). Kept off the base RedisClient interface
 * so the other counters need only the four core commands.
 */
export interface RedisIncrByClient extends RedisClient {
  incrBy(key: string, increment: number): Promise<number>;
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

/**
 * Deep research (Linkup) daily limit status
 */
export interface DeepResearchStatus {
  count: number;
  remaining: number;
  limit: number;
  canResearch: boolean;
}

/**
 * Deep research increment result
 */
export interface DeepResearchResult extends DeepResearchStatus {
  success: boolean;
}
