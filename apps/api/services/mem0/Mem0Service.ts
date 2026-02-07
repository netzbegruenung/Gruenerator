/**
 * Mem0 Service
 *
 * Singleton service for cross-thread, per-user memory persistence.
 * Enables the AI to remember user preferences, facts, and context
 * across different chat conversations.
 *
 * Features:
 * - Semantic memory search based on conversation context
 * - Async memory saving (non-blocking)
 * - GDPR-compliant history logging in PostgreSQL
 * - Graceful degradation (chat continues if mem0 fails)
 */

import { Memory, type MemoryItem, type SearchResult } from 'mem0ai/oss';
import { buildMem0Config, isMem0Available, validateMem0Environment } from './config.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { createLogger } from '../../utils/logger.js';
import type {
  Mem0Message,
  Mem0Memory,
  Mem0MemoryMetadata,
  Mem0HistoryRecord,
} from './types.js';

const log = createLogger('Mem0Service');

/**
 * Singleton instance of the Mem0 service.
 */
let mem0Instance: Mem0Service | null = null;

/**
 * Get the singleton Mem0 service instance.
 * Returns null if mem0 is not available (missing env vars).
 */
export function getMem0Instance(): Mem0Service | null {
  if (!isMem0Available()) {
    const missing = validateMem0Environment();
    log.warn(`[Mem0] Not available - missing env vars: ${missing.join(', ')}`);
    return null;
  }

  if (!mem0Instance) {
    mem0Instance = new Mem0Service();
  }

  return mem0Instance;
}

/**
 * Convert mem0 MemoryItem to our Mem0Memory type.
 */
function toMem0Memory(item: MemoryItem): Mem0Memory {
  return {
    id: item.id,
    memory: item.memory,
    hash: item.hash,
    metadata: item.metadata,
    score: item.score,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  };
}

/**
 * Mem0 Service for persistent user memory.
 */
export class Mem0Service {
  private memory: Memory | null = null;
  private initialized = false;
  private initializationPromise: Promise<void> | null = null;

  constructor() {
    // Lazy initialization - don't initialize in constructor
  }

  /**
   * Initialize the mem0 client if not already done.
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    if (this.initializationPromise) {
      await this.initializationPromise;
      return;
    }

    this.initializationPromise = this.initialize();
    await this.initializationPromise;
  }

  private async initialize(): Promise<void> {
    try {
      const config = buildMem0Config();
      this.memory = new Memory(config);
      this.initialized = true;
      log.info('[Mem0] Service initialized successfully');
    } catch (error) {
      log.error('[Mem0] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Add memories from a conversation.
   * This extracts relevant facts and preferences from the messages.
   *
   * @param messages - Array of conversation messages
   * @param userId - User ID for memory isolation
   * @param metadata - Optional metadata (threadId, messageId, etc.)
   */
  async addMemories(
    messages: Mem0Message[],
    userId: string,
    metadata?: Mem0MemoryMetadata
  ): Promise<Mem0Memory[]> {
    try {
      await this.ensureInitialized();

      if (!this.memory) {
        log.warn('[Mem0] Memory client not initialized');
        return [];
      }

      log.info(`[Mem0] Adding memories for user ${userId} from ${messages.length} messages`);

      const response: SearchResult = await this.memory.add(messages, {
        userId,
        metadata: metadata as Record<string, any>,
      });

      const addedMemories: Mem0Memory[] = [];

      if (response?.results) {
        for (const result of response.results) {
          addedMemories.push(toMem0Memory(result));

          // Log to history for GDPR compliance
          await this.logToHistory({
            userId,
            memoryId: result.id,
            operation: 'add',
            memoryText: result.memory,
            metadata,
            threadId: metadata?.threadId,
            messageId: metadata?.messageId,
          });
        }
      }

      log.info(`[Mem0] Added ${addedMemories.length} memories for user ${userId}`);
      return addedMemories;
    } catch (error) {
      log.error('[Mem0] Error adding memories:', error);
      return [];
    }
  }

  /**
   * Search for relevant memories based on a query.
   *
   * @param query - Search query (usually the user's message)
   * @param userId - User ID for memory isolation
   * @param limit - Maximum number of memories to return
   */
  async searchMemories(
    query: string,
    userId: string,
    limit: number = 5
  ): Promise<Mem0Memory[]> {
    try {
      await this.ensureInitialized();

      if (!this.memory) {
        log.warn('[Mem0] Memory client not initialized');
        return [];
      }

      log.info(`[Mem0] Searching memories for user ${userId}: "${query.slice(0, 50)}..."`);

      const response: SearchResult = await this.memory.search(query, {
        userId,
        limit,
      });

      const memories = (response?.results || []).map(toMem0Memory);
      log.info(`[Mem0] Found ${memories.length} relevant memories for user ${userId}`);

      return memories;
    } catch (error) {
      log.error('[Mem0] Error searching memories:', error);
      return [];
    }
  }

  /**
   * Get all memories for a user.
   *
   * @param userId - User ID
   */
  async getAllMemories(userId: string): Promise<Mem0Memory[]> {
    try {
      await this.ensureInitialized();

      if (!this.memory) {
        log.warn('[Mem0] Memory client not initialized');
        return [];
      }

      log.info(`[Mem0] Getting all memories for user ${userId}`);

      const response: SearchResult = await this.memory.getAll({ userId });
      const memories = (response?.results || []).map(toMem0Memory);

      log.info(`[Mem0] Retrieved ${memories.length} memories for user ${userId}`);
      return memories;
    } catch (error) {
      log.error('[Mem0] Error getting all memories:', error);
      return [];
    }
  }

  /**
   * Delete a specific memory.
   *
   * @param memoryId - Memory ID to delete
   * @param userId - User ID for verification
   */
  async deleteMemory(memoryId: string, userId: string): Promise<boolean> {
    try {
      await this.ensureInitialized();

      if (!this.memory) {
        log.warn('[Mem0] Memory client not initialized');
        return false;
      }

      log.info(`[Mem0] Deleting memory ${memoryId} for user ${userId}`);

      await this.memory.delete(memoryId);

      // Log to history for GDPR compliance
      await this.logToHistory({
        userId,
        memoryId,
        operation: 'delete',
      });

      log.info(`[Mem0] Deleted memory ${memoryId}`);
      return true;
    } catch (error) {
      log.error('[Mem0] Error deleting memory:', error);
      return false;
    }
  }

  /**
   * Delete all memories for a user.
   * Used for GDPR "right to be forgotten" requests.
   *
   * @param userId - User ID
   */
  async deleteAllUserMemories(userId: string): Promise<boolean> {
    try {
      await this.ensureInitialized();

      if (!this.memory) {
        log.warn('[Mem0] Memory client not initialized');
        return false;
      }

      log.info(`[Mem0] Deleting all memories for user ${userId}`);

      await this.memory.deleteAll({ userId });

      // Log to history for GDPR compliance
      await this.logToHistory({
        userId,
        memoryId: '*',
        operation: 'delete_all',
      });

      log.info(`[Mem0] Deleted all memories for user ${userId}`);
      return true;
    } catch (error) {
      log.error('[Mem0] Error deleting all memories:', error);
      return false;
    }
  }

  /**
   * Get memory history for a user (for GDPR data access requests).
   *
   * @param userId - User ID
   */
  async getMemoryHistory(userId: string): Promise<Mem0HistoryRecord[]> {
    try {
      const postgres = getPostgresInstance();
      const results = await postgres.query(
        `SELECT id, user_id, memory_id, operation, memory_text, metadata,
                created_at, thread_id, message_id
         FROM mem0_memory_history
         WHERE user_id = $1
         ORDER BY created_at DESC`,
        [userId]
      );

      return (results as any[]).map((row) => ({
        id: row.id as string,
        userId: row.user_id as string,
        memoryId: row.memory_id as string,
        operation: row.operation as 'add' | 'update' | 'delete' | 'delete_all',
        memoryText: row.memory_text as string | undefined,
        metadata: row.metadata as Mem0MemoryMetadata | undefined,
        createdAt: row.created_at as Date,
        threadId: row.thread_id as string | undefined,
        messageId: row.message_id as string | undefined,
      }));
    } catch (error) {
      log.error('[Mem0] Error getting memory history:', error);
      return [];
    }
  }

  /**
   * Log a memory operation to PostgreSQL for GDPR compliance.
   */
  private async logToHistory(record: Mem0HistoryRecord): Promise<void> {
    try {
      const postgres = getPostgresInstance();
      await postgres.query(
        `INSERT INTO mem0_memory_history
         (user_id, memory_id, operation, memory_text, metadata, thread_id, message_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          record.userId,
          record.memoryId,
          record.operation,
          record.memoryText || null,
          record.metadata ? JSON.stringify(record.metadata) : null,
          record.threadId || null,
          record.messageId || null,
        ]
      );
    } catch (error) {
      // Don't throw - history logging should not break main functionality
      log.error('[Mem0] Error logging to history:', error);
    }
  }
}
