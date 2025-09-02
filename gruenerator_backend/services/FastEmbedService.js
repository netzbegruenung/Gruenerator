import { EmbeddingModel, FlagEmbedding } from 'fastembed';
import { embeddingCache } from './embeddingCache.js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config();

/**
 * FastEmbed Service for local embedding generation
 * Replaces AWS Bedrock with local multilingual embedding model
 */
class FastEmbedService {
  constructor() {
    this.model = null;
    this.isInitialized = false;
    this.modelName = process.env.FASTEMBED_MODEL || EmbeddingModel.MLE5Large;
    this.maxSequenceLength = parseInt(process.env.FASTEMBED_MAX_LENGTH || '512');
    this.dimensions = parseInt(process.env.FASTEMBED_DIMENSIONS || '1024'); // MLE5Large (intfloat/multilingual-e5-large) is 1024 dimensions
    this.maxRetries = 3;
    this.baseDelay = 1000;
    
    // Use absolute path for cache directory
    this.cacheDir = process.env.FASTEMBED_CACHE_DIR || path.resolve(process.cwd(), 'fastembed_cache');
    
    // Initialize model on startup
    this.init();
  }

  /**
   * Initialize FastEmbed model
   */
  async init() {
    if (this.isInitialized) return;

    try {
      // Ensure cache directory exists
      await this.ensureCacheDirectory();
      
      console.log(`[FastEmbedService] Initializing model: ${this.modelName}`);
      console.log(`[FastEmbedService] Using cache directory: ${this.cacheDir}`);
      
      // Try to initialize the model with retries
      await this.initializeModelWithRetry();

      this.isInitialized = true;
      console.log(`[FastEmbedService] Model initialized successfully`);
      console.log(`[FastEmbedService] Dimensions: ${this.dimensions}, Max length: ${this.maxSequenceLength}`);
      
    } catch (error) {
      console.error('[FastEmbedService] Failed to initialize model:', error);
      this.isInitialized = false;
      
      // Try fallback model if primary model fails
      if (this.modelName !== EmbeddingModel.BGESmallENV15) {
        console.log('[FastEmbedService] Attempting fallback to BGE-Small-EN model...');
        await this.initializeFallbackModel();
      } else {
        throw new Error(`FastEmbed initialization failed: ${error.message}`);
      }
    }
  }

  /**
   * Ensure cache directory exists
   */
  async ensureCacheDirectory() {
    if (!fs.existsSync(this.cacheDir)) {
      console.log(`[FastEmbedService] Creating cache directory: ${this.cacheDir}`);
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * Initialize model with retry logic
   */
  async initializeModelWithRetry() {
    let lastError = null;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`[FastEmbedService] Model initialization attempt ${attempt}/${this.maxRetries}`);
        
        this.model = await FlagEmbedding.init({
          model: this.modelName,
          maxLength: this.maxSequenceLength,
          showDownloadProgress: true,
          cacheDir: this.cacheDir
        });
        
        return; // Success
        
      } catch (error) {
        lastError = error;
        console.error(`[FastEmbedService] Attempt ${attempt} failed:`, error.message);
        
        if (attempt < this.maxRetries) {
          const delay = this.baseDelay * Math.pow(2, attempt - 1);
          console.log(`[FastEmbedService] Waiting ${delay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Try to initialize with a fallback model
   */
  async initializeFallbackModel() {
    try {
      console.log('[FastEmbedService] Initializing fallback model: BGE-Small-EN-v1.5');
      
      this.model = await FlagEmbedding.init({
        model: EmbeddingModel.BGESmallENV15,
        maxLength: this.maxSequenceLength,
        showDownloadProgress: true,
        cacheDir: this.cacheDir
      });
      
      // Update service configuration for fallback model
      this.modelName = EmbeddingModel.BGESmallENV15;
      this.dimensions = 384; // BGE-Small-EN-v1.5 dimensions
      this.isInitialized = true;
      
      console.log('[FastEmbedService] Fallback model initialized successfully');
      console.log(`[FastEmbedService] Using fallback - Dimensions: ${this.dimensions}, Max length: ${this.maxSequenceLength}`);
      
    } catch (fallbackError) {
      console.error('[FastEmbedService] Fallback model initialization also failed:', fallbackError);
      throw new Error(`Both primary and fallback model initialization failed. Last error: ${fallbackError.message}`);
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

    await this.ensureInitialized();

    // Truncate text if it's too long
    const truncatedText = this.truncateText(text);

    try {
      // FastEmbed returns an async generator, so we need to iterate
      const embeddingGenerator = this.model.embed([truncatedText]);
      const batches = [];
      
      for await (const batch of embeddingGenerator) {
        batches.push(...batch);
      }
      
      if (!batches || batches.length === 0) {
        throw new Error('No embeddings returned from FastEmbed');
      }

      const embedding = Array.from(batches[0]);
      
      if (!this.validateEmbedding(embedding)) {
        throw new Error('Invalid embedding generated');
      }

      // Normalize embedding for optimal cosine similarity (Qdrant best practice)
      const normalizedEmbedding = this.normalizeVector(embedding);

      return normalizedEmbedding;

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

    await this.ensureInitialized();

    // FastEmbed handles batching efficiently
    const truncatedTexts = texts.map(text => this.truncateText(text));

    try {
      console.log(`[FastEmbedService] Generating embeddings for ${texts.length} texts`);
      
      // FastEmbed returns an async generator, so we need to iterate
      const embeddingGenerator = this.model.embed(truncatedTexts);
      const allEmbeddings = [];
      
      for await (const batch of embeddingGenerator) {
        allEmbeddings.push(...batch);
      }
      
      if (!allEmbeddings || allEmbeddings.length !== texts.length) {
        throw new Error(`Expected ${texts.length} embeddings, got ${allEmbeddings?.length || 0}`);
      }

      const result = allEmbeddings.map(embedding => Array.from(embedding));
      
      // Validate and normalize all embeddings
      const normalizedResult = [];
      for (const embedding of result) {
        if (!this.validateEmbedding(embedding)) {
          throw new Error('Invalid embedding in batch');
        }
        // Normalize each embedding for optimal cosine similarity
        normalizedResult.push(this.normalizeVector(embedding));
      }

      console.log(`[FastEmbedService] Successfully generated and normalized ${normalizedResult.length} embeddings`);
      return normalizedResult;

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

    // Generate new embedding
    const embedding = await this.generateEmbedding(query);
    
    // Cache the result
    await embeddingCache.cacheEmbedding(query, embedding);
    
    return embedding;
  }

  /**
   * Truncate text to maximum sequence length
   * @param {string} text - Text to truncate
   * @returns {string} Truncated text
   * @private
   */
  truncateText(text) {
    if (!text) return '';
    
    // Rough estimate: 1 token ≈ 4 characters for multilingual text
    const maxChars = this.maxSequenceLength * 4;
    
    if (text.length <= maxChars) {
      return text;
    }

    // Try to cut at sentence boundary
    const truncated = text.substring(0, maxChars);
    const lastSentence = Math.max(
      truncated.lastIndexOf('.'),
      truncated.lastIndexOf('!'),
      truncated.lastIndexOf('?')
    );

    if (lastSentence > maxChars * 0.8) {
      return truncated.substring(0, lastSentence + 1);
    }

    return truncated;
  }

  /**
   * Validate embedding vector
   * @param {number[]} embedding - Embedding vector to validate
   * @returns {boolean} True if valid
   */
  validateEmbedding(embedding) {
    return Array.isArray(embedding) && 
           embedding.length === this.dimensions && 
           embedding.every(val => typeof val === 'number' && !isNaN(val) && isFinite(val));
  }

  /**
   * Normalize vector for optimal cosine similarity
   * @param {number[]} vector - Vector to normalize
   * @returns {number[]} Normalized vector
   */
  normalizeVector(vector) {
    // Calculate magnitude (L2 norm)
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    
    // Avoid division by zero
    if (magnitude === 0) {
      console.warn('[FastEmbedService] Zero magnitude vector, returning original');
      return vector;
    }
    
    // Normalize each component
    return vector.map(val => val / magnitude);
  }

  /**
   * Estimate token count for text
   * @param {string} text - Text to estimate tokens for
   * @returns {number} Estimated token count
   */
  estimateTokenCount(text) {
    // Rough estimate: 1 token per 4 characters for multilingual text
    return Math.ceil(text.length / 4);
  }

  /**
   * Get model information
   * @returns {Object} Model information
   */
  getModelInfo() {
    return {
      modelName: this.modelName,
      dimensions: this.dimensions,
      maxSequenceLength: this.maxSequenceLength,
      isInitialized: this.isInitialized
    };
  }

  /**
   * Ensure model is initialized
   * @private
   */
  async ensureInitialized() {
    if (!this.isInitialized) {
      await this.init();
    }
    
    if (!this.isInitialized) {
      throw new Error('FastEmbed model is not initialized');
    }
  }

  /**
   * Get embedding dimensions
   * @returns {number} Number of dimensions
   */
  getDimensions() {
    return this.dimensions;
  }

  /**
   * Check if service is ready
   * @returns {boolean} True if ready
   */
  isReady() {
    return this.isInitialized && this.model !== null;
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    if (this.model) {
      // FastEmbed doesn't require explicit cleanup
      this.model = null;
      this.isInitialized = false;
      console.log('[FastEmbedService] Resources cleaned up');
    }
  }
}

// Export singleton instance
export const fastEmbedService = new FastEmbedService();