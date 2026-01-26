/**
 * Mistral Embedding Service - Client wrapper for the Mistral embedding service
 * Uses MistralEmbeddingClient to communicate with Mistral API
 * Provides caching and batch processing capabilities
 */

import MistralEmbeddingClient from './MistralEmbeddingClient.js';
import { embeddingCache } from './embeddingCache.js';
import {
  validateText,
  generateSingleEmbedding,
  generateBatchEmbeddings,
  generateMockEmbedding,
  generateMockBatchEmbeddings,
  estimateTokenCount,
} from './embeddingOperations.js';
import type { ModelInfo } from './types.js';

/**
 * MistralEmbeddingService class
 * Provides embedding generation with Mistral API integration and caching
 */
export class MistralEmbeddingService {
  private client: MistralEmbeddingClient;
  private modelInfo: ModelInfo;
  private isInitialized: boolean;

  constructor() {
    // Mistral is the sole embedding backend (1024-dim)
    this.client = new MistralEmbeddingClient({ model: 'mistral-embed' });
    this.modelInfo = {
      modelName: 'mistral-embed',
      dimensions: 1024,
      maxSequenceLength: 8192,
      isInitialized: true,
    };
    this.isInitialized = true;
  }

  /**
   * Initialize MistralEmbeddingService (no-op for Mistral client)
   */
  async init(): Promise<void> {
    return;
  }

  /**
   * Generate embeddings for a single text
   */
  async generateEmbedding(text: string): Promise<number[]> {
    return await generateSingleEmbedding(this.client, text);
  }

  /**
   * Generate embeddings for multiple texts in a batch
   */
  async generateBatchEmbeddings(
    texts: string[],
    inputType: string = 'search_document'
  ): Promise<number[][]> {
    return await generateBatchEmbeddings(this.client, texts, inputType);
  }

  /**
   * Generate a mock embedding when embedding server is unavailable
   */
  generateMockEmbedding(text: string): number[] {
    return generateMockEmbedding(text, this.modelInfo.dimensions);
  }

  /**
   * Generate mock embeddings for multiple texts
   */
  generateMockBatchEmbeddings(texts: string[]): number[][] {
    return generateMockBatchEmbeddings(texts, this.modelInfo.dimensions);
  }

  /**
   * Generate embedding for a search query with caching
   */
  async generateQueryEmbedding(query: string): Promise<number[]> {
    validateText(query);

    // Check cache first
    const cachedEmbedding = await embeddingCache.getCachedEmbedding(query);
    if (cachedEmbedding) {
      return cachedEmbedding;
    }

    // Generate new embedding using client
    console.log(
      `[MistralEmbeddingService] Generating embedding for "${query.substring(0, 50)}..."`
    );
    const startTime = Date.now();
    const embedding = await this.client.generateEmbedding(query);
    const duration = Date.now() - startTime;
    console.log(
      `[MistralEmbeddingService] Embedding generated in ${duration}ms (${embedding.length} dims)`
    );

    // Cache the result
    await embeddingCache.cacheEmbedding(query, embedding);
    return embedding;
  }

  /**
   * Estimate token count for text
   */
  estimateTokenCount(text: string): number {
    return estimateTokenCount(text);
  }

  /**
   * Get model information
   */
  getModelInfo(): ModelInfo {
    return {
      ...this.modelInfo,
      isInitialized: this.isInitialized,
    };
  }

  /**
   * Get embedding dimensions
   */
  getDimensions(): number {
    return this.modelInfo?.dimensions || 768;
  }

  /**
   * Check if service is ready
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Cleanup resources (no-op for client)
   */
  async cleanup(): Promise<void> {
    this.isInitialized = false;
    console.log('[MistralEmbeddingService] Client cleaned up');
  }
}
