import { embeddingCache } from './embeddingCache.js';
import MistralEmbeddingClient from './MistralEmbeddingClient.js';

/**
 * FastEmbed Service - Client wrapper for the standalone embedding server
 * Uses EmbeddingClient to communicate with the embedding server instead of loading models directly
 * This prevents multiple model instances and OOM issues
 */
class FastEmbedService {
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
   * Initialize FastEmbed service by waiting for embedding server
   */
  async init() { return; }


  /**
   * Generate embeddings for a single text
   * @param {string} text - Text to generate embedding for
   * @returns {Promise<number[]>} Embedding vector
   */
  async generateEmbedding(text) {
    if (!text || typeof text !== 'string') {
      throw new Error('Text is required and must be a string');
    }
    // Do not use mock fallbacks; surface errors
    return await this.client.generateEmbedding(text);
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
    
    console.log(`[FastEmbedService] Generating embeddings for ${texts.length} texts`);
    const startTime = Date.now();
    
    try {
      const embeddings = await this.client.generateBatchEmbeddings(texts);
      const duration = Date.now() - startTime;
      console.log(`[FastEmbedService] Successfully generated ${embeddings.length} embeddings in ${duration}ms`);
      return embeddings;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[FastEmbedService] Failed to generate embeddings after ${duration}ms:`, error.message);
      throw error;
    }
  }

  /**
   * Generate a mock embedding when embedding server is unavailable
   * @param {string} text - Text to generate mock embedding for
   * @returns {number[]} Mock embedding vector
   */
  generateMockEmbedding(text) {
    // Generate a deterministic mock embedding based on text hash
    const dimensions = 1024; // Default dimensions
    const mockEmbedding = new Array(dimensions);
    
    // Simple hash function to generate consistent mock values
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    // Generate mock embedding values based on hash
    for (let i = 0; i < dimensions; i++) {
      mockEmbedding[i] = (Math.sin(hash + i) * 0.1); // Small values similar to real embeddings
    }
    
    return mockEmbedding;
  }

  /**
   * Generate mock embeddings for multiple texts
   * @param {string[]} texts - Array of texts
   * @returns {number[][]} Array of mock embedding vectors
   */
  generateMockBatchEmbeddings(texts) {
    return texts.map(text => this.generateMockEmbedding(text));
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
    console.log(`[FastEmbedService] Generating embedding for "${query.substring(0, 50)}..."`);
    const startTime = Date.now();
    const embedding = await this.client.generateEmbedding(query);
    const duration = Date.now() - startTime;
    console.log(`[FastEmbedService] Embedding generated in ${duration}ms (${embedding.length} dims)`);

    await embeddingCache.cacheEmbedding(query, embedding);
    return embedding;
  }

  /**
   * Estimate token count for text
   * @param {string} text - Text to estimate tokens for
   * @returns {number} Estimated token count
   */
  estimateTokenCount(text) {
    // Simple token estimation (roughly 4 chars per token)
    return Math.ceil(text.length / 4);
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
    return this.modelInfo?.dimensions || 768;
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
