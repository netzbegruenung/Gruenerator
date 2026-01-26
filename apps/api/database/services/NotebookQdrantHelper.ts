/**
 * NotebookQdrantHelper - Notebook Collections specific Qdrant operations
 * Handles Notebook collection CRUD operations in Qdrant vector database
 */

import { QdrantService, getQdrantInstance } from './QdrantService/index.js';
import { QdrantOperations } from './QdrantService/operations/index.js';
import type { QdrantFilter } from './QdrantService/types.js';
import { mistralEmbeddingService } from '../../services/mistral/index.js';
import { getSystemCollectionConfig } from '../../config/systemCollectionsConfig.js';
import { createLogger } from '../../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';

const logger = createLogger('NotebookQdrantHelper');

// =============================================================================
// Type Interfaces
// =============================================================================

interface NotebookCollectionData {
  id?: string;
  user_id: string;
  name: string;
  description?: string | null;
  custom_prompt?: string | null;
  selection_mode?: 'documents' | string;
  wolke_share_link_ids?: string[] | null;
  auto_sync?: boolean;
  remove_missing_on_sync?: boolean;
  is_active?: boolean;
  settings?: Record<string, unknown>;
  document_count?: number;
  last_used_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

interface NotebookCollection {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  custom_prompt: string | null;
  selection_mode: string;
  wolke_share_link_ids: string[];
  auto_sync: boolean;
  remove_missing_on_sync: boolean;
  created_at: string;
  updated_at: string;
  is_active: boolean;
  settings: Record<string, unknown>;
  document_count: number;
  last_used_at: string | null;
  notebook_collection_documents?: CollectionDocument[];
}

interface CollectionDocument {
  document_id: string;
  added_at: string;
  added_by: string | null;
}

interface PublicAccessData {
  collection_id: string;
  access_token: string;
  created_at: string;
  expires_at: string | null;
  created_by: string | null;
  is_active: boolean;
  view_count: number;
  last_accessed_at: string | null;
}

interface UsageLogMetadata {
  ip_address?: string | null;
  user_agent?: string | null;
}

interface BulkDeleteResult {
  deleted: string[];
  failed: Array<{ id: string; error: string }>;
}

interface GetCollectionsOptions {
  limit?: number;
  offset?: number;
}

interface QdrantPoint {
  id: number;
  vector: number[];
  payload: Record<string, unknown>;
}

interface ScrollPoint {
  id: string | number;
  payload: Record<string, unknown>;
}

// =============================================================================
// NotebookQdrantHelper Class
// =============================================================================

class NotebookQdrantHelper {
  private qdrant: QdrantService;
  private qdrantOps: QdrantOperations | null;
  private initialized: boolean;

  constructor() {
    this.qdrant = getQdrantInstance();
    this.qdrantOps = null;
    this.initialized = false;
  }

  /**
   * Ensure service is initialized
   */
  async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.qdrant.init();
      this.qdrantOps = new QdrantOperations(this.qdrant.client!);
      this.initialized = true;
    }
  }

  /**
   * Generate numeric ID from UUID
   */
  generateNumericId(uuid: string): number {
    const hash = crypto.createHash('md5').update(uuid).digest('hex');
    return parseInt(hash.substring(0, 8), 16);
  }

  /**
   * Generate dummy vector for non-vector collections
   */
  generateDummyVector(): number[] {
    return new Array(this.qdrant.vectorSize || 1024).fill(0.1);
  }

  /**
   * Generate embedding for Notebook collection metadata
   */
  async generateCollectionEmbedding(
    name: string,
    description: string = '',
    customPrompt: string = ''
  ): Promise<number[]> {
    await mistralEmbeddingService.init();
    const text = `${name} ${description} ${customPrompt}`.trim();
    return await mistralEmbeddingService.generateEmbedding(text);
  }

  /**
   * Store Notebook collection in Qdrant
   */
  async storeNotebookCollection(
    collectionData: NotebookCollectionData
  ): Promise<{ success: boolean; collection_id: string }> {
    await this.ensureInitialized();

    try {
      const collectionId = collectionData.id || uuidv4();
      const embedding = await this.generateCollectionEmbedding(
        collectionData.name,
        collectionData.description || '',
        collectionData.custom_prompt || ''
      );

      const point: QdrantPoint = {
        id: this.generateNumericId(collectionId),
        vector: embedding,
        payload: {
          collection_id: collectionId,
          user_id: collectionData.user_id,
          name: collectionData.name,
          description: collectionData.description || null,
          custom_prompt: collectionData.custom_prompt || null,
          selection_mode: collectionData.selection_mode || 'documents',
          wolke_share_link_ids: collectionData.wolke_share_link_ids || null,
          auto_sync: collectionData.auto_sync === true,
          remove_missing_on_sync: collectionData.remove_missing_on_sync === true,
          created_at: collectionData.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
          is_active: collectionData.is_active !== false,
          settings: collectionData.settings || {},
          document_count: collectionData.document_count || 0,
          last_used_at: collectionData.last_used_at || null,
        },
      };

      await this.qdrantOps!.batchUpsert(this.qdrant.collections.notebook_collections, [point]);

      logger.info(`Stored Notebook collection: ${collectionId}`);
      return { success: true, collection_id: collectionId };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Error storing Notebook collection: ${message}`);
      throw new Error(`Failed to store Notebook collection: ${message}`);
    }
  }

  /**
   * Get Notebook collection by ID
   */
  async getNotebookCollection(collectionId: string): Promise<NotebookCollection | null> {
    await this.ensureInitialized();

    try {
      const filter: QdrantFilter = {
        must: [{ key: 'collection_id', match: { value: collectionId } }],
      };

      const results = await this.qdrantOps!.scrollDocuments(
        this.qdrant.collections.notebook_collections,
        filter,
        { limit: 1, withPayload: true }
      );

      if (results.length === 0) {
        return null;
      }

      return this.formatCollectionFromPayload(results[0].payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Error getting Notebook collection: ${message}`);
      throw new Error(`Failed to get Notebook collection: ${message}`);
    }
  }

  /**
   * Get user's Notebook collections
   */
  async getUserNotebookCollections(
    userId: string,
    options: GetCollectionsOptions = {}
  ): Promise<NotebookCollection[]> {
    await this.ensureInitialized();

    try {
      const { limit = 100, offset = 0 } = options;

      const filter: QdrantFilter = {
        must: [{ key: 'user_id', match: { value: userId } }],
      };

      const results = await this.qdrantOps!.scrollDocuments(
        this.qdrant.collections.notebook_collections,
        filter,
        { limit, offset, withPayload: true }
      );

      const collections = results.map((result: ScrollPoint) =>
        this.formatCollectionFromPayload(result.payload)
      );

      // Get document associations for each collection
      for (const collection of collections) {
        const documents = await this.getCollectionDocuments(collection.id);
        collection.notebook_collection_documents = documents;
        collection.document_count = documents.length;
      }

      return collections;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Error getting user Notebook collections: ${message}`);
      throw new Error(`Failed to get user Notebook collections: ${message}`);
    }
  }

  /**
   * Update Notebook collection
   */
  async updateNotebookCollection(
    collectionId: string,
    updateData: Partial<NotebookCollectionData>
  ): Promise<{ success: boolean }> {
    await this.ensureInitialized();

    try {
      // First get existing collection
      const existingCollection = await this.getNotebookCollection(collectionId);
      if (!existingCollection) {
        throw new Error('Notebook collection not found');
      }

      // Merge with updates
      const updatedData: NotebookCollectionData = {
        ...existingCollection,
        ...updateData,
        id: collectionId,
        updated_at: new Date().toISOString(),
      };

      // Store updated collection
      await this.storeNotebookCollection(updatedData);

      logger.info(`Updated Notebook collection: ${collectionId}`);
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Error updating Notebook collection: ${message}`);
      throw new Error(`Failed to update Notebook collection: ${message}`);
    }
  }

  /**
   * Delete Notebook collection
   */
  async deleteNotebookCollection(collectionId: string): Promise<{ success: boolean }> {
    await this.ensureInitialized();

    try {
      // Delete collection
      const collectionFilter: QdrantFilter = {
        must: [{ key: 'collection_id', match: { value: collectionId } }],
      };
      await this.qdrantOps!.batchDelete(
        this.qdrant.collections.notebook_collections,
        collectionFilter
      );

      // Delete document associations
      const docsFilter: QdrantFilter = {
        must: [{ key: 'collection_id', match: { value: collectionId } }],
      };
      await this.qdrantOps!.batchDelete(
        this.qdrant.collections.notebook_collection_documents,
        docsFilter
      );

      // Delete public access tokens
      const accessFilter: QdrantFilter = {
        must: [{ key: 'collection_id', match: { value: collectionId } }],
      };
      await this.qdrantOps!.batchDelete(
        this.qdrant.collections.notebook_public_access,
        accessFilter
      );

      logger.info(`Deleted Notebook collection: ${collectionId}`);
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Error deleting Notebook collection: ${message}`);
      throw new Error(`Failed to delete Notebook collection: ${message}`);
    }
  }

  /**
   * Add documents to Notebook collection
   */
  async addDocumentsToCollection(
    collectionId: string,
    documentIds: string[],
    addedBy: string | null = null
  ): Promise<{ success: boolean; added_count: number }> {
    await this.ensureInitialized();

    try {
      const points: QdrantPoint[] = documentIds.map((documentId) => ({
        id: this.generateNumericId(`${collectionId}_${documentId}`),
        vector: this.generateDummyVector(),
        payload: {
          collection_id: collectionId,
          document_id: documentId,
          added_at: new Date().toISOString(),
          added_by: addedBy,
        },
      }));

      await this.qdrantOps!.batchUpsert(
        this.qdrant.collections.notebook_collection_documents,
        points
      );

      logger.info(`Added ${documentIds.length} documents to collection: ${collectionId}`);
      return { success: true, added_count: documentIds.length };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Error adding documents to collection: ${message}`);
      throw new Error(`Failed to add documents to collection: ${message}`);
    }
  }

  /**
   * Remove documents from Notebook collection
   */
  async removeDocumentsFromCollection(
    collectionId: string,
    documentIds: string[]
  ): Promise<{ success: boolean; removed_count: number }> {
    await this.ensureInitialized();

    try {
      const filter: QdrantFilter = {
        must: [
          { key: 'collection_id', match: { value: collectionId } },
          { key: 'document_id', match: { any: documentIds } },
        ],
      };

      await this.qdrantOps!.batchDelete(
        this.qdrant.collections.notebook_collection_documents,
        filter
      );

      logger.info(`Removed ${documentIds.length} documents from collection: ${collectionId}`);
      return { success: true, removed_count: documentIds.length };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Error removing documents from collection: ${message}`);
      throw new Error(`Failed to remove documents from collection: ${message}`);
    }
  }

  /**
   * Get documents associated with a Notebook collection
   */
  async getCollectionDocuments(collectionId: string): Promise<CollectionDocument[]> {
    await this.ensureInitialized();

    try {
      const filter: QdrantFilter = {
        must: [{ key: 'collection_id', match: { value: collectionId } }],
      };

      const results = await this.qdrantOps!.scrollDocuments(
        this.qdrant.collections.notebook_collection_documents,
        filter,
        { limit: 1000, withPayload: true }
      );

      return results.map((result: ScrollPoint) => ({
        document_id: result.payload.document_id as string,
        added_at: result.payload.added_at as string,
        added_by: result.payload.added_by as string | null,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Error getting collection documents: ${message}`);
      return [];
    }
  }

  /**
   * Create public access token
   */
  async createPublicAccess(
    collectionId: string,
    createdBy: string | null = null,
    expiresAt: string | null = null
  ): Promise<{ success: boolean; access_token: string }> {
    await this.ensureInitialized();

    try {
      const accessToken = crypto.randomBytes(32).toString('hex');

      const point: QdrantPoint = {
        id: this.generateNumericId(accessToken),
        vector: this.generateDummyVector(),
        payload: {
          collection_id: collectionId,
          access_token: accessToken,
          created_at: new Date().toISOString(),
          expires_at: expiresAt,
          created_by: createdBy,
          is_active: true,
          view_count: 0,
          last_accessed_at: null,
        },
      };

      await this.qdrantOps!.batchUpsert(this.qdrant.collections.notebook_public_access, [point]);

      logger.info(`Created public access for collection: ${collectionId}`);
      return { success: true, access_token: accessToken };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Error creating public access: ${message}`);
      throw new Error(`Failed to create public access: ${message}`);
    }
  }

  /**
   * Get public access by token
   */
  async getPublicAccess(accessToken: string): Promise<PublicAccessData | null> {
    await this.ensureInitialized();

    try {
      const filter: QdrantFilter = {
        must: [{ key: 'access_token', match: { value: accessToken } }],
      };

      const results = await this.qdrantOps!.scrollDocuments(
        this.qdrant.collections.notebook_public_access,
        filter,
        { limit: 1, withPayload: true }
      );

      if (results.length === 0) {
        return null;
      }

      const payload = results[0].payload;
      return {
        collection_id: payload.collection_id as string,
        access_token: payload.access_token as string,
        created_at: payload.created_at as string,
        expires_at: payload.expires_at as string | null,
        created_by: payload.created_by as string | null,
        is_active: payload.is_active as boolean,
        view_count: payload.view_count as number,
        last_accessed_at: payload.last_accessed_at as string | null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Error getting public access: ${message}`);
      throw new Error(`Failed to get public access: ${message}`);
    }
  }

  /**
   * Revoke public access
   */
  async revokePublicAccess(collectionId: string): Promise<{ success: boolean }> {
    await this.ensureInitialized();

    try {
      const filter: QdrantFilter = {
        must: [{ key: 'collection_id', match: { value: collectionId } }],
      };

      await this.qdrantOps!.batchDelete(this.qdrant.collections.notebook_public_access, filter);

      logger.info(`Revoked public access for collection: ${collectionId}`);
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Error revoking public access: ${message}`);
      throw new Error(`Failed to revoke public access: ${message}`);
    }
  }

  /**
   * Log Notebook usage
   */
  async logNotebookUsage(
    collectionId: string,
    userId: string | null,
    question: string,
    answerLength: number,
    responseTime: number,
    metadata: UsageLogMetadata = {}
  ): Promise<{ success: boolean; error?: string }> {
    await this.ensureInitialized();

    try {
      // Generate embedding for the question for analytics
      await mistralEmbeddingService.init();
      const questionEmbedding = await mistralEmbeddingService.generateEmbedding(question);

      const point: QdrantPoint = {
        id: this.generateNumericId(uuidv4()),
        vector: questionEmbedding,
        payload: {
          collection_id: collectionId,
          user_id: userId,
          question: question,
          answer_length: answerLength,
          response_time_ms: responseTime,
          created_at: new Date().toISOString(),
          ip_address: metadata.ip_address || null,
          user_agent: metadata.user_agent || null,
        },
      };

      await this.qdrantOps!.batchUpsert(this.qdrant.collections.notebook_usage_logs, [point]);

      logger.info(`Logged Notebook usage for collection: ${collectionId}`);
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Error logging Notebook usage: ${message}`);
      // Don't throw error for logging failures
      return { success: false, error: message };
    }
  }

  /**
   * Format collection data from Qdrant payload
   */
  formatCollectionFromPayload(payload: Record<string, unknown>): NotebookCollection {
    return {
      id: payload.collection_id as string,
      user_id: payload.user_id as string,
      name: payload.name as string,
      description: payload.description as string | null,
      custom_prompt: payload.custom_prompt as string | null,
      selection_mode: (payload.selection_mode as string) || 'documents',
      wolke_share_link_ids: (payload.wolke_share_link_ids as string[]) || [],
      auto_sync: !!payload.auto_sync,
      remove_missing_on_sync: !!payload.remove_missing_on_sync,
      created_at: payload.created_at as string,
      updated_at: payload.updated_at as string,
      is_active: payload.is_active as boolean,
      settings: (payload.settings as Record<string, unknown>) || {},
      document_count: (payload.document_count as number) || 0,
      last_used_at: payload.last_used_at as string | null,
    };
  }

  /**
   * Bulk delete collections
   */
  async bulkDeleteCollections(
    collectionIds: string[],
    userId: string
  ): Promise<{ success: boolean; results: BulkDeleteResult }> {
    await this.ensureInitialized();

    try {
      const results: BulkDeleteResult = { deleted: [], failed: [] };

      for (const collectionId of collectionIds) {
        try {
          // Verify ownership
          const collection = await this.getNotebookCollection(collectionId);
          if (!collection || collection.user_id !== userId) {
            results.failed.push({ id: collectionId, error: 'Not found or access denied' });
            continue;
          }

          await this.deleteNotebookCollection(collectionId);
          results.deleted.push(collectionId);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          results.failed.push({ id: collectionId, error: message });
        }
      }

      return { success: true, results };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Error in bulk delete: ${message}`);
      throw new Error(`Bulk delete failed: ${message}`);
    }
  }

  /**
   * Create the system Grundsatz collection if it doesn't exist
   */
  async ensureSystemGrundsatzCollection(): Promise<{
    success: boolean;
    collection_id: string;
    created: boolean;
  }> {
    await this.ensureInitialized();

    const config = getSystemCollectionConfig('grundsatz-system');
    if (!config) throw new Error('System collection config not found for grundsatz-system');
    const systemCollectionId = config.id;

    try {
      // Check if the system collection already exists
      const existingCollection = await this.getNotebookCollection(systemCollectionId);
      if (existingCollection) {
        logger.info(`System Grundsatz collection already exists: ${systemCollectionId}`);
        return { success: true, collection_id: systemCollectionId, created: false };
      }

      // Import COMPREHENSIVE_DOSSIER_INSTRUCTIONS
      const { COMPREHENSIVE_DOSSIER_INSTRUCTIONS } = await import('../../utils/prompt/index.js');

      // Create the system Grundsatz collection using centralized config
      const systemCollectionData: NotebookCollectionData = {
        id: systemCollectionId,
        user_id: 'SYSTEM',
        name: config.name,
        description: config.description,
        custom_prompt: COMPREHENSIVE_DOSSIER_INSTRUCTIONS,
        selection_mode: 'documents',
        is_active: true,
        settings: {
          min_quality: config.minQuality,
          system_collection: true,
          allow_public: false,
        },
        created_at: new Date().toISOString(),
      };

      const result = await this.storeNotebookCollection(systemCollectionData);
      logger.info(`Created system Grundsatz collection: ${systemCollectionId}`);
      return { ...result, created: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Error creating system Grundsatz collection: ${message}`);
      throw new Error(`Failed to create system Grundsatz collection: ${message}`);
    }
  }
}

export { NotebookQdrantHelper };
export type {
  NotebookCollectionData,
  NotebookCollection,
  CollectionDocument,
  PublicAccessData,
  UsageLogMetadata,
  BulkDeleteResult,
  GetCollectionsOptions,
};
