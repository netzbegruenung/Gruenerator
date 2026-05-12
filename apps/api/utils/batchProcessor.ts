/**
 * Batch processing utilities for database operations and async tasks
 * Optimizes performance by batching operations and managing concurrency
 */

import { vectorConfig } from '../config/vectorConfig.js';

import { TimeoutError, createErrorHandler } from './errors/index.js';
import { createLogger } from './logger.js';

const log = createLogger('batchProcessor');

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

/**
 * Generic batch processor for async operations
 */
export class BatchProcessor<T = unknown, R = unknown> {
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
      avgBatchTime: 0,
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

    log.debug(
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
          log.error(`[BatchProcessor] Batch ${i + index} failed:`, result.reason);
          this.stats.errors++;

          const failedBatch = batchSlice[index];
          const errorResults: R[] = failedBatch.map(
            (item) =>
              ({
                item,
                error:
                  (result.reason instanceof Error
                    ? result.reason.message
                    : String(result.reason)) || 'Batch processing failed',
                batchIndex: i + index,
              }) as R
          );
          results.push(...errorResults);
        }
      });
    }

    const processingTime = Date.now() - startTime;
    this.stats.batchesProcessed += batches.length;
    this.stats.itemsProcessed += items.length;
    this.stats.avgBatchTime = (this.stats.avgBatchTime + processingTime) / 2;

    log.debug(
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
          ),
        ]);

        const batchTime = Date.now() - batchStartTime;

        if (vectorConfig.isVerboseMode()) {
          log.debug(
            `[BatchProcessor] Batch ${batchIndex} completed in ${batchTime}ms (${batch.length} items)`
          );
        }

        return Array.isArray(result) ? result : [result];
      } catch (error) {
        lastError = error as Error;

        if (attempt < this.maxRetries) {
          log.warn(
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
      avgBatchTime: 0,
    };
  }
}

/**
 * Specialized batch processor for embedding generation
 */
export class EmbeddingBatchProcessor extends BatchProcessor<
  string,
  { query: string; embedding: number[]; dimensions: number }
> {
  private embeddingService: { generateQueryEmbedding(query: string): Promise<number[]> };

  constructor(
    embeddingService: { generateQueryEmbedding(query: string): Promise<number[]> },
    options: BatchProcessorOptions = {}
  ) {
    super({
      batchSize: options.batchSize || 5,
      maxConcurrent: options.maxConcurrent || 3,
      timeout: options.timeout || (vectorConfig.getValue('timeouts.embeddingGeneration') as number),
      ...options,
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
        dimensions: embeddings[index]?.length || 0,
      }));
    });
  }
}

/**
 * Specialized batch processor for database chunk expansion
 */
export class ChunkExpansionBatchProcessor extends BatchProcessor<
  Record<string, unknown>,
  Record<string, unknown>
> {
  private vectorSearchService: {
    expandSingleChunk(
      chunk: Record<string, unknown>,
      options: Record<string, unknown>
    ): Promise<Record<string, unknown>>;
  };

  constructor(
    vectorSearchService: {
      expandSingleChunk(
        chunk: Record<string, unknown>,
        options: Record<string, unknown>
      ): Promise<Record<string, unknown>>;
    },
    options: BatchProcessorOptions = {}
  ) {
    super({
      batchSize: options.batchSize || 10,
      maxConcurrent: options.maxConcurrent || 5,
      ...options,
    });

    this.vectorSearchService = vectorSearchService;
  }

  /**
   * Expand chunks with context in batches
   */
  async expandChunks(chunks: Record<string, unknown>[], options: Record<string, unknown> = {}) {
    return await this.processBatches(chunks, async (batch) => {
      const expandedChunks = await Promise.all(
        batch.map((chunk) =>
          this.vectorSearchService.expandSingleChunk(chunk, options).catch((error: Error) => ({
            ...chunk,
            expansion_error: error.message,
            expanded_content: (chunk as Record<string, unknown>).chunk_text,
          }))
        )
      );

      return expandedChunks;
    });
  }
}

/**
 * Create batch processor instances
 */
export const createBatchProcessor = {
  general: (options: BatchProcessorOptions = {}) => new BatchProcessor(options),
  embeddings: (
    embeddingService: { generateQueryEmbedding(query: string): Promise<number[]> },
    options: BatchProcessorOptions = {}
  ) => new EmbeddingBatchProcessor(embeddingService, options),
  chunkExpansion: (
    vectorSearchService: {
      expandSingleChunk(
        chunk: Record<string, unknown>,
        options: Record<string, unknown>
      ): Promise<Record<string, unknown>>;
    },
    options: BatchProcessorOptions = {}
  ) => new ChunkExpansionBatchProcessor(vectorSearchService, options),
};
