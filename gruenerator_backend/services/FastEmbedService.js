import { embeddingCache } from './embeddingCache.js';
import { embeddingClient } from './EmbeddingClient.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * FastEmbed Service - Client wrapper for the standalone embedding server
 * Uses EmbeddingClient to communicate with the embedding server instead of loading models directly
 * This prevents multiple model instances and OOM issues
 */
class FastEmbedService {
  constructor() {
    this.client = embeddingClient;
    this.isInitialized = false;
    this.modelInfo = null;
    
    // Initialize client on startup
    this.init();
  }

  /**
   * Initialize FastEmbed service by waiting for embedding server
   */
  async init() {
    if (this.isInitialized) return;

    try {
      console.log(`[FastEmbedService] Connecting to embedding server...`);
      
      // Wait for the embedding server to be ready
      const serverReady = await this.client.waitForServer();
      
      if (!serverReady) {
        throw new Error('Embedding server did not become ready');
      }
      
      // Get model information from server
      this.modelInfo = await this.client.getModelInfo();
      this.isInitialized = true;
      
      console.log(`[FastEmbedService] Connected to embedding server successfully`);
      console.log(`[FastEmbedService] Model: ${this.modelInfo.modelName}`);
      console.log(`[FastEmbedService] Dimensions: ${this.modelInfo.dimensions}, Max length: ${this.modelInfo.maxSequenceLength}`);
      
    } catch (error) {
      console.error('[FastEmbedService] Failed to connect to embedding server:', error);
      console.warn('[FastEmbedService] Service will operate in degraded mode');
      this.isInitialized = false;
    }
  }


  /**
   * Generate embeddings for a single text
   * @param {string} text - Text to generate embedding for
   * @returns {Promise<number[]>} Embedding vector
   */
  async generateEmbedding(text) {
    if (!text || typeof text !== 'string') {
      throw new Error('Text is required and must be a string');
    }

    if (!this.isInitialized) {
      console.warn('[FastEmbedService] Service not initialized, attempting to reconnect...');
      await this.init();
      
      if (!this.isInitialized) {
        throw new Error('FastEmbed service is not available');
      }
    }

    try {
      return await this.client.generateEmbedding(text);
    } catch (error) {
      console.error('[FastEmbedService] Error generating embedding:', error);
      throw new Error(`Embedding generation failed: ${error.message}`);
    }
  }

  /**
   * Generate embeddings for multiple texts in a batch
   * @param {string[]} texts - Array of texts to generate embeddings for
   * @param {string} inputType - Type of input (maintained for compatibility)
   * @returns {Promise<number[][]>} Array of embedding vectors
   */
  async generateBatchEmbeddings(texts, inputType = 'search_document') {
    if (!Array.isArray(texts) || texts.length === 0) {
      throw new Error('Texts must be a non-empty array');
    }

    if (!this.isInitialized) {
      console.warn('[FastEmbedService] Service not initialized, attempting to reconnect...');
      await this.init();
      
      if (!this.isInitialized) {
        throw new Error('FastEmbed service is not available');
      }
    }

    try {
      return await this.client.generateBatchEmbeddings(texts, inputType);
    } catch (error) {
      console.error('[FastEmbedService] Batch embedding generation failed:', error);
      throw new Error(`Batch embedding generation failed: ${error.message}`);
    }
  }

  /**
   * Generate embedding for a search query with caching
   * @param {string} query - Search query text
   * @returns {Promise<number[]>} Embedding vector
   */
  async generateQueryEmbedding(query) {
    if (!query || typeof query !== 'string') {
      throw new Error('Query is required and must be a string');
    }

    // Check cache first
    const cachedEmbedding = await embeddingCache.getCachedEmbedding(query);
    if (cachedEmbedding) {
      return cachedEmbedding;
    }

    // Generate new embedding using client
    const embedding = await this.client.generateQueryEmbedding(query);
    
    // Cache the result
    await embeddingCache.cacheEmbedding(query, embedding);
    
    return embedding;
  }

  /**
   * Estimate token count for text
   * @param {string} text - Text to estimate tokens for
   * @returns {number} Estimated token count
   */
  estimateTokenCount(text) {
    return this.client.estimateTokenCount(text);
  }

  /**
   * Get model information
   * @returns {Object} Model information
   */
  getModelInfo() {
    if (this.modelInfo) {
      return {
        ...this.modelInfo,
        isInitialized: this.isInitialized
      };
    }
    
    return {
      isInitialized: this.isInitialized,
      serverConnected: this.isInitialized
    };
  }

  /**
   * Get embedding dimensions
   * @returns {number} Number of dimensions
   */
  getDimensions() {
    if (this.modelInfo) {
      return this.modelInfo.dimensions;
    }
    return 1024; // Default for multilingual-e5-large
  }

  /**
   * Check if service is ready
   * @returns {boolean} True if ready
   */
  isReady() {
    return this.isInitialized;
  }

  /**
   * Cleanup resources (no-op for client)
   */
  async cleanup() {
    this.isInitialized = false;
    this.modelInfo = null;
    console.log('[FastEmbedService] Client cleaned up');
  }
}

// Export singleton instance
export const fastEmbedService = new FastEmbedService();