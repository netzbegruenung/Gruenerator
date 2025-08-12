/**
 * Batch processing utilities for database operations and async tasks
 * Optimizes performance by batching operations and managing concurrency
 */

import { vectorConfig } from '../config/vectorConfig.js';
import { TimeoutError, ResourceError, createErrorHandler } from './errorHandling.js';

/**
 * Generic batch processor for async operations
 */
class BatchProcessor {
  constructor(options = {}) {
    const perfConfig = vectorConfig.get('performance');
    
    this.batchSize = options.batchSize || perfConfig.batchSize;
    this.maxConcurrent = options.maxConcurrent || perfConfig.maxConcurrentSearches;
    this.maxRetries = options.maxRetries || perfConfig.maxRetries;
    this.retryDelay = options.retryDelay || perfConfig.retryDelay;
    this.timeout = options.timeout || vectorConfig.getValue('timeouts.databaseRPC');
    
    this.errorHandler = createErrorHandler('BatchProcessor');
    
    // Track processing statistics
    this.stats = {
      batchesProcessed: 0,
      itemsProcessed: 0,
      errors: 0,
      retries: 0,
      avgBatchTime: 0
    };
  }

  /**
   * Process items in batches with concurrency control
   * @param {Array} items - Items to process
   * @param {Function} processor - Async function to process each batch
   * @param {Object} options - Processing options
   * @returns {Promise<Array>} Processed results
   */
  async processBatches(items, processor, options = {}) {
    if (!Array.isArray(items) || items.length === 0) {
      return [];
    }

    const startTime = Date.now();
    const batches = this.createBatches(items, options.batchSize || this.batchSize);
    const results = [];
    
    console.log(`[BatchProcessor] Processing ${items.length} items in ${batches.length} batches (batch size: ${this.batchSize}, max concurrent: ${this.maxConcurrent})`);
    
    // Process batches with concurrency control
    for (let i = 0; i < batches.length; i += this.maxConcurrent) {
      const batchSlice = batches.slice(i, i + this.maxConcurrent);
      
      const batchPromises = batchSlice.map(async (batch, index) => {
        const globalIndex = i + index;
        return await this.processBatchWithRetry(batch, processor, globalIndex);
      });
      
      const batchResults = await Promise.allSettled(batchPromises);
      
      // Collect results and handle errors
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(...result.value);
        } else {
          console.error(`[BatchProcessor] Batch ${i + index} failed:`, result.reason);
          this.stats.errors++;
          
          // Add failed items as error results
          const failedBatch = batchSlice[index];
          results.push(...failedBatch.map(item => ({
            item,
            error: result.reason.message || 'Batch processing failed',
            batchIndex: i + index
          })));
        }
      });
    }
    
    // Update statistics
    const processingTime = Date.now() - startTime;
    this.stats.batchesProcessed += batches.length;
    this.stats.itemsProcessed += items.length;
    this.stats.avgBatchTime = (this.stats.avgBatchTime + processingTime) / 2;
    
    console.log(`[BatchProcessor] Completed processing ${items.length} items in ${processingTime}ms (${batches.length} batches)`);
    
    return results;
  }

  /**
   * Process a single batch with retry logic
   * @param {Array} batch - Items in the batch
   * @param {Function} processor - Processing function
   * @param {number} batchIndex - Batch index for logging
   * @returns {Promise<Array>} Batch results
   * @private
   */
  async processBatchWithRetry(batch, processor, batchIndex) {
    let lastError;
    
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const batchStartTime = Date.now();
        
        // Add timeout wrapper
        const result = await Promise.race([
          processor(batch, batchIndex),
          new Promise((_, reject) => 
            setTimeout(() => reject(new TimeoutError(`Batch processing timeout`, this.timeout)), this.timeout)
          )
        ]);
        
        const batchTime = Date.now() - batchStartTime;
        
        if (vectorConfig.isVerboseMode()) {
          console.log(`[BatchProcessor] Batch ${batchIndex} completed in ${batchTime}ms (${batch.length} items)`);
        }
        
        return Array.isArray(result) ? result : [result];
        
      } catch (error) {
        lastError = error;
        
        if (attempt < this.maxRetries) {
          console.warn(`[BatchProcessor] Batch ${batchIndex} attempt ${attempt + 1} failed, retrying in ${this.retryDelay}ms:`, error.message);
          this.stats.retries++;
          
          // Exponential backoff
          const delay = this.retryDelay * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Create batches from items array
   * @param {Array} items - Items to batch
   * @param {number} batchSize - Size of each batch
   * @returns {Array<Array>} Array of batches
   * @private
   */
  createBatches(items, batchSize) {
    const batches = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Get processing statistics
   * @returns {Object} Processing statistics
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      batchesProcessed: 0,
      itemsProcessed: 0,
      errors: 0,
      retries: 0,
      avgBatchTime: 0
    };
  }
}

/**
 * Specialized batch processor for embedding generation
 */
class EmbeddingBatchProcessor extends BatchProcessor {
  constructor(embeddingService, options = {}) {
    super({
      batchSize: options.batchSize || 5, // Smaller batches for embeddings
      maxConcurrent: options.maxConcurrent || 3, // Limit concurrent embedding requests
      timeout: options.timeout || vectorConfig.getValue('timeouts.embeddingGeneration'),
      ...options
    });
    
    this.embeddingService = embeddingService;
  }

