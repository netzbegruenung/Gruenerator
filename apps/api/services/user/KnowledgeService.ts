import {
  type PostgresService,
  getPostgresInstance,
} from '../../database/services/PostgresService.js';
import { type QdrantService, getQdrantInstance } from '../../database/services/QdrantService.js';
import { createLogger } from '../../utils/logger.js';
import { generateContentHash, generatePointId } from '../../utils/validation/index.js';
import { smartChunkDocument } from '../document-services/index.js';
import { mistralEmbeddingService } from '../mistral/index.js';

import type {
  UserKnowledgeEntry,
  KnowledgeSaveData,
  EmbeddingChunk,
  QdrantPoint,
  SearchOptions,
  SearchResponse,
  ChunkingOptions,
  DocumentChunk,
} from './types.js';

const log = createLogger('KnowledgeService');

/**
 * KnowledgeService - User knowledge operations with Postgres storage and Qdrant vectorization
 */
class KnowledgeService {
  private postgres: PostgresService | null = null;
  private qdrant: QdrantService | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize the service
   */
  async init(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this._init();
    }
    return this.initPromise;
  }

  private async _init(): Promise<void> {
    try {
      this.postgres = getPostgresInstance();
      await this.postgres.ensureInitialized();

      this.qdrant = getQdrantInstance();
      await this.qdrant.init();

      await mistralEmbeddingService.init();

      log.debug('[KnowledgeService] Initialized successfully');
    } catch (error: unknown) {
      log.error('[KnowledgeService] Initialization failed:', { error });
      throw error;
    }
  }

  /**
   * Ensure service is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.postgres || !this.qdrant) {
      await this.init();
    }
  }

  /**
   * Get user knowledge entries
   */
  async getUserKnowledge(userId: string): Promise<UserKnowledgeEntry[]> {
    await this.ensureInitialized();

    try {
      const query = `
        SELECT id, title, content, knowledge_type, created_at, updated_at, tags,
               embedding_id, embedding_hash, vector_indexed_at
        FROM user_knowledge
        WHERE user_id = $1 AND is_active = true
        ORDER BY created_at ASC
        LIMIT 3
      `;

      const results = await this.postgres!.query<UserKnowledgeEntry>(query, [userId], {
        table: 'user_knowledge',
      });

      return results.map((row) => ({
        id: row.id,
        title: row.title,
        content: row.content,
        created_at: row.created_at,
        updated_at: row.updated_at,
        tags: row.tags,
        knowledge_type: row.knowledge_type,
        embedding_id: row.embedding_id,
        embedding_hash: row.embedding_hash,
        vector_indexed_at: row.vector_indexed_at,
      }));
    } catch (error: unknown) {
      log.error('[KnowledgeService] Failed to get user knowledge:', { error });
      throw new Error(
        `Failed to retrieve knowledge: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Create or update user knowledge entry
   */
  async saveUserKnowledge(
    userId: string,
    knowledgeEntry: KnowledgeSaveData
  ): Promise<UserKnowledgeEntry> {
    await this.ensureInitialized();

    try {
      const { id, title, content, knowledge_type = 'general', tags = null } = knowledgeEntry;

      const contentHash = generateContentHash(title + '\n' + content);

      let savedEntry: UserKnowledgeEntry;
      let isNew = false;

      if (id && !id.toString().startsWith('new-')) {
        const updateResult = await this.postgres!.update(
          'user_knowledge',
          {
            title: title?.trim() || 'Unbenannter Eintrag',
            content: content?.trim() || '',
            knowledge_type,
            tags,
            embedding_hash: contentHash,
          },
          { id, user_id: userId }
        );

        if (updateResult.data.length === 0) {
          throw new Error('Knowledge entry not found or access denied');
        }

        const row = updateResult.data[0] as Record<string, unknown>;
        savedEntry = {
          id: row.id as string,
          user_id: row.user_id as string,
          title: row.title as string,
          content: row.content as string,
          knowledge_type: row.knowledge_type as string,
          created_at: row.created_at as Date | string,
          updated_at: row.updated_at as Date | string,
          tags: row.tags as string[] | null,
          is_active: row.is_active as boolean,
          embedding_id: row.embedding_id as string | undefined,
          embedding_hash: row.embedding_hash as string | undefined,
          vector_indexed_at: row.vector_indexed_at as Date | string | null | undefined,
        };
      } else {
        const insertedRow = await this.postgres!.insert('user_knowledge', {
          user_id: userId,
          title: title?.trim() || 'Unbenannter Eintrag',
          content: content?.trim() || '',
          knowledge_type,
          tags,
          embedding_hash: contentHash,
          is_active: true,
        });
        const row = insertedRow as Record<string, unknown>;
        savedEntry = {
          id: row.id as string,
          user_id: row.user_id as string,
          title: row.title as string,
          content: row.content as string,
          knowledge_type: row.knowledge_type as string,
          created_at: row.created_at as Date | string,
          updated_at: row.updated_at as Date | string,
          tags: row.tags as string[] | null,
          is_active: row.is_active as boolean,
          embedding_id: row.embedding_id as string | undefined,
          embedding_hash: row.embedding_hash as string | undefined,
          vector_indexed_at: row.vector_indexed_at as Date | string | null | undefined,
        };
        isNew = true;
      }

      await this.vectorizeKnowledge(savedEntry);

      log.debug(
        `[KnowledgeService] ${isNew ? 'Created' : 'Updated'} knowledge entry ${savedEntry.id} for user ${userId}`
      );

      return savedEntry;
    } catch (error: unknown) {
      log.error('[KnowledgeService] Failed to save knowledge:', { error });
      throw new Error(
        `Failed to save knowledge: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Delete user knowledge entry
   */
  async deleteUserKnowledge(userId: string, knowledgeId: string): Promise<{ success: boolean }> {
    await this.ensureInitialized();

    try {
      const entry = await this.postgres!.queryOne(
        'SELECT embedding_id FROM user_knowledge WHERE id = $1 AND user_id = $2 AND is_active = true',
        [knowledgeId, userId]
      );

      if (!entry) {
        throw new Error('Knowledge entry not found');
      }

      if (entry.embedding_id && this.qdrant!.isAvailableSync()) {
        try {
          await this.qdrant!.client!.delete(this.qdrant!.collections.user_knowledge, {
            filter: {
              must: [{ key: 'knowledge_id', match: { value: knowledgeId } }],
            },
          });
          log.debug(`[KnowledgeService] Deleted vectors for knowledge ${knowledgeId}`);
        } catch (qdrantError: unknown) {
          log.warn(
            '[KnowledgeService] Failed to delete vectors:',
            qdrantError instanceof Error ? qdrantError.message : String(qdrantError)
          );
        }
      }

      await this.postgres!.update(
        'user_knowledge',
        { is_active: false },
        { id: knowledgeId, user_id: userId }
      );

      log.debug(`[KnowledgeService] Deleted knowledge entry ${knowledgeId} for user ${userId}`);

      return { success: true };
    } catch (error: unknown) {
      log.error('[KnowledgeService] Failed to delete knowledge:', { error });
      throw new Error(
        `Failed to delete knowledge: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Vectorize knowledge entry and store in Qdrant
   */
  private async vectorizeKnowledge(knowledgeEntry: UserKnowledgeEntry): Promise<string | null> {
    if (!this.qdrant!.isAvailableSync()) {
      log.warn('[KnowledgeService] Qdrant not available, skipping vectorization');
      return null;
    }

    try {
      const { id: knowledgeId, user_id: userId, title, content, embedding_hash } = knowledgeEntry;

      const existing = await this.postgres!.queryOne<{
        embedding_id: string | null;
        embedding_hash: string | null;
      }>('SELECT embedding_id, embedding_hash FROM user_knowledge WHERE id = $1', [knowledgeId]);

      if (existing?.embedding_id && existing.embedding_hash === embedding_hash) {
        log.debug(
          `[KnowledgeService] Knowledge ${knowledgeId} already vectorized with current content`
        );
        return existing.embedding_id;
      }

      const fullText = `${title}\n\n${content}`;

      let embeddings: EmbeddingChunk[];
      if (fullText.length < 1000) {
        const embedding = await mistralEmbeddingService.generateEmbedding(fullText);
        embeddings = [{ text: fullText, embedding, tokens: fullText.split(' ').length }];
      } else {
        const chunks = (await smartChunkDocument(fullText, {
          chunkSize: 500,
          chunkOverlap: 50,
          respectSentences: true,
        } as ChunkingOptions)) as DocumentChunk[];

        embeddings = [];
        for (const chunk of chunks) {
          const embedding = await mistralEmbeddingService.generateEmbedding(chunk.text);
          embeddings.push({ text: chunk.text, embedding, tokens: chunk.tokens });
        }
      }

      const points = embeddings.map(
        (chunk, index): QdrantPoint => ({
          id: generatePointId('knowledge', knowledgeId!, index).toString(),
          vector: chunk.embedding,
          payload: {
            knowledge_id: knowledgeId!,
            user_id: userId!,
            title: title,
            content: chunk.text,
            chunk_index: index,
            chunk_tokens: chunk.tokens,
            knowledge_type: knowledgeEntry.knowledge_type || 'general',
            created_at: new Date().toISOString(),
          },
        })
      );

      await this.qdrant!.client!.upsert(this.qdrant!.collections.user_knowledge, {
        points: points,
      });

      const embeddingId = `knowledge_${knowledgeId}_${Date.now()}`;
      await this.postgres!.update(
        'user_knowledge',
        {
          embedding_id: embeddingId,
          embedding_hash: embedding_hash,
          vector_indexed_at: new Date().toISOString(),
        },
        { id: knowledgeId }
      );

      log.debug(
        `[KnowledgeService] Vectorized knowledge ${knowledgeId} with ${embeddings.length} chunks`
      );

      return embeddingId;
    } catch (error: unknown) {
      log.error('[KnowledgeService] Failed to vectorize knowledge:', { error });
      return null;
    }
  }

  /**
   * Search user knowledge using vector similarity (with text fallback)
   */
  async searchUserKnowledge(
    userId: string,
    query: string,
    options: SearchOptions = {}
  ): Promise<SearchResponse> {
    await this.ensureInitialized();
    const { limit = 5, threshold = 0.3 } = options;

    if (this.qdrant!.isAvailableSync()) {
      try {
        const queryEmbedding = await mistralEmbeddingService.generateEmbedding(query);
        const searchResult = await this.qdrant!.client!.search(
          this.qdrant!.collections.user_knowledge,
          {
            vector: queryEmbedding,
            filter: { must: [{ key: 'user_id', match: { value: userId } }] },
            limit: limit * 2,
            score_threshold: threshold,
            with_payload: true,
          }
        );

        const seen = new Set();
        const results = searchResult
          .filter((hit) => {
            const p = hit.payload as Record<string, unknown> | null;
            return p && !seen.has(p.knowledge_id) && seen.add(p.knowledge_id);
          })
          .slice(0, limit)
          .map((hit) => {
            const p = hit.payload as Record<string, unknown>;
            return {
              knowledge_id: p.knowledge_id as string,
              title: p.title as string,
              content: p.content as string,
              similarity_score: hit.score,
              knowledge_type: p.knowledge_type as string,
            };
          });

        return { success: true, results, total: results.length, search_type: 'vector' };
      } catch (error: unknown) {
        log.warn(
          '[KnowledgeService] Vector search failed, falling back to text search:',
          error instanceof Error ? error.message : String(error)
        );
      }
    }

    try {
      const searchPattern = `%${query}%`;
      const results = await this.postgres!.query<{
        id: string;
        title: string;
        content: string;
        knowledge_type: string;
        rank: number;
      }>(
        `
        SELECT id, title, content, knowledge_type,
               ts_rank(to_tsvector('english', title || ' ' || content), plainto_tsquery('english', $2)) as rank
        FROM user_knowledge
        WHERE user_id = $1 AND is_active = true AND (title ILIKE $3 OR content ILIKE $3)
        ORDER BY rank DESC, created_at DESC LIMIT $4
      `,
        [userId, query, searchPattern, limit]
      );

      return {
        success: true,
        results: results.map((row) => ({
          knowledge_id: row.id,
          title: row.title,
          content: row.content.length > 500 ? row.content.substring(0, 500) + '...' : row.content,
          similarity_score: row.rank,
          knowledge_type: row.knowledge_type,
        })),
        total: results.length,
        search_type: 'text',
      };
    } catch (error: unknown) {
      log.error('[KnowledgeService] Text search failed:', { error });
      throw new Error(`Search failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

// Export singleton instance
let knowledgeServiceInstance: KnowledgeService | null = null;

export function getKnowledgeService(): KnowledgeService {
  if (!knowledgeServiceInstance) {
    knowledgeServiceInstance = new KnowledgeService();
  }
  return knowledgeServiceInstance;
}

export { KnowledgeService };
export default KnowledgeService;
