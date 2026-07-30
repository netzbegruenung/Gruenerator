/**
 * Counter Service Types
 */

/**
 * Minimal Redis client interface for counter operations.
 * Deliberately structural (not `RedisClientType`) so counters stay decoupled
 * from the concrete client and testable with a plain stub.
 */
export interface RedisClient {
  get(key: string): Promise<string | null>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<boolean | number>;
  del(...keys: string[]): Promise<number>;
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
