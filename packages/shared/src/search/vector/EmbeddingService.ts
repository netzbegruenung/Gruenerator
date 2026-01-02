/**
 * EmbeddingService - Mistral embedding generation with retry and batching
 * Shared between API and MCP for consistent embedding generation
 */

import type { EmbeddingOptions, BatchEmbeddingOptions } from './types.js';
import { EMBEDDING_DEFAULTS } from './constants.js';

const MISTRAL_API_URL = 'https://api.mistral.ai/v1/embeddings';

export interface MistralClient {
  embeddings: {
    create(params: { model: string; inputs: string[] }): Promise<{
      data: Array<{ embedding: number[] }>;
    }>;
  };
}

/**
 * Abstract embedding service that can use either SDK or fetch
 */
export class EmbeddingService {
  private apiKey: string;
  private model: string;
  private maxRetries: number;
  private client?: MistralClient;

  constructor(config: {
    apiKey: string;
    model?: string;
    maxRetries?: number;
    client?: MistralClient;
  }) {
    this.apiKey = config.apiKey;
    this.model = config.model || EMBEDDING_DEFAULTS.model;
    this.maxRetries = config.maxRetries || EMBEDDING_DEFAULTS.maxRetries;
    this.client = config.client;
  }

  /**
   * Generate embedding for a single text
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (!text || typeof text !== 'string') {
      throw new Error('Text is required for embedding generation');
    }

    return this.retryWithBackoff(async () => {
      if (this.client) {
        // Use SDK client if available
        const resp = await this.client.embeddings.create({
          model: this.model,
          inputs: [text],
        });
        const vec = resp?.data?.[0]?.embedding;
        if (!Array.isArray(vec)) throw new Error('No embedding returned');
        return vec;
      } else {
        // Fall back to fetch
        return this.fetchEmbedding(text);
      }
    }, 'generateEmbedding');
  }

  /**
   * Generate embeddings for multiple texts with smart batching
   */
  async generateBatchEmbeddings(
    texts: string[],
    options: BatchEmbeddingOptions = {}
  ): Promise<number[][]> {
    if (!Array.isArray(texts) || texts.length === 0) {
      throw new Error('Texts must be non-empty array');
    }

    const maxBatchSize = options.maxBatchSize || EMBEDDING_DEFAULTS.maxBatchSize;
    const maxTokensPerBatch = options.maxTokensPerBatch || EMBEDDING_DEFAULTS.maxTokensPerBatch;
    const delayBetweenBatches = options.delayBetweenBatches || EMBEDDING_DEFAULTS.delayBetweenBatches;

    // If batch is small enough, process directly
    if (texts.length <= maxBatchSize && this.estimateTotalTokens(texts) <= maxTokensPerBatch) {
      return this.processSingleBatch(texts);
    }

    // Split into smaller batches
    const batches = this.createOptimalBatches(texts, maxBatchSize, maxTokensPerBatch);
    const allEmbeddings: number[][] = [];

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];

      try {
        const batchEmbeddings = await this.processSingleBatch(batch);
        allEmbeddings.push(...batchEmbeddings);
      } catch (error) {
        // If batch fails, try processing individually
        if (batch.length > 1) {
          for (const text of batch) {
            try {
              const embedding = await this.generateEmbedding(text);
              allEmbeddings.push(embedding);
            } catch (individualError) {
              throw new Error(`Failed to generate embedding: ${(individualError as Error).message}`);
            }
          }
        } else {
          throw error;
        }
      }

      // Add delay between batches to avoid rate limiting
      if (i < batches.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayBetweenBatches));
      }
    }

    return allEmbeddings;
  }

  /**
   * Process a single batch of texts
   */
  private async processSingleBatch(texts: string[]): Promise<number[][]> {
    return this.retryWithBackoff(async () => {
      if (this.client) {
        const resp = await this.client.embeddings.create({
          model: this.model,
          inputs: texts,
        });
        const arr = resp?.data;
        if (!Array.isArray(arr) || arr.length !== texts.length) {
          throw new Error('Embedding batch size mismatch');
        }
        return arr.map((d) => d.embedding);
      } else {
        return this.fetchBatchEmbeddings(texts);
      }
    }, 'processSingleBatch');
  }

  /**
   * Fetch embedding using raw fetch API
   */
  private async fetchEmbedding(text: string): Promise<number[]> {
    const response = await fetch(MISTRAL_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: [text],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Mistral API error: ${response.status} - ${error}`);
    }

    const data = await response.json();

    if (!data.data || !data.data[0] || !data.data[0].embedding) {
      throw new Error('No embedding in response');
    }

    return data.data[0].embedding;
  }

  /**
   * Fetch batch embeddings using raw fetch API
   */
  private async fetchBatchEmbeddings(texts: string[]): Promise<number[][]> {
    const response = await fetch(MISTRAL_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Mistral API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data.data.map((d: { embedding: number[] }) => d.embedding);
  }

  /**
   * Retry operation with exponential backoff
   */
  private async retryWithBackoff<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        const isRetryable = this.isRetryableError(error as Error);

        if (!isRetryable || attempt === this.maxRetries) {
          throw error;
        }

        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, attempt) * EMBEDDING_DEFAULTS.retryBaseDelay;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: Error): boolean {
    if (!error) return false;

    const errorMessage = error.message || '';
    const statusCode = (error as { statusCode?: number; status?: number }).statusCode ||
      (error as { status?: number }).status;

    // Retryable conditions: rate limiting, server errors
    if (statusCode === 429 || (statusCode && statusCode >= 500 && statusCode < 600)) {
      return true;
    }

    // Don't retry on batch size errors
    if (errorMessage.includes('Batch size too large') ||
        errorMessage.includes('Too many tokens overall')) {
      return false;
    }

    // Retry on network errors
    if (errorMessage.includes('network') ||
        errorMessage.includes('timeout') ||
        errorMessage.includes('connection') ||
        errorMessage.includes('ECONNRESET') ||
        errorMessage.includes('ETIMEDOUT')) {
      return true;
    }

    return false;
  }

  /**
   * Estimate tokens for a text (~4 chars per token)
   */
  private estimateTokens(text: string): number {
    return Math.ceil((text || '').length / 4);
  }

  /**
   * Estimate total tokens for multiple texts
   */
  private estimateTotalTokens(texts: string[]): number {
    return texts.reduce((total, text) => total + this.estimateTokens(text), 0);
  }

  /**
   * Create optimal batches based on size and token limits
   */
  private createOptimalBatches(
    texts: string[],
    maxBatchSize: number,
    maxTokensPerBatch: number
  ): string[][] {
    const batches: string[][] = [];
    let currentBatch: string[] = [];
    let currentTokenCount = 0;

    for (const text of texts) {
      const textTokens = this.estimateTokens(text);

      if (currentBatch.length >= maxBatchSize ||
          (currentBatch.length > 0 && currentTokenCount + textTokens > maxTokensPerBatch)) {
        if (currentBatch.length > 0) {
          batches.push(currentBatch);
          currentBatch = [];
          currentTokenCount = 0;
        }
      }

      currentBatch.push(text);
      currentTokenCount += textTokens;
    }

    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }

    return batches;
  }
}

/**
 * Create an embedding service instance
 */
export function createEmbeddingService(config: {
  apiKey: string;
  model?: string;
  maxRetries?: number;
  client?: MistralClient;
}): EmbeddingService {
  return new EmbeddingService(config);
}