  /**
   * Generate embeddings for multiple queries in batches
   * @param {Array<string>} queries - Queries to embed
   * @returns {Promise<Array>} Array of embeddings
   */
  async generateEmbeddings(queries) {
    return await this.processBatches(queries, async (batch) => {
      const embeddings = await Promise.all(
        batch.map(query => this.embeddingService.generateQueryEmbedding(query))
      );
      
      return batch.map((query, index) => ({
        query,
        embedding: embeddings[index],
        dimensions: embeddings[index]?.length || 0
      }));
    });
  }
}

/**
 * Specialized batch processor for database chunk expansion
 */
class ChunkExpansionBatchProcessor extends BatchProcessor {
  constructor(vectorSearchService, options = {}) {
    super({
      batchSize: options.batchSize || 10,
      maxConcurrent: options.maxConcurrent || 5,
      ...options
    });
    
    this.vectorSearchService = vectorSearchService;
  }

  /**
   * Expand chunks with context in batches
   * @param {Array} chunks - Chunks to expand
   * @param {Object} options - Expansion options
   * @returns {Promise<Array>} Expanded chunks
   */
  async expandChunks(chunks, options = {}) {
    return await this.processBatches(chunks, async (batch) => {
      // Process chunks in batch - each chunk expansion is independent
      const expandedChunks = await Promise.all(
        batch.map(chunk => 
          this.vectorSearchService.expandSingleChunk(chunk, options)
            .catch(error => ({
              ...chunk,
              expansion_error: error.message,
              expanded_content: chunk.chunk_text // Fallback to original text
            }))
        )
      );
      
      return expandedChunks;
    });
  }
}

/**
 * Database query optimizer with connection pooling simulation
 */
class DatabaseQueryOptimizer {
  constructor(supabaseService) {
    this.supabaseService = supabaseService;
    this.queryCache = new Map();
    this.errorHandler = createErrorHandler('DatabaseOptimizer');
    
    // Track query statistics
    this.stats = {
      queriesExecuted: 0,
      cacheHits: 0,
      avgQueryTime: 0,
      totalTime: 0
    };
  }

  /**
   * Execute optimized database query with caching
   * @param {string} operation - Operation type for caching
   * @param {Function} queryFunction - Function that executes the query
   * @param {Object} params - Query parameters for cache key
   * @param {Object} options - Query options
   * @returns {Promise<*>} Query result
   */
  async executeOptimizedQuery(operation, queryFunction, params = {}, options = {}) {
    const startTime = Date.now();
    
    // Generate cache key
    const cacheKey = options.useCache !== false ? 
      this.generateQueryCacheKey(operation, params) : null;
    
    // Check cache first
    if (cacheKey && this.queryCache.has(cacheKey)) {
      this.stats.cacheHits++;
      console.log(`[DatabaseOptimizer] Cache hit for ${operation}`);
      return this.queryCache.get(cacheKey);
    }
    
    try {
      // Execute query with timeout
      const timeout = options.timeout || vectorConfig.getValue('timeouts.databaseRPC');
      
      const result = await Promise.race([
        queryFunction(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new TimeoutError('Database query timeout', timeout)), timeout)
        )
      ]);
      
      // Update statistics
      const queryTime = Date.now() - startTime;
      this.stats.queriesExecuted++;
      this.stats.totalTime += queryTime;
      this.stats.avgQueryTime = this.stats.totalTime / this.stats.queriesExecuted;
      
      if (vectorConfig.isVerboseMode()) {
        console.log(`[DatabaseOptimizer] ${operation} completed in ${queryTime}ms`);
      }
      
      // Cache result if successful
      if (cacheKey && result && !result.error) {
        this.queryCache.set(cacheKey, result);
        
        // Simple cache size management
        if (this.queryCache.size > 100) {
          const firstKey = this.queryCache.keys().next().value;
          this.queryCache.delete(firstKey);
        }
      }
      
      return result;
      
    } catch (error) {
      const queryTime = Date.now() - startTime;
      console.error(`[DatabaseOptimizer] ${operation} failed after ${queryTime}ms:`, error.message);
      throw error;
    }
  }

  /**
   * Generate cache key for query
   * @param {string} operation - Operation type
   * @param {Object} params - Query parameters
   * @returns {string} Cache key
   * @private
   */
  generateQueryCacheKey(operation, params) {
    const sortedParams = Object.keys(params)
      .sort()
      .reduce((sorted, key) => {
        sorted[key] = params[key];
        return sorted;
      }, {});
    
    return `${operation}:${JSON.stringify(sortedParams)}`;
  }

  /**
   * Get query statistics
   * @returns {Object} Query statistics
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Clear query cache
   */
  clearCache() {
    this.queryCache.clear();
  }
}

/**
 * Create batch processor instances
 */
const createBatchProcessor = {
  /**
   * Create general batch processor
   */
  general: (options = {}) => new BatchProcessor(options),

  /**
   * Create embedding batch processor
   */
  embeddings: (embeddingService, options = {}) => 
    new EmbeddingBatchProcessor(embeddingService, options),

  /**
   * Create chunk expansion batch processor
   */
  chunkExpansion: (vectorSearchService, options = {}) => 
    new ChunkExpansionBatchProcessor(vectorSearchService, options),

  /**
   * Create database query optimizer
   */
  databaseOptimizer: (supabaseService) => 
    new DatabaseQueryOptimizer(supabaseService)
};

export {
  BatchProcessor,
  EmbeddingBatchProcessor,
  ChunkExpansionBatchProcessor,
  DatabaseQueryOptimizer,
  createBatchProcessor
};