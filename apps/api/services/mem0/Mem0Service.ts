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

import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { getErrorMessage } from '../../utils/errors/handlers.js';
import { createLogger } from '../../utils/logger.js';

import { buildMem0Config, isMem0Available, validateMem0Environment } from './config.js';

import type { Mem0Message, Mem0Memory, Mem0MemoryMetadata, Mem0HistoryRecord } from './types.js';

const log = createLogger('Mem0Service');

/**
 * Minimum similarity score for a memory to be included in retrieval.
 * Qdrant cosine scores for loosely-related queries commonly sit in the
 * 0.3–0.5 range; the previous 0.4 cutoff silently dropped relevant memories
 * on many turns. Lowered to 0.3 — tune against real score distributions.
 */
const MEMORY_SCORE_THRESHOLD = 0.3;

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

      let response: SearchResult;
      try {
        response = await this.memory.add(messages, {
          userId,
          metadata: metadata as Record<string, unknown>,
        });
      } catch (addError: unknown) {
        const errName = addError instanceof Error ? addError.name : '';
        if (errName === 'ZodError' || errName === 'SyntaxError') {
          // Non-fatal, but a real silent-extraction failure: the SDK couldn't
          // parse the LLM output, so 0 memories were saved. Surface at warn (not
          // debug) so an unhealthy extraction model is visible in normal logs.
          log.warn(
            `[Mem0] ${errName} from mem0ai SDK — extraction parse failed, 0 memories saved for user ${userId}`
          );
          return [];
        }
        throw addError;
      }

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

      // Distinguish "nothing memorable" from a silent failure: a clean empty
      // result and a dropped-extraction both used to log identically as
      // "Added 0 memories", making it impossible to tell if extraction worked.
      if (addedMemories.length === 0) {
        log.info(
          `[Mem0] Extraction returned 0 memories for user ${userId} (nothing memorable, or LLM output fell back to empty)`
        );
      } else {
        log.info(`[Mem0] Added ${addedMemories.length} memories for user ${userId}`);
      }
      return addedMemories;
    } catch (error) {
      log.warn(`[Mem0] Error adding memories for user ${userId}: ${getErrorMessage(error)}`);
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
  async searchMemories(query: string, userId: string, limit: number = 5): Promise<Mem0Memory[]> {
    try {
      await this.ensureInitialized();

      if (!this.memory) {
        log.warn('[Mem0] Memory client not initialized');
        return [];
      }

      log.info(`[Mem0] Searching memories for user ${userId}: "${query.slice(0, 50)}..."`);

      const response: SearchResult = await this.memory.search(query, {
        filters: { user_id: userId },
        topK: limit,
      });

      const allMemories = (response?.results || []).map(toMem0Memory);

      // Filter by raw similarity score and sort by relevance.
      // Note: the previous confidence-weighted multiplier was dead code —
      // `metadata.confidence` is never persisted (mem0 OSS stores only the
      // metadata passed to add(), and the write path passes none), so the
      // multiplier was always 1.0. Removed to avoid the false impression that
      // high-confidence facts are boosted.
      const memories = allMemories
        .filter((m) => (m.score ?? 1) >= MEMORY_SCORE_THRESHOLD)
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

      log.info(
        `[Mem0] Found ${memories.length} relevant memories (${allMemories.length - memories.length} filtered below threshold) for user ${userId}`
      );

      return memories;
    } catch (error) {
      log.warn(`[Mem0] Error searching memories for user ${userId}: ${getErrorMessage(error)}`);
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

      const response: SearchResult = await this.memory.getAll({ filters: { user_id: userId } });
      const memories = (response?.results || []).map(toMem0Memory);

      log.info(`[Mem0] Retrieved ${memories.length} memories for user ${userId}`);
      return memories;
    } catch (error) {
      log.warn(`[Mem0] Error getting all memories for user ${userId}: ${getErrorMessage(error)}`);
      return [];
    }
  }

  /**
   * Update a specific memory's content.
   * Deletes the old memory and creates a new one with updated text.
   * (Mem0 OSS doesn't support in-place updates, so we delete + re-add.)
   *
   * @param memoryId - Memory ID to update
   * @param userId - User ID for verification
   * @param newContent - Updated memory text
   */
  async updateMemory(
    memoryId: string,
    userId: string,
    newContent: string
  ): Promise<Mem0Memory | null> {
    try {
      await this.ensureInitialized();

      if (!this.memory) {
        log.warn('[Mem0] Memory client not initialized');
        return null;
      }

      log.info(`[Mem0] Updating memory ${memoryId} for user ${userId}`);

      await this.memory.delete(memoryId);

      const response = await this.memory.add([{ role: 'user', content: newContent }], { userId });

      const updated = response?.results?.[0];
      if (!updated) {
        log.warn('[Mem0] Update re-add returned no results');
        return null;
      }

      const mem = toMem0Memory(updated);

      await this.logToHistory({
        userId,
        memoryId: updated.id,
        operation: 'update',
        memoryText: newContent,
      });

      log.info(`[Mem0] Updated memory ${memoryId} → ${updated.id}`);
      return mem;
    } catch (error) {
      log.error('[Mem0] Error updating memory:', error);
      return null;
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
      interface Mem0HistoryRow {
        id: string;
        user_id: string;
        memory_id: string;
        operation: 'add' | 'update' | 'delete' | 'delete_all';
        memory_text: string | null;
        metadata: Mem0MemoryMetadata | null;
        created_at: Date;
        thread_id: string | null;
        message_id: string | null;
      }

      const results = await postgres.query(
        `SELECT id, user_id, memory_id, operation, memory_text, metadata,
                created_at, thread_id, message_id
         FROM mem0_memory_history
         WHERE user_id = $1
         ORDER BY created_at DESC`,
        [userId]
      );

      return (results as unknown as Mem0HistoryRow[]).map((row) => ({
        id: row.id,
        userId: row.user_id,
        memoryId: row.memory_id,
        operation: row.operation,
        ...(row.memory_text != null && { memoryText: row.memory_text }),
        ...(row.metadata != null && { metadata: row.metadata }),
        createdAt: row.created_at,
        ...(row.thread_id != null && { threadId: row.thread_id }),
        ...(row.message_id != null && { messageId: row.message_id }),
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
