import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const mistralClient = require('../workers/mistralClient.js');

export default class MistralEmbeddingClient {
  constructor({ model = 'mistral-embed' } = {}) {
    this.model = model;
  }

  async generateEmbedding(text) {
    if (!text || typeof text !== 'string') throw new Error('Text required');
    
    return await this.retryWithBackoff(async () => {
      const resp = await mistralClient.embeddings.create({
        model: this.model,
        inputs: [text],
      });
      const vec = resp?.data?.[0]?.embedding;
      if (!Array.isArray(vec)) throw new Error('No embedding returned');
      return vec;
    }, 'generateEmbedding');
  }

  async generateBatchEmbeddings(texts) {
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
    
    const allEmbeddings = [];
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`[MistralEmbeddingClient] Processing batch ${i + 1}/${batches.length} (${batch.length} texts)`);
      
      try {
        const batchEmbeddings = await this.processSingleBatch(batch);
        allEmbeddings.push(...batchEmbeddings);
      } catch (error) {
        console.error(`[MistralEmbeddingClient] Batch ${i + 1} failed:`, error.message);
        
        // If batch still fails, try processing texts individually
        if (batch.length > 1) {
          console.log(`[MistralEmbeddingClient] Falling back to individual processing for batch ${i + 1}`);
          for (const text of batch) {
            try {
              const embedding = await this.generateEmbedding(text);
              allEmbeddings.push(embedding);
            } catch (individualError) {
              console.error(`[MistralEmbeddingClient] Individual text failed:`, individualError.message);
              throw new Error(`Failed to generate embedding for text: ${individualError.message}`);
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

  async processSingleBatch(texts) {
    return await this.retryWithBackoff(async () => {
      const resp = await mistralClient.embeddings.create({
        model: this.model,
        inputs: texts,
      });
      const arr = resp?.data;
      if (!Array.isArray(arr) || arr.length !== texts.length) throw new Error('Embedding batch size mismatch');
      return arr.map(d => d.embedding);
    }, 'processSingleBatch');
  }

  estimateTokens(text) {
    // Rough estimation: ~4 characters per token for most languages
    return Math.ceil((text || '').length / 4);
  }

  estimateTotalTokens(texts) {
    return texts.reduce((total, text) => total + this.estimateTokens(text), 0);
  }

  createOptimalBatches(texts, maxBatchSize, maxTokensPerBatch) {
    const batches = [];
    let currentBatch = [];
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

  async retryWithBackoff(operation, operationName, maxRetries = 3) {
    let lastError;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        // Check if it's a retryable error
        const isRetryable = this.isRetryableError(error);
        
        if (!isRetryable || attempt === maxRetries) {
          console.error(`[MistralEmbeddingClient] ${operationName} failed after ${attempt + 1} attempts:`, error.message);
          throw error;
        }
        
        // Calculate backoff delay: 1s, 2s, 4s
        const delay = Math.pow(2, attempt) * 1000;
        console.warn(`[MistralEmbeddingClient] ${operationName} attempt ${attempt + 1} failed, retrying in ${delay}ms:`, error.message);
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }

  isRetryableError(error) {
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

