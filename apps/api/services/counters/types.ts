/**
 * Counter Service Types
 */

/**
 * Message object for token counting
 */
export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp?: string;
  [key: string]: any;
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
 * Redis client type - any redis-like client with get/set/incr/expire/del methods
 * Using union type to be compatible with redis package's return types
 */
export interface RedisClient {
  get(key: string): Promise<string | null | Record<string, never>>;
  set(key: string, value: string | number, ...args: unknown[]): Promise<unknown>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  del(key: string): Promise<number>;
}
