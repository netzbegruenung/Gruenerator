/**
 * Counter Service Types
 */

import type { Redis } from 'ioredis';

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
 * Redis client type (ioredis)
 */
export type RedisClient = Redis;
