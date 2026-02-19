/**
 * PromptVectorService - Semantic search operations for custom prompts
 * Uses Qdrant for vector storage and Mistral for embeddings
 */

import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { getQdrantInstance } from '../../database/services/QdrantService.js';
import { createLogger } from '../../utils/logger.js';
import { generateContentHash, generatePointId } from '../../utils/validation/index.js';
import { mistralEmbeddingService } from '../mistral/index.js';

const log = createLogger('PromptVectorService');

const COLLECTION_NAME = 'custom_prompts';

interface PostgresService {
  ensureInitialized(): Promise<void>;
  query(sql: string, params?: unknown[], options?: { table: string }): Promise<any[]>;
  queryOne(sql: string, params?: unknown[], options?: { table: string }): Promise<any | null>;
  update(
    table: string,
    data: Record<string, unknown>,
    where: Record<string, unknown>
  ): Promise<{ data: any[] }>;
}

interface QdrantService {
  init(): Promise<void>;
  isAvailable(): boolean;
  client: {
    upsert(collection: string, data: { points: QdrantPoint[] }): Promise<unknown>;
    delete(collection: string, data: { filter: QdrantFilter }): Promise<unknown>;
    search(
      collection: string,
      data: {
        vector: number[];
        filter?: QdrantFilter;
        limit: number;
        score_threshold: number;
        with_payload: boolean;
      }
    ): Promise<SearchHit[]>;
  };
}

interface MistralService {
  init(): Promise<void>;
  generateEmbedding(text: string): Promise<number[]>;
}

interface QdrantFilter {
  must?: FilterCondition[];
  should?: FilterCondition[];
}

interface FilterCondition {
  key: string;
  match: { value: string | boolean };
}

interface QdrantPoint {
  id: string;
  vector: number[];
  payload: PromptPointPayload;
}

interface PromptPointPayload {
  prompt_id: string;
  user_id: string;
  name: string;
  slug: string;
  prompt_preview: string;
  description: string;
  is_public: boolean;
  created_at: string;
}

interface SearchHit {
  id: string;
  score: number;
  payload: PromptPointPayload;
}

export interface CustomPromptData {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  prompt: string;
  description?: string | null;
  is_public: boolean;
  embedding_id?: string | null;
  embedding_hash?: string | null;
}

export interface PromptSearchResult {
  prompt_id: string;
  user_id: string;
  name: string;
  slug: string;
  prompt_preview: string;
  description: string;
  is_public: boolean;
  similarity_score: number;
}

export interface PromptSearchResponse {
  success: boolean;
  results: PromptSearchResult[];
  total: number;
  search_type: 'vector' | 'text';
}

export interface PromptSearchOptions {
  limit?: number;
  threshold?: number;
  includeOwn?: boolean;
}

