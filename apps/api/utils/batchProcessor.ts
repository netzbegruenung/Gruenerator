/**
 * Batch processing utilities for database operations and async tasks
 * Optimizes performance by batching operations and managing concurrency
 */

import { vectorConfig } from '../config/vectorConfig.js';
import { TimeoutError, createErrorHandler } from './errors/index.js';

interface BatchProcessorOptions {
  batchSize?: number;
  maxConcurrent?: number;
  maxRetries?: number;
  retryDelay?: number;
  timeout?: number;
}

interface ProcessingStats {
  batchesProcessed: number;
  itemsProcessed: number;
  errors: number;
  retries: number;
  avgBatchTime: number;
}

interface QueryStats {
  queriesExecuted: number;
  cacheHits: number;
  avgQueryTime: number;
  totalTime: number;
}

/**
 * Generic batch processor for async operations
 */
export class BatchProcessor<T = any, R = any> {
  protected batchSize: number;
  protected maxConcurrent: number;
  protected maxRetries: number;
  protected retryDelay: number;
  protected timeout: number;
  protected errorHandler: ReturnType<typeof createErrorHandler>;
  protected stats: ProcessingStats;

  constructor(options: BatchProcessorOptions = {}) {
    const perfConfig = vectorConfig.get('performance');

    this.batchSize = options.batchSize || perfConfig.batchSize;
    this.maxConcurrent = options.maxConcurrent || perfConfig.maxConcurrentSearches;
    this.maxRetries = options.maxRetries || perfConfig.maxRetries;
    this.retryDelay = options.retryDelay || perfConfig.retryDelay;
    this.timeout = options.timeout || (vectorConfig.getValue('timeouts.searchDefault') as number);

    this.errorHandler = createErrorHandler('BatchProcessor');

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
   */
  async processBatches(
    items: T[],
    processor: (batch: T[], batchIndex: number) => Promise<R[] | R>,
    options: BatchProcessorOptions = {}
  ): Promise<R[]> {
    if (!Array.isArray(items) || items.length === 0) {
      return [];
    }

    const startTime = Date.now();
    const batches = this.createBatches(items, options.batchSize || this.batchSize);
    const results: R[] = [];

    console.log(
      `[BatchProcessor] Processing ${items.length} items in ${batches.length} batches (batch size: ${this.batchSize}, max concurrent: ${this.maxConcurrent})`
    );

    for (let i = 0; i < batches.length; i += this.maxConcurrent) {
      const batchSlice = batches.slice(i, i + this.maxConcurrent);

      const batchPromises = batchSlice.map(async (batch, index) => {
        const globalIndex = i + index;
        return await this.processBatchWithRetry(batch, processor, globalIndex);
      });

      const batchResults = await Promise.allSettled(batchPromises);

      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(...result.value);
        } else {
          console.error(`[BatchProcessor] Batch ${i + index} failed:`, result.reason);
          this.stats.errors++;

          const failedBatch = batchSlice[index];
          results.push(
            ...(failedBatch.map((item) => ({
              item,
              error: result.reason.message || 'Batch processing failed',
              batchIndex: i + index
            })) as unknown as R[])
          );
        }
      });
    }

    const processingTime = Date.now() - startTime;
    this.stats.batchesProcessed += batches.length;
    this.stats.itemsProcessed += items.length;
    this.stats.avgBatchTime = (this.stats.avgBatchTime + processingTime) / 2;

    console.log(
      `[BatchProcessor] Completed processing ${items.length} items in ${processingTime}ms (${batches.length} batches)`
    );

    return results;
  }

  /**
   * Process a single batch with retry logic
   */
  private async processBatchWithRetry(
    batch: T[],
    processor: (batch: T[], batchIndex: number) => Promise<R[] | R>,
    batchIndex: number
  ): Promise<R[]> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const batchStartTime = Date.now();

        const result = await Promise.race([
          processor(batch, batchIndex),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new TimeoutError(`Batch processing timeout`, this.timeout)),
              this.timeout
            )
          )
        ]);

        const batchTime = Date.now() - batchStartTime;

        if (vectorConfig.isVerboseMode()) {
          console.log(
            `[BatchProcessor] Batch ${batchIndex} completed in ${batchTime}ms (${batch.length} items)`
          );
        }

        return Array.isArray(result) ? result : [result];
      } catch (error) {
        lastError = error as Error;

        if (attempt < this.maxRetries) {
          console.warn(
            `[BatchProcessor] Batch ${batchIndex} attempt ${attempt + 1} failed, retrying in ${this.retryDelay}ms:`,
            lastError.message
          );
          this.stats.retries++;

          const delay = this.retryDelay * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }

  /**
   * Create batches from items array
   */
  private createBatches(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Get processing statistics
   */
  getStats(): ProcessingStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
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
export class EmbeddingBatchProcessor extends BatchProcessor {
  private embeddingService: any;

  constructor(embeddingService: any, options: BatchProcessorOptions = {}) {
    super({
      batchSize: options.batchSize || 5,
      maxConcurrent: options.maxConcurrent || 3,
      timeout: options.timeout || (vectorConfig.getValue('timeouts.embeddingGeneration') as number),
      ...options
    });

    this.embeddingService = embeddingService;
  }

  /**
   * Generate embeddings for multiple queries in batches
   */
  async generateEmbeddings(queries: string[]) {
    return await this.processBatches(queries, async (batch) => {
      const embeddings = await Promise.all(
        batch.map((query) => this.embeddingService.generateQueryEmbedding(query))
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
export class ChunkExpansionBatchProcessor extends BatchProcessor {
  private vectorSearchService: any;

  constructor(vectorSearchService: any, options: BatchProcessorOptions = {}) {
    super({
      batchSize: options.batchSize || 10,
      maxConcurrent: options.maxConcurrent || 5,
      ...options
    });

    this.vectorSearchService = vectorSearchService;
  }

  /**
   * Expand chunks with context in batches
   */
  async expandChunks(chunks: any[], options: any = {}) {
    return await this.processBatches(chunks, async (batch) => {
      const expandedChunks = await Promise.all(
        batch.map((chunk) =>
          this.vectorSearchService.expandSingleChunk(chunk, options).catch((error: Error) => ({
            ...chunk,
            expansion_error: error.message,
            expanded_content: chunk.chunk_text
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
export class DatabaseQueryOptimizer {
  private supabaseService: any;
  private queryCache: Map<string, any>;
  private errorHandler: ReturnType<typeof createErrorHandler>;
  private stats: QueryStats;

  constructor(supabaseService: any) {
    this.supabaseService = supabaseService;
    this.queryCache = new Map();
    this.errorHandler = createErrorHandler('DatabaseOptimizer');

    this.stats = {
      queriesExecuted: 0,
      cacheHits: 0,
      avgQueryTime: 0,
      totalTime: 0
    };
  }

  /**
   * Execute optimized database query with caching
   */
  async executeOptimizedQuery(
    operation: string,
    queryFunction: () => Promise<any>,
    params: Record<string, any> = {},
    options: { useCache?: boolean; timeout?: number } = {}
  ): Promise<any> {
    const startTime = Date.now();

    const cacheKey =
      options.useCache !== false ? this.generateQueryCacheKey(operation, params) : null;

    if (cacheKey && this.queryCache.has(cacheKey)) {
      this.stats.cacheHits++;
      console.log(`[DatabaseOptimizer] Cache hit for ${operation}`);
      return this.queryCache.get(cacheKey);
    }

    try {
      const timeout = options.timeout || (vectorConfig.getValue('timeouts.searchDefault') as number);

      const result = await Promise.race([
        queryFunction(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new TimeoutError('Database query timeout', timeout)), timeout as number)
        )
      ]);

      const queryTime = Date.now() - startTime;
      this.stats.queriesExecuted++;
      this.stats.totalTime += queryTime;
      this.stats.avgQueryTime = this.stats.totalTime / this.stats.queriesExecuted;

      if (vectorConfig.isVerboseMode()) {
        console.log(`[DatabaseOptimizer] ${operation} completed in ${queryTime}ms`);
      }

      if (cacheKey && result && !result.error) {
        this.queryCache.set(cacheKey, result);

        if (this.queryCache.size > 100) {
          const firstKey = this.queryCache.keys().next().value;
          if (firstKey) {
            this.queryCache.delete(firstKey);
          }
        }
      }

      return result;
    } catch (error) {
      const queryTime = Date.now() - startTime;
      console.error(
        `[DatabaseOptimizer] ${operation} failed after ${queryTime}ms:`,
        (error as Error).message
      );
      throw error;
    }
  }

  /**
   * Generate cache key for query
   */
  private generateQueryCacheKey(operation: string, params: Record<string, any>): string {
    const sortedParams = Object.keys(params)
      .sort()
      .reduce((sorted: Record<string, any>, key) => {
        sorted[key] = params[key];
        return sorted;
      }, {});

    return `${operation}:${JSON.stringify(sortedParams)}`;
  }

  /**
   * Get query statistics
   */
  getStats(): QueryStats {
    return { ...this.stats };
  }

  /**
   * Clear query cache
   */
  clearCache(): void {
    this.queryCache.clear();
  }
}

/**
 * Create batch processor instances
 */
export const createBatchProcessor = {
  general: (options: BatchProcessorOptions = {}) => new BatchProcessor(options),
  embeddings: (embeddingService: any, options: BatchProcessorOptions = {}) =>
    new EmbeddingBatchProcessor(embeddingService, options),
  chunkExpansion: (vectorSearchService: any, options: BatchProcessorOptions = {}) =>
    new ChunkExpansionBatchProcessor(vectorSearchService, options),
  databaseOptimizer: (supabaseService: any) => new DatabaseQueryOptimizer(supabaseService)
};
