/**
 * QdrantService - Main Vector Database Service Class
 *
 * Orchestrates all Qdrant operations through modular components.
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import * as http from 'http';
import * as https from 'https';
import * as dotenv from 'dotenv';
import { createLogger } from '../../../utils/logger.js';
import { mistralEmbeddingService } from '../../../services/mistral/index.js';
import {
  COLLECTION_SCHEMAS,
  TEXT_SEARCH_COLLECTIONS,
  TEXT_SEARCH_INDEXES,
  getCollectionConfig,
  getIndexSchema
} from '../../../config/qdrantCollectionsSchema.js';

import type { CollectionNames, CollectionKey, CollectionStats } from './types.js';

import {
  createCollections,
  createTextSearchIndexes,
  getCollectionStats as getStats,
  getAllStats as getAllCollectionStats,
  createSnapshot as createDbSnapshot,
  type SnapshotResult
} from './collections.js';

import {
  indexDocumentChunks as indexDocChunks,
  indexGrundsatzChunks as indexGrundsatz,
  indexBundestagContent as indexBundestag,
  indexGrueneDeContent as indexGrueneDe,
  indexGrueneAtContent as indexGrueneAt,
  indexContentExample as indexContent,
  indexSocialMediaExample as indexSocial,
  type DocumentChunk,
  type GrundsatzChunk,
  type WebContentChunk,
  type WebContentMetadata,
  type ContentExampleMetadata,
  type SocialMediaIndexMetadata
} from './indexing.js';

import {
  searchDocuments as searchDocs,
  searchContentExamples as searchContent,
  searchSocialMediaExamples as searchSocial,
  buildContentExampleFilter,
  buildSocialMediaFilter,
  type DocumentSearchOptions,
  type ContentExampleSearchOptions,
  type SocialMediaSearchOptions,
  type SearchResponse,
  type SearchResult,
  type ContentExampleResult,
  type SocialMediaResult
} from './search.js';

import {
  deleteDocument as deleteDocs,
  deleteUserVectors as deleteUser,
  deleteBundestagContentByUrl as deleteBundestag,
  deleteGrueneDeContentByUrl as deleteGrueneDe,
  deleteGrueneAtContentByUrl as deleteGrueneAt,
  deleteContentExample as deleteContent
} from './deletion.js';

import {
  getUniqueFieldValues as getUnique,
  getFieldValueCounts as getFieldCounts,
  getDateRange as getRange,
  getAllUrls,
  type FieldValueCount,
  type DateRange
} from './facets.js';

import {
  getRandomContentExamples as getRandomContent,
  getRandomSocialMediaExamples as getRandomSocial,
  type RandomContentExampleOptions,
  type RandomSocialMediaOptions
} from './random.js';

const log = createLogger('Qdrant');

dotenv.config({ path: undefined });

/**
 * Qdrant Vector Database Service
 * Handles all vector operations for document embeddings and similarity search
 */
export class QdrantService {
  client: QdrantClient | null = null;
  isConnected: boolean = false;
  isInitializing: boolean = false;
  initPromise: Promise<void> | null = null;
  vectorSize: number = 0;
  lastHealthCheck: number = 0;
  healthCheckInterval: number = 30000;

  collections: CollectionNames = {
    documents: 'documents',
    grundsatz_documents: 'grundsatz_documents',
    oesterreich_gruene_documents: 'oesterreich_gruene_documents',
    user_knowledge: 'user_knowledge',
    content_examples: 'content_examples',
    social_media_examples: 'social_media_examples',
    user_texts: 'user_texts',
    notebook_collections: 'notebook_collections',
    notebook_collection_documents: 'notebook_collection_documents',
    notebook_usage_logs: 'notebook_usage_logs',
    notebook_public_access: 'notebook_public_access',
    oparl_papers: 'oparl_papers',
    kommunalwiki_documents: 'kommunalwiki_documents',
    bundestag_content: 'bundestag_content',
    gruene_de_documents: 'gruene_de_documents',
    gruene_at_documents: 'gruene_at_documents'
  };

  constructor() {
    this._startInitialization();
  }

  private _startInitialization(): void {
    setTimeout(() => {
      this.initPromise = this._performInit();
    }, 0);
  }

  async init(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    if (this.isConnected) {
      return Promise.resolve();
    }

    this.initPromise = this._performInit();

    try {
      await this.initPromise;
    } catch (error) {
      this.initPromise = null;
      throw error;
    }
  }

  private async _performInit(): Promise<void> {
    if (this.isInitializing || this.isConnected) {
      return;
    }

    this.isInitializing = true;

    try {
      const apiKey = process.env.QDRANT_API_KEY;
      const qdrantUrl = process.env.QDRANT_URL;

      if (!apiKey || apiKey.trim() === '') {
        throw new Error('QDRANT_API_KEY environment variable is required but not set or empty');
      }

      log.debug(`Connecting to ${qdrantUrl}`);

      const isHttps = qdrantUrl?.startsWith('https') ?? false;
      const AgentClass = isHttps ? https.Agent : http.Agent;
      const httpAgent = new AgentClass({
        keepAlive: true,
        keepAliveMsecs: 1000,
        maxSockets: 10,
        maxFreeSockets: 5,
        timeout: 30000
      });

      const basicAuthUsername = process.env.QDRANT_BASIC_AUTH_USERNAME;
      const basicAuthPassword = process.env.QDRANT_BASIC_AUTH_PASSWORD;
      const headers: Record<string, string> = {};

      if (basicAuthUsername && basicAuthPassword) {
        const basicAuth = Buffer.from(`${basicAuthUsername}:${basicAuthPassword}`).toString('base64');
        headers['Authorization'] = `Basic ${basicAuth}`;
      }

      if (qdrantUrl?.startsWith('https://')) {
        const url = new URL(qdrantUrl);
        const port = url.port ? parseInt(url.port) : 443;
        const basePath = url.pathname && url.pathname !== '/' ? url.pathname : undefined;

        this.client = new QdrantClient({
          host: url.hostname,
          port: port,
          https: true,
          apiKey: apiKey,
          timeout: 60000,
          checkCompatibility: false,
          ...(Object.keys(headers).length > 0 ? { headers } : {}),
          ...(basePath ? { prefix: basePath } : {})
        });
      } else {
        this.client = new QdrantClient({
          url: qdrantUrl,
          apiKey: apiKey,
          https: false,
          timeout: 60000,
          ...(Object.keys(headers).length > 0 ? { headers } : {})
        });
      }

      await this.testConnectionWithRetry();

      await mistralEmbeddingService.init();
      this.vectorSize = mistralEmbeddingService.getDimensions();

      await createCollections(
        this.client,
        this.vectorSize,
        this.collections,
        COLLECTION_SCHEMAS,
        getCollectionConfig,
        getIndexSchema,
        log
      );

      await createTextSearchIndexes(
        this.client,
        this.collections,
        TEXT_SEARCH_COLLECTIONS,
        TEXT_SEARCH_INDEXES,
        getIndexSchema,
        log
      );

      this.isConnected = true;
      this.isInitializing = false;
      this.lastHealthCheck = Date.now();
      log.info('Connected');

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`Init failed: ${message}`);
      this.isConnected = false;
      this.isInitializing = false;
      log.warn('Vector search will be disabled');
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.client?.getCollections();
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Qdrant connection failed: ${message}`);
    }
  }

  async testConnectionWithRetry(): Promise<boolean> {
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.client?.getCollections();
        log.debug(`Connection test successful (attempt ${attempt})`);
        return true;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        log.debug(`Connection attempt ${attempt}/${maxRetries} failed: ${lastError.message}`);

        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw new Error(`Qdrant connection failed after ${maxRetries} attempts: ${lastError?.message}`);
  }

  async ensureConnection(): Promise<void> {
    const now = Date.now();

    if (now - this.lastHealthCheck < this.healthCheckInterval) {
      return;
    }

    try {
      if (!this.isConnected) {
        log.debug('Connection lost, reconnecting...');
        this.initPromise = null;
        await this.init();
        return;
      }

      await this.client?.getCollections();
      this.lastHealthCheck = now;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.debug(`Health check failed: ${message}`);

      if (message.includes('SSL') || message.includes('wrong version')) {
        log.debug('SSL error detected, forcing full reconnection...');
        this.client = null;
        this.isConnected = false;
        this.isInitializing = false;
        this.initPromise = null;
      } else {
        this.isConnected = false;
        this.initPromise = null;
      }

      await this.init();
    }
  }

  async isAvailable(): Promise<boolean> {
    if (this.isConnected && this.client !== null) {
      return true;
    }

    if (this.initPromise) {
      try {
        await this.initPromise;
        return this.isConnected && this.client !== null;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.warn(`Initialization failed: ${message}`);
        return false;
      }
    }

    if (!this.isInitializing) {
      log.debug('Starting deferred initialization...');
      this.initPromise = this._performInit();
      try {
        await this.initPromise;
        return this.isConnected && this.client !== null;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.warn(`Initialization failed: ${message}`);
        return false;
      }
    }

    return false;
  }

  isAvailableSync(): boolean {
    return this.isConnected && this.client !== null;
  }

  async ensureConnected(): Promise<void> {
    const available = await this.isAvailable();
    if (!available) {
      throw new Error('Qdrant is not available. Vector search functionality is disabled.');
    }
  }

  ensureConnectedSync(): void {
    if (!this.isAvailableSync()) {
      throw new Error('Qdrant is not available. Vector search functionality is disabled.');
    }
  }

  // ============ Indexing Methods ============

  async indexDocumentChunks(
    documentId: string,
    chunks: DocumentChunk[],
    userId: string | null = null,
    collectionName: string | null = null
  ): Promise<{ success: boolean; chunks: number }> {
    await this.ensureConnected();
    return indexDocChunks(
      this.client!,
      collectionName || this.collections.documents,
      documentId,
      chunks,
      userId
    );
  }

  async indexGrundsatzChunks(documentId: string, chunks: GrundsatzChunk[]): Promise<{ success: boolean; chunks: number }> {
    await this.ensureConnected();
    return indexGrundsatz(
      this.client!,
      this.collections.grundsatz_documents,
      documentId,
      chunks
    );
  }

  async indexBundestagContent(
    url: string,
    chunks: WebContentChunk[],
    metadata: WebContentMetadata = {}
  ): Promise<{ success: boolean; chunks: number }> {
    await this.ensureConnected();
    return indexBundestag(
      this.client!,
      this.collections.bundestag_content,
      url,
      chunks,
      metadata
    );
  }

  async indexGrueneDeContent(
    url: string,
    chunks: WebContentChunk[],
    metadata: WebContentMetadata = {}
  ): Promise<{ success: boolean; chunks: number }> {
    await this.ensureConnected();
    return indexGrueneDe(
      this.client!,
      this.collections.gruene_de_documents,
      url,
      chunks,
      metadata
    );
  }

  async indexGrueneAtContent(
    url: string,
    chunks: WebContentChunk[],
    metadata: WebContentMetadata = {}
  ): Promise<{ success: boolean; chunks: number }> {
    await this.ensureConnected();
    return indexGrueneAt(
      this.client!,
      this.collections.gruene_at_documents,
      url,
      chunks,
      metadata
    );
  }

  async indexContentExample(
    exampleId: string,
    embedding: number[],
    metadata: ContentExampleMetadata
  ): Promise<{ success: boolean }> {
    await this.ensureConnected();
    return indexContent(
      this.client!,
      this.collections.content_examples,
      exampleId,
      embedding,
      metadata
    );
  }

  async indexSocialMediaExample(
    exampleId: string,
    embedding: number[],
    content: string,
    platform: 'facebook' | 'instagram',
    metadata: SocialMediaIndexMetadata = {}
  ): Promise<{ success: boolean }> {
    await this.ensureConnected();
    return indexSocial(
      this.client!,
      this.collections.social_media_examples,
      exampleId,
      embedding,
      content,
      platform,
      metadata
    );
  }

  // ============ Search Methods ============

  async searchDocuments(queryVector: number[], options: DocumentSearchOptions = {}): Promise<SearchResponse<SearchResult>> {
    await this.ensureConnected();
    return searchDocs(
      this.client!,
      options.collection || this.collections.documents,
      queryVector,
      options
    );
  }

  async searchGrundsatzDocuments(queryVector: number[], options: DocumentSearchOptions = {}): Promise<SearchResponse<SearchResult>> {
    return this.searchDocuments(queryVector, {
      ...options,
      collection: this.collections.grundsatz_documents
    });
  }

  async searchBundestagDocuments(queryVector: number[], options: DocumentSearchOptions = {}): Promise<SearchResponse<SearchResult>> {
    return this.searchDocuments(queryVector, {
      ...options,
      collection: this.collections.bundestag_content
    });
  }

  async searchGrueneDeDocuments(queryVector: number[], options: DocumentSearchOptions = {}): Promise<SearchResponse<SearchResult>> {
    return this.searchDocuments(queryVector, {
      ...options,
      collection: this.collections.gruene_de_documents
    });
  }

  async searchGrueneAtDocuments(queryVector: number[], options: DocumentSearchOptions = {}): Promise<SearchResponse<SearchResult>> {
    return this.searchDocuments(queryVector, {
      ...options,
      collection: this.collections.gruene_at_documents
    });
  }

  async searchContentExamples(queryVector: number[], options: ContentExampleSearchOptions = {}): Promise<SearchResponse<ContentExampleResult>> {
    await this.ensureConnected();
    return searchContent(
      this.client!,
      this.collections.content_examples,
      queryVector,
      options
    );
  }

  async searchSocialMediaExamples(queryVector: number[], options: SocialMediaSearchOptions = {}): Promise<SearchResponse<SocialMediaResult>> {
    await this.ensureConnected();
    return searchSocial(
      this.client!,
      this.collections.social_media_examples,
      queryVector,
      options
    );
  }

  async searchFacebookExamples(queryVector: number[], options: Omit<SocialMediaSearchOptions, 'platform'> = {}): Promise<SearchResponse<SocialMediaResult>> {
    return this.searchSocialMediaExamples(queryVector, { ...options, platform: 'facebook' });
  }

  async searchInstagramExamples(queryVector: number[], options: Omit<SocialMediaSearchOptions, 'platform'> = {}): Promise<SearchResponse<SocialMediaResult>> {
    return this.searchSocialMediaExamples(queryVector, { ...options, platform: 'instagram' });
  }

  // ============ Deletion Methods ============

  async deleteDocument(documentId: string, collection?: string): Promise<{ success: boolean; collection: string }> {
    await this.ensureConnected();
    return deleteDocs(
      this.client!,
      collection || this.collections.documents,
      documentId
    );
  }

  async deleteUserVectors(userId: string): Promise<{ success: boolean; collections: string[]; results: unknown[] }> {
    await this.ensureConnected();
    return deleteUser(
      this.client!,
      [this.collections.documents, this.collections.user_knowledge],
      userId
    );
  }

  async deleteBundestagContentByUrl(url: string): Promise<{ success: boolean; collection: string }> {
    await this.ensureConnected();
    return deleteBundestag(
      this.client!,
      this.collections.bundestag_content,
      url
    );
  }

  async deleteGrueneDeContentByUrl(url: string): Promise<{ success: boolean; collection: string }> {
    await this.ensureConnected();
    return deleteGrueneDe(
      this.client!,
      this.collections.gruene_de_documents,
      url
    );
  }

  async deleteGrueneAtContentByUrl(url: string): Promise<{ success: boolean; collection: string }> {
    await this.ensureConnected();
    return deleteGrueneAt(
      this.client!,
      this.collections.gruene_at_documents,
      url
    );
  }

  async deleteContentExample(exampleId: string): Promise<{ success: boolean; collection: string }> {
    await this.ensureConnected();
    return deleteContent(
      this.client!,
      this.collections.content_examples,
      exampleId
    );
  }

  // ============ Random Sampling Methods ============

  async getRandomContentExamples(options: RandomContentExampleOptions = {}): Promise<ContentExampleResult[]> {
    await this.ensureConnected();
    return getRandomContent(
      this.client!,
      this.collections.content_examples,
      options,
      buildContentExampleFilter
    );
  }

  async getRandomSocialMediaExamples(options: RandomSocialMediaOptions = {}): Promise<SocialMediaResult[]> {
    await this.ensureConnected();
    return getRandomSocial(
      this.client!,
      this.collections.social_media_examples,
      options,
      buildSocialMediaFilter
    );
  }

  // ============ Faceted Search Methods ============

  async getUniqueFieldValues(
    collectionName: string,
    fieldName: string,
    maxValues: number = 50
  ): Promise<string[]> {
    await this.ensureConnected();
    return getUnique(this.client!, collectionName, fieldName, maxValues);
  }

  async getFieldValueCounts(
    collectionName: string,
    fieldName: string,
    maxValues: number = 50,
    baseFilter: Record<string, unknown> | null = null
  ): Promise<FieldValueCount[]> {
    await this.ensureConnected();
    return getFieldCounts(this.client!, collectionName, fieldName, maxValues, baseFilter);
  }

  async getDateRange(collectionName: string, fieldName: string): Promise<DateRange> {
    await this.ensureConnected();
    return getRange(this.client!, collectionName, fieldName);
  }

  async getAllBundestagUrls(): Promise<Array<{ source_url: string; content_hash: string | null }>> {
    await this.ensureConnected();
    return getAllUrls(this.client!, this.collections.bundestag_content);
  }

  async getAllGrueneDeUrls(): Promise<Array<{ source_url: string; content_hash: string | null }>> {
    await this.ensureConnected();
    return getAllUrls(this.client!, this.collections.gruene_de_documents);
  }

  async getAllGrueneAtUrls(): Promise<Array<{ source_url: string; content_hash: string | null }>> {
    await this.ensureConnected();
    return getAllUrls(this.client!, this.collections.gruene_at_documents);
  }

  // ============ Collection Statistics ============

  async getCollectionStats(collection?: string): Promise<CollectionStats> {
    await this.ensureConnected();
    return getStats(this.client!, collection || this.collections.documents);
  }

  async getAllStats(): Promise<Record<CollectionKey, CollectionStats>> {
    await this.ensureConnected();
    return getAllCollectionStats(this.client!, this.collections);
  }

  async createSnapshot(collectionName?: string): Promise<SnapshotResult> {
    await this.ensureConnected();
    // Default to the documents collection if none specified
    const collection = collectionName || this.collections.documents;
    return createDbSnapshot(this.client!, collection);
  }
}

// Singleton instance
let qdrantInstance: QdrantService | null = null;

export function getQdrantInstance(): QdrantService {
  if (!qdrantInstance) {
    qdrantInstance = new QdrantService();
  }
  return qdrantInstance;
}

export default QdrantService;
