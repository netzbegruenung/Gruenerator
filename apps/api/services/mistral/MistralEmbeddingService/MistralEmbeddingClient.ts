import mistralClient from '../../../workers/mistralClient.js';

export interface MistralEmbeddingOptions {
  model?: string;
}

export interface RetryableError extends Error {
  statusCode?: number;
  status?: number;
  body?: string;
}

export class MistralEmbeddingClient {
  private model: string;

  constructor({ model = 'mistral-embed' }: MistralEmbeddingOptions = {}) {
    this.model = model;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    if (!text || typeof text !== 'string') throw new Error('Text required');

    return await this.retryWithBackoff(async () => {
      const resp = await mistralClient.embeddings.create({
        model: this.model,
        inputs: [text],
      });
      const vec = resp?.data?.[0]?.embedding;
      if (!Array.isArray(vec)) throw new Error('No embedding returned');
      return vec as number[];
    }, 'generateEmbedding');
  }

  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    if (!Array.isArray(texts) || texts.length === 0) throw new Error('Texts must be non-empty array');

    // Conservative limits based on Mistral API constraints
    const MAX_BATCH_SIZE = 16; // Maximum number of texts per batch
    const MAX_TOKENS_PER_BATCH = 8000; // Conservative token limit per batch

    // If batch is small enough, process directly
    if (texts.length <= MAX_BATCH_SIZE && this.estimateTotalTokens(texts) <= MAX_TOKENS_PER_BATCH) {
      return await this.processSingleBatch(texts);
    }

    // Split into smaller batches
    const batches = this.createOptimalBatches(texts, MAX_BATCH_SIZE, MAX_TOKENS_PER_BATCH);
    console.log(`[MistralEmbeddingClient] Splitting ${texts.length} texts into ${batches.length} batches`);

    const allEmbeddings: number[][] = [];

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`[MistralEmbeddingClient] Processing batch ${i + 1}/${batches.length} (${batch.length} texts)`);

      try {
        const batchEmbeddings = await this.processSingleBatch(batch);
        allEmbeddings.push(...batchEmbeddings);
      } catch (error) {
        const err = error as Error;
        console.error(`[MistralEmbeddingClient] Batch ${i + 1} failed:`, err.message);

        // If batch still fails, try processing texts individually
        if (batch.length > 1) {
          console.log(`[MistralEmbeddingClient] Falling back to individual processing for batch ${i + 1}`);
          for (const text of batch) {
            try {
              const embedding = await this.generateEmbedding(text);
              allEmbeddings.push(embedding);
            } catch (individualError) {
              const indErr = individualError as Error;
              console.error(`[MistralEmbeddingClient] Individual text failed:`, indErr.message);
              throw new Error(`Failed to generate embedding for text: ${indErr.message}`);
            }
          }
        } else {
          throw error;
        }
      }

      // Add small delay between batches to avoid rate limiting
      if (i < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return allEmbeddings;
  }

  private async processSingleBatch(texts: string[]): Promise<number[][]> {
    return await this.retryWithBackoff(async () => {
      const resp = await mistralClient.embeddings.create({
        model: this.model,
        inputs: texts,
      });
      const arr = resp?.data;
      if (!Array.isArray(arr) || arr.length !== texts.length) throw new Error('Embedding batch size mismatch');
      return arr.map(d => d.embedding as number[]);
    }, 'processSingleBatch');
  }

  estimateTokens(text: string): number {
    // Rough estimation: ~4 characters per token for most languages
    return Math.ceil((text || '').length / 4);
  }

  estimateTotalTokens(texts: string[]): number {
    return texts.reduce((total, text) => total + this.estimateTokens(text), 0);
  }

  private createOptimalBatches(texts: string[], maxBatchSize: number, maxTokensPerBatch: number): string[][] {
    const batches: string[][] = [];
    let currentBatch: string[] = [];
    let currentTokenCount = 0;

    for (const text of texts) {
      const textTokens = this.estimateTokens(text);

      // If adding this text would exceed limits, start a new batch
      if (currentBatch.length >= maxBatchSize ||
          (currentBatch.length > 0 && currentTokenCount + textTokens > maxTokensPerBatch)) {
        if (currentBatch.length > 0) {
          batches.push(currentBatch);
          currentBatch = [];
          currentTokenCount = 0;
        }
      }

      // If a single text is too large, we still need to process it
      // (the API will handle this case or fail gracefully)
      currentBatch.push(text);
      currentTokenCount += textTokens;
    }

    // Add the last batch if it has content
    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }

    return batches;
  }

  private async retryWithBackoff<T>(
    operation: () => Promise<T>,
    operationName: string,
    maxRetries: number = 3
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        // Check if it's a retryable error
        const isRetryable = this.isRetryableError(error as RetryableError);

        if (!isRetryable || attempt === maxRetries) {
          console.error(`[MistralEmbeddingClient] ${operationName} failed after ${attempt + 1} attempts:`, lastError.message);
          throw lastError;
        }

        // Calculate backoff delay: 1s, 2s, 4s
        const delay = Math.pow(2, attempt) * 1000;
        console.warn(`[MistralEmbeddingClient] ${operationName} attempt ${attempt + 1} failed, retrying in ${delay}ms:`, lastError.message);

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }

  private isRetryableError(error: RetryableError): boolean {
    if (!error) return false;

    // Check error message for specific Mistral API errors
    const errorMessage = error.message || error.body || '';
    const statusCode = error.statusCode || error.status;

    // Retryable conditions:
    // - Rate limiting (429)
    // - Server errors (5xx)
    // - Temporary API errors
    // - Network errors
    if (statusCode === 429 || (statusCode >= 500 && statusCode < 600)) {
      return true;
    }

    // Don't retry on specific batch size errors - these need different handling
    if (errorMessage.includes('Batch size too large') ||
        errorMessage.includes('Too many tokens overall')) {
      return false;
    }

    // Retry on network and temporary errors
    if (errorMessage.includes('network') ||
        errorMessage.includes('timeout') ||
        errorMessage.includes('connection') ||
        errorMessage.includes('ECONNRESET') ||
        errorMessage.includes('ETIMEDOUT')) {
      return true;
    }

    return false;
  }
}

export default MistralEmbeddingClient;