class PromptVectorService {
  private postgres: PostgresService | null = null;
  private qdrant: QdrantService | null = null;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this._init();
    }
    return this.initPromise;
  }

  private async _init(): Promise<void> {
    try {
      this.postgres = getPostgresInstance() as unknown as PostgresService;
      await this.postgres.ensureInitialized();

      this.qdrant = getQdrantInstance() as unknown as QdrantService;
      await this.qdrant.init();

      await (mistralEmbeddingService as unknown as MistralService).init();

      log.info('PromptVectorService initialized successfully');
    } catch (error: unknown) {
      const err = error as Error;
      log.error('PromptVectorService initialization failed:', err);
      throw error;
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.postgres || !this.qdrant) {
      await this.init();
    }
  }

  /**
   * Index a prompt in Qdrant - called on create/update
   */
  async indexPrompt(prompt: CustomPromptData): Promise<string | null> {
    await this.ensureInitialized();

    if (!this.qdrant!.isAvailable()) {
      log.warn('Qdrant not available, skipping prompt indexing');
      return null;
    }

    try {
      const {
        id: promptId,
        user_id: userId,
        name,
        slug,
        prompt: promptText,
        description,
        is_public,
      } = prompt;

      const contentToEmbed = `${name}\n\n${description || ''}\n\n${promptText}`;
      const contentHash = generateContentHash(contentToEmbed);

      const existing = await this.postgres!.queryOne(
        'SELECT embedding_id, embedding_hash FROM custom_prompts WHERE id = $1',
        [promptId],
        { table: 'custom_prompts' }
      );

      if (existing?.embedding_id && existing.embedding_hash === contentHash) {
        log.debug(`Prompt ${promptId} already vectorized with current content`);
        return existing.embedding_id;
      }

      const embedding = await (
        mistralEmbeddingService as unknown as MistralService
      ).generateEmbedding(contentToEmbed);

      const promptPreview =
        promptText.length > 200 ? promptText.substring(0, 200) + '...' : promptText;

      const point: QdrantPoint = {
        id: generatePointId('prompt', promptId, 0).toString(),
        vector: embedding,
        payload: {
          prompt_id: promptId,
          user_id: userId,
          name: name,
          slug: slug,
          prompt_preview: promptPreview,
          description: description || '',
          is_public: is_public,
          created_at: new Date().toISOString(),
        },
      };

      await this.qdrant!.client.upsert(COLLECTION_NAME, { points: [point] });

      const embeddingId = `prompt_${promptId}_${Date.now()}`;
      await this.postgres!.update(
        'custom_prompts',
        {
          embedding_id: embeddingId,
          embedding_hash: contentHash,
          vector_indexed_at: new Date().toISOString(),
        },
        { id: promptId }
      );

      log.debug(`Indexed prompt ${promptId} in Qdrant`);
      return embeddingId;
    } catch (error: unknown) {
      const err = error as Error;
      log.error('Failed to index prompt:', err);
      return null;
    }
  }

  /**
   * Delete prompt vector from Qdrant
   */
  async deletePromptVector(promptId: string): Promise<boolean> {
    await this.ensureInitialized();

    if (!this.qdrant!.isAvailable()) {
      return true;
    }

    try {
      await this.qdrant!.client.delete(COLLECTION_NAME, {
        filter: {
          must: [{ key: 'prompt_id', match: { value: promptId } }],
        },
      });

      log.debug(`Deleted vectors for prompt ${promptId}`);
      return true;
    } catch (error: unknown) {
      const err = error as Error;
      log.warn('Failed to delete prompt vectors:', err.message);
      return false;
    }
  }

  /**
   * Search user's own prompts semantically
   */
  async searchUserPrompts(
    userId: string,
    query: string,
    options: PromptSearchOptions = {}
  ): Promise<PromptSearchResponse> {
    await this.ensureInitialized();
    const { limit = 10, threshold = 0.3 } = options;

    if (this.qdrant!.isAvailable()) {
      try {
        const queryEmbedding = await (
          mistralEmbeddingService as unknown as MistralService
        ).generateEmbedding(query);

        const searchResult = await this.qdrant!.client.search(COLLECTION_NAME, {
          vector: queryEmbedding,
          filter: {
            must: [{ key: 'user_id', match: { value: userId } }],
          },
          limit: limit,
          score_threshold: threshold,
          with_payload: true,
        });

        const results: PromptSearchResult[] = searchResult.map((hit: SearchHit) => ({
          prompt_id: hit.payload.prompt_id,
          user_id: hit.payload.user_id,
          name: hit.payload.name,
          slug: hit.payload.slug,
          prompt_preview: hit.payload.prompt_preview,
          description: hit.payload.description,
          is_public: hit.payload.is_public,
          similarity_score: hit.score,
        }));

        return { success: true, results, total: results.length, search_type: 'vector' };
      } catch (error: unknown) {
        const err = error as Error;
        log.warn('Vector search failed, falling back to text search:', err.message);
      }
    }

    return this.textSearchPrompts(userId, query, limit, true);
  }

  /**
   * Search public prompts for discovery
   */
  async searchPublicPrompts(
    query: string,
    options: PromptSearchOptions = {},
    excludeUserId?: string
  ): Promise<PromptSearchResponse> {
    await this.ensureInitialized();
    const { limit = 10, threshold = 0.3 } = options;

    if (this.qdrant!.isAvailable()) {
      try {
        const queryEmbedding = await (
          mistralEmbeddingService as unknown as MistralService
        ).generateEmbedding(query);

        const searchResult = await this.qdrant!.client.search(COLLECTION_NAME, {
          vector: queryEmbedding,
          filter: {
            must: [{ key: 'is_public', match: { value: true } }],
          },
          limit: limit * 2,
          score_threshold: threshold,
          with_payload: true,
        });

        let results: PromptSearchResult[] = searchResult.map((hit: SearchHit) => ({
          prompt_id: hit.payload.prompt_id,
          user_id: hit.payload.user_id,
          name: hit.payload.name,
          slug: hit.payload.slug,
          prompt_preview: hit.payload.prompt_preview,
          description: hit.payload.description,
          is_public: hit.payload.is_public,
          similarity_score: hit.score,
        }));

        if (excludeUserId) {
          results = results.filter((r) => r.user_id !== excludeUserId);
        }

        return {
          success: true,
          results: results.slice(0, limit),
          total: results.length,
          search_type: 'vector',
        };
      } catch (error: unknown) {
        const err = error as Error;
        log.warn('Vector search failed, falling back to text search:', err.message);
      }
    }

    return this.textSearchPrompts(null, query, limit, false, excludeUserId);
  }

  /**
   * Get public prompts for discovery (no query - returns recent)
   */
  async getPublicPrompts(
    limit: number = 10,
    excludeUserId?: string
  ): Promise<PromptSearchResponse> {
    await this.ensureInitialized();

    try {
      let sql = `
        SELECT id, user_id, name, slug, prompt, description, is_public, created_at
        FROM custom_prompts
        WHERE is_public = true AND is_active = true
      `;
      const params: unknown[] = [];

      if (excludeUserId) {
        sql += ` AND (user_id IS NULL OR user_id != $1)`;
        params.push(excludeUserId);
      }

      sql += ` ORDER BY created_at DESC LIMIT ${limit}`;

      const rows = await this.postgres!.query(sql, params, { table: 'custom_prompts' });

      const results: PromptSearchResult[] = rows.map((row) => ({
        prompt_id: row.id,
        user_id: row.user_id,
        name: row.name,
        slug: row.slug,
        prompt_preview: row.prompt.length > 200 ? row.prompt.substring(0, 200) + '...' : row.prompt,
        description: row.description || '',
        is_public: row.is_public,
        similarity_score: 1.0,
      }));

      return { success: true, results, total: results.length, search_type: 'text' };
    } catch (error: unknown) {
      const err = error as Error;
      log.error('Failed to get public prompts:', err);
      throw new Error(`Failed to get public prompts: ${err.message}`);
    }
  }

  /**
   * Fallback text search for prompts
   */
  private async textSearchPrompts(
    userId: string | null,
    query: string,
    limit: number,
    userOnly: boolean,
    excludeUserId?: string
  ): Promise<PromptSearchResponse> {
    try {
      const searchPattern = `%${query}%`;
      let sql: string;
      let params: unknown[];

      if (userOnly && userId) {
        sql = `
          SELECT id, user_id, name, slug, prompt, description, is_public,
                 ts_rank(to_tsvector('german', name || ' ' || COALESCE(description, '') || ' ' || prompt),
                         plainto_tsquery('german', $2)) as rank
          FROM custom_prompts
          WHERE user_id = $1 AND is_active = true
            AND (name ILIKE $3 OR description ILIKE $3 OR prompt ILIKE $3)
          ORDER BY rank DESC, created_at DESC
          LIMIT $4
        `;
        params = [userId, query, searchPattern, limit];
      } else {
        sql = `
          SELECT id, user_id, name, slug, prompt, description, is_public,
                 ts_rank(to_tsvector('german', name || ' ' || COALESCE(description, '') || ' ' || prompt),
                         plainto_tsquery('german', $1)) as rank
          FROM custom_prompts
          WHERE is_public = true AND is_active = true
            AND (name ILIKE $2 OR description ILIKE $2 OR prompt ILIKE $2)
        `;
        params = [query, searchPattern];

        if (excludeUserId) {
          sql += ` AND user_id != $3`;
          params.push(excludeUserId);
        }

        sql += ` ORDER BY rank DESC, created_at DESC LIMIT $${params.length + 1}`;
        params.push(limit);
      }

      const rows = await this.postgres!.query(sql, params, { table: 'custom_prompts' });

      const results: PromptSearchResult[] = rows.map((row) => ({
        prompt_id: row.id,
        user_id: row.user_id,
        name: row.name,
        slug: row.slug,
        prompt_preview: row.prompt.length > 200 ? row.prompt.substring(0, 200) + '...' : row.prompt,
        description: row.description || '',
        is_public: row.is_public,
        similarity_score: row.rank || 0,
      }));

      return { success: true, results, total: results.length, search_type: 'text' };
    } catch (error: unknown) {
      const err = error as Error;
      log.error('Text search failed:', err);
      throw new Error(`Search failed: ${err.message}`);
    }
  }
}

let promptVectorServiceInstance: PromptVectorService | null = null;

export function getPromptVectorService(): PromptVectorService {
  if (!promptVectorServiceInstance) {
    promptVectorServiceInstance = new PromptVectorService();
  }
  return promptVectorServiceInstance;
}

export { PromptVectorService };
export default PromptVectorService;
