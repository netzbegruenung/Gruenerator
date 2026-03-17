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
  private maxConcurrentBatches: number;

  constructor({ model = 'mistral-embed' }: MistralEmbeddingOptions = {}) {
    this.model = model;
    this.maxConcurrentBatches = Math.max(
      1,
      parseInt(process.env.MISTRAL_EMBEDDING_CONCURRENCY || '3', 10)
    );
  }

  // Mistral API rejects individual texts exceeding 8192 tokens.
  // Use conservative 2.5 chars/token — OCR text and dense content tokenizes at ~2.8
  // chars/token (observed: 32760 chars = 11365 tokens = 2.88 ratio).
  private static readonly MAX_TOKENS_PER_TEXT = 8192;
  private static readonly MAX_CHARS_PER_TEXT = Math.floor(8192 * 2.5); // 20480 chars

  async generateEmbedding(text: string): Promise<number[]> {
    if (!text || typeof text !== 'string') throw new Error('Text required');

    const safeText = this.truncateIfNeeded(text);

    return await this.retryWithBackoff(async () => {
      const resp = await mistralClient.embeddings.create({
        model: this.model,
        inputs: [safeText],
      });
      const vec = resp?.data?.[0]?.embedding;
      if (!Array.isArray(vec)) throw new Error('No embedding returned');
      return vec as number[];
    }, 'generateEmbedding');
  }

  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    if (!Array.isArray(texts) || texts.length === 0)
      throw new Error('Texts must be non-empty array');

    // Conservative limits based on Mistral API constraints
    const MAX_BATCH_SIZE = 16; // Maximum number of texts per batch
    const MAX_TOKENS_PER_BATCH = 8000; // Conservative token limit per batch

    // If batch is small enough, process directly
    if (texts.length <= MAX_BATCH_SIZE && this.estimateTotalTokens(texts) <= MAX_TOKENS_PER_BATCH) {
      return await this.processSingleBatch(texts);
    }

    // Split into smaller batches
    const batches = this.createOptimalBatches(texts, MAX_BATCH_SIZE, MAX_TOKENS_PER_BATCH);
    console.log(
      `[MistralEmbeddingClient] Splitting ${texts.length} texts into ${batches.length} batches`
    );

    // Process batches concurrently with worker pool
    const STAGGER_MS = 100;
    const results: number[][][] = new Array(batches.length);
    let nextIndex = 0;

    const runWorker = async (): Promise<void> => {
      while (nextIndex < batches.length) {
        const i = nextIndex++;
        const batch = batches[i];

        // Stagger launches to avoid burst
        if (i > 0) {
          await new Promise((r) => setTimeout(r, STAGGER_MS));
        }

        console.log(
          `[MistralEmbeddingClient] Processing batch ${i + 1}/${batches.length} (${batch.length} texts)`
        );

        try {
          results[i] = await this.processSingleBatch(batch);
        } catch (error) {
          results[i] = await this.processBatchFallback(batch, i, error as Error);
        }
      }
    };

    const workerCount = Math.min(this.maxConcurrentBatches, batches.length);
    await Promise.all(Array.from({ length: workerCount }, () => runWorker()));

    return results.flat();
  }

  private async processSingleBatch(texts: string[]): Promise<number[][]> {
    const safeTexts = texts.map((t) => this.truncateIfNeeded(t));

    return await this.retryWithBackoff(async () => {
      const resp = await mistralClient.embeddings.create({
        model: this.model,
        inputs: safeTexts,
      });
      const arr = resp?.data;
      if (!Array.isArray(arr) || arr.length !== safeTexts.length)
        throw new Error('Embedding batch size mismatch');
      return arr.map((d) => d.embedding as number[]);
    }, 'processSingleBatch');
  }

  private async processBatchFallback(
    batch: string[],
    batchIndex: number,
    error: Error
  ): Promise<number[][]> {
    console.error(`[MistralEmbeddingClient] Batch ${batchIndex + 1} failed:`, error.message);

    if (batch.length > 1) {
      console.log(
        `[MistralEmbeddingClient] Falling back to individual processing for batch ${batchIndex + 1}`
      );
      const results: number[][] = [];
      for (const text of batch) {
        try {
          results.push(await this.generateEmbedding(text));
        } catch (individualError) {
          const indErr = individualError as Error;
          if (
            indErr.message.includes('exceeding max') ||
            indErr.message.includes('too many tokens')
          ) {
            console.warn(
              `[MistralEmbeddingClient] Skipping oversized text (${text.length} chars) — using zero vector`
            );
            results.push(new Array(1024).fill(0));
          } else {
            console.error(`[MistralEmbeddingClient] Individual text failed:`, indErr.message);
            throw new Error(`Failed to generate embedding for text: ${indErr.message}`);
          }
        }
      }
      return results;
    }

    const errMsg = error.message || '';
    if (errMsg.includes('exceeding max') || errMsg.includes('too many tokens')) {
      console.warn(
        `[MistralEmbeddingClient] Skipping oversized text (${batch[0].length} chars) — using zero vector`
      );
      return [new Array(1024).fill(0)];
    }
    throw error;
  }

  estimateTokens(text: string): number {
    // Conservative estimation: ~2.5 characters per token
    // OCR/dense content tokenizes at 2.5-3 chars/token, natural text at ~4
    return Math.ceil((text || '').length / 2.5);
  }

  estimateTotalTokens(texts: string[]): number {
    return texts.reduce((total, text) => total + this.estimateTokens(text), 0);
  }

  private truncateIfNeeded(text: string): string {
    if (text.length <= MistralEmbeddingClient.MAX_CHARS_PER_TEXT) return text;

    // Truncate at a word boundary
    const truncated = text.slice(0, MistralEmbeddingClient.MAX_CHARS_PER_TEXT);
    const lastSpace = truncated.lastIndexOf(' ');
    const safeText = lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated;

    console.warn(
      `[MistralEmbeddingClient] Truncated text from ${text.length} to ${safeText.length} chars (exceeds ${MistralEmbeddingClient.MAX_TOKENS_PER_TEXT} token limit)`
    );
    return safeText;
  }

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

      // If adding this text would exceed limits, start a new batch
      if (
        currentBatch.length >= maxBatchSize ||
        (currentBatch.length > 0 && currentTokenCount + textTokens > maxTokensPerBatch)
      ) {
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
          console.error(
            `[MistralEmbeddingClient] ${operationName} failed after ${attempt + 1} attempts:`,
            lastError.message
          );
          throw lastError;
        }

        // Calculate backoff delay: 1s, 2s, 4s
        const delay = Math.pow(2, attempt) * 1000;
        console.warn(
          `[MistralEmbeddingClient] ${operationName} attempt ${attempt + 1} failed, retrying in ${delay}ms:`,
          lastError.message
        );

        await new Promise((resolve) => setTimeout(resolve, delay));
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
    if (
      statusCode !== undefined &&
      (statusCode === 429 || (statusCode >= 500 && statusCode < 600))
    ) {
      return true;
    }

    // Don't retry on token/batch limit errors - these need different handling
    if (
      errorMessage.includes('Batch size too large') ||
      errorMessage.includes('Too many tokens overall') ||
      errorMessage.includes('exceeding max')
    ) {
      return false;
    }

    // Retry on network and temporary errors
    if (
      errorMessage.includes('network') ||
      errorMessage.includes('timeout') ||
      errorMessage.includes('connection') ||
      errorMessage.includes('ECONNRESET') ||
      errorMessage.includes('ETIMEDOUT')
    ) {
      return true;
    }

    return false;
  }
}

export default MistralEmbeddingClient;
