import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Embedding Client for communicating with the standalone embedding server
 * Used by worker processes to request embeddings without loading the model
 */
class EmbeddingClient {
  constructor() {
    this.serverUrl = process.env.EMBEDDING_SERVER_URL || 'http://localhost:3002';
    this.timeout = parseInt(process.env.EMBEDDING_CLIENT_TIMEOUT || '60000'); // 60 seconds
    this.maxRetries = 3;
    this.baseDelay = 1000;
    
    // Create axios instance with default config
    this.client = axios.create({
      baseURL: this.serverUrl,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Add response interceptor for logging
    this.client.interceptors.response.use(
      response => response,
      error => {
        console.error(`[EmbeddingClient] Request failed: ${error.message}`);
        return Promise.reject(error);
      }
    );
  }

  /**
   * Check if the embedding server is healthy and ready
   * @returns {Promise<boolean>} True if server is ready
   */
  async isServerReady() {
    try {
      const response = await this.client.get('/health');
      return response.data.initialized === true;
    } catch (error) {
      console.warn('[EmbeddingClient] Health check failed:', error.message);
      return false;
    }
  }

  /**
   * Wait for the embedding server to be ready
   * @param {number} maxWaitTime Maximum time to wait in milliseconds
   * @returns {Promise<boolean>} True if server became ready
   */
  async waitForServer(maxWaitTime = 120000) { // 2 minutes
    const startTime = Date.now();
    const checkInterval = 2000; // 2 seconds
    
    console.log('[EmbeddingClient] Waiting for embedding server to be ready...');
    
    while (Date.now() - startTime < maxWaitTime) {
      if (await this.isServerReady()) {
        console.log('[EmbeddingClient] Embedding server is ready');
        return true;
      }
      
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }
    
    console.error('[EmbeddingClient] Embedding server did not become ready within timeout');
    return false;
  }

  /**
   * Generate embedding for a single text
   * @param {string} text Text to generate embedding for
   * @returns {Promise<number[]>} Embedding vector
   */
  async generateEmbedding(text) {
    if (!text || typeof text !== 'string') {
      throw new Error('Text is required and must be a string');
    }

    return await this.withRetry(async () => {
      const response = await this.client.post('/embed', { text });
      
      if (!response.data || !response.data.embedding) {
        throw new Error('Invalid response from embedding server');
      }
      
      return response.data.embedding;
    });
  }

  /**
   * Generate embeddings for multiple texts in batch
   * @param {string[]} texts Array of texts to generate embeddings for
   * @param {string} inputType Type of input (maintained for compatibility)
   * @returns {Promise<number[][]>} Array of embedding vectors
   */
  async generateBatchEmbeddings(texts, inputType = 'search_document') {
    if (!Array.isArray(texts) || texts.length === 0) {
      throw new Error('Texts must be a non-empty array');
    }

    return await this.withRetry(async () => {
      const response = await this.client.post('/embed/batch', { 
        texts, 
        inputType 
      });
      
      if (!response.data || !response.data.embeddings) {
        throw new Error('Invalid response from embedding server');
      }
      
      return response.data.embeddings;
    });
  }

  /**
   * Generate embedding for a search query (with potential caching on server side)
   * @param {string} query Search query text
   * @returns {Promise<number[]>} Embedding vector
   */
  async generateQueryEmbedding(query) {
    // For now, this is the same as generateEmbedding
    // but we could add special handling for queries in the future
    return await this.generateEmbedding(query);
  }

  /**
   * Get model information from the embedding server
   * @returns {Promise<Object>} Model information
   */
  async getModelInfo() {
    try {
      const response = await this.client.get('/model-info');
      return response.data;
    } catch (error) {
      console.error('[EmbeddingClient] Failed to get model info:', error.message);
      throw new Error(`Failed to get model info: ${error.message}`);
    }
  }

  /**
   * Execute a function with retry logic
   * @param {Function} fn Function to execute
   * @returns {Promise<any>} Result of the function
   */
  async withRetry(fn) {
    let lastError = null;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        
        // Don't retry on client errors (4xx)
        if (error.response && error.response.status >= 400 && error.response.status < 500) {
          throw error;
        }
        
        console.warn(`[EmbeddingClient] Attempt ${attempt}/${this.maxRetries} failed:`, error.message);
        
        if (attempt < this.maxRetries) {
          const delay = this.baseDelay * Math.pow(2, attempt - 1);
          console.log(`[EmbeddingClient] Waiting ${delay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Get embedding dimensions (cached from server)
   * @returns {Promise<number>} Number of dimensions
   */
  async getDimensions() {
    try {
      const modelInfo = await this.getModelInfo();
      return modelInfo.dimensions;
    } catch (error) {
      console.warn('[EmbeddingClient] Failed to get dimensions, returning default');
      return 1024; // Default for multilingual-e5-large
    }
  }

  /**
   * Check if the client is ready to make requests
   * @returns {Promise<boolean>} True if ready
   */
  async isReady() {
    return await this.isServerReady();
  }

  /**
   * Estimate token count for text (rough approximation)
   * @param {string} text Text to estimate tokens for
   * @returns {number} Estimated token count
   */
  estimateTokenCount(text) {
    // Rough estimate: 1 token per 4 characters for multilingual text
    return Math.ceil(text.length / 4);
  }

  /**
   * Validate embedding vector
   * @param {number[]} embedding Embedding vector to validate
   * @param {number} expectedDimensions Expected number of dimensions
   * @returns {boolean} True if valid
   */
  validateEmbedding(embedding, expectedDimensions = null) {
    if (!Array.isArray(embedding)) {
      return false;
    }
    
    if (expectedDimensions && embedding.length !== expectedDimensions) {
      return false;
    }
    
    return embedding.every(val => typeof val === 'number' && !isNaN(val) && isFinite(val));
  }

  /**
   * Get server health status
   * @returns {Promise<Object>} Health status object
   */
  async getHealthStatus() {
    try {
      const response = await this.client.get('/health');
      return response.data;
    } catch (error) {
      return {
        status: 'error',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

// Export singleton instance
export const embeddingClient = new EmbeddingClient();
export default EmbeddingClient;