import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { embeddingCache } from './embeddingCache.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Service for generating embeddings using AWS Bedrock's Cohere Embed Multilingual v3
 */
class EmbeddingService {
  constructor() {
    this.client = new BedrockRuntimeClient({
      region: process.env.AWS_REGION || 'eu-central-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      }
    });
    
    this.modelId = process.env.AWS_BEDROCK_MODEL_ID || 'cohere.embed-multilingual-v3';
    this.maxRetries = 3;
    this.baseDelay = 1000; // 1 second base delay for exponential backoff
  }

  /**
   * Generate embeddings for a single text
   * @param {string} text - Text to generate embedding for (max 512 tokens)
   * @returns {Promise<number[]>} 1024-dimensional embedding vector
   */
  async generateEmbedding(text) {
    if (!text || typeof text !== 'string') {
      throw new Error('Text is required and must be a string');
    }

    // Truncate text if it's too long (approximate token limit)
    // Cohere's tokenizer is roughly 1 token per 4 characters for multilingual text
    const maxChars = 512 * 4; // Conservative estimate
    const truncatedText = text.length > maxChars ? text.substring(0, maxChars) : text;

    const input = {
      modelId: this.modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        texts: [truncatedText],
        input_type: 'search_document', // Use 'search_query' for queries
        truncate: 'END' // Truncate from end if still too long
      })
    };

    return await this.invokeWithRetry(input);
  }

  /**
   * Generate embeddings for multiple texts in a batch
   * @param {string[]} texts - Array of texts to generate embeddings for
   * @param {string} inputType - Type of input: 'search_document' or 'search_query'
   * @returns {Promise<number[][]>} Array of embedding vectors
   */
  async generateBatchEmbeddings(texts, inputType = 'search_document') {
    if (!Array.isArray(texts) || texts.length === 0) {
      throw new Error('Texts must be a non-empty array');
    }

    // Cohere supports up to 96 texts per batch
    const batchSize = 96;
    const allEmbeddings = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      
      // Truncate each text in the batch
      const maxChars = 512 * 4;
      const truncatedBatch = batch.map(text => 
        text.length > maxChars ? text.substring(0, maxChars) : text
      );

      const input = {
        modelId: this.modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify({
          texts: truncatedBatch,
          input_type: inputType,
          truncate: 'END'
        })
      };

      const batchEmbeddings = await this.invokeWithRetry(input, true);
      allEmbeddings.push(...batchEmbeddings);
    }

    return allEmbeddings;
  }

  /**
   * Generate embedding for a search query with caching
   * @param {string} query - Search query text
   * @returns {Promise<number[]>} 1024-dimensional embedding vector
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
    const maxChars = 512 * 4;
    const truncatedQuery = query.length > maxChars ? query.substring(0, maxChars) : query;

    const input = {
      modelId: this.modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        texts: [truncatedQuery],
        input_type: 'search_query', // Important: use search_query for queries
        truncate: 'END'
      })
    };

    const embedding = await this.invokeWithRetry(input);
    
    // Cache the result
    await embeddingCache.cacheEmbedding(query, embedding);
    
    return embedding;
  }

  /**
   * Invoke Bedrock with retry logic
   * @private
   */
  async invokeWithRetry(input, isBatch = false) {
    let lastError;
    
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const command = new InvokeModelCommand(input);
        const response = await this.client.send(command);
        
        // Parse response
        const responseBody = JSON.parse(new TextDecoder().decode(response.body));
        
        if (!responseBody.embeddings || responseBody.embeddings.length === 0) {
          throw new Error('No embeddings returned from Bedrock');
        }

        // Return single embedding or array based on request type
        return isBatch ? responseBody.embeddings : responseBody.embeddings[0];
        
      } catch (error) {
        lastError = error;
        console.error(`[EmbeddingService] Attempt ${attempt + 1} failed:`, error.message);
        
        // Don't retry on client errors (4xx)
        if (error.name === 'ValidationException' || error.$metadata?.httpStatusCode >= 400 && error.$metadata?.httpStatusCode < 500) {
          throw error;
        }
        
        // Exponential backoff
        if (attempt < this.maxRetries - 1) {
          const delay = this.baseDelay * Math.pow(2, attempt);
          console.log(`[EmbeddingService] Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw new Error(`Failed to generate embeddings after ${this.maxRetries} attempts: ${lastError.message}`);
  }

  /**
   * Estimate token count for text (rough approximation)
   * @param {string} text - Text to estimate tokens for
   * @returns {number} Estimated token count
   */
  estimateTokenCount(text) {
    // Rough estimate: 1 token per 4 characters for multilingual text
    return Math.ceil(text.length / 4);
  }

  /**
   * Validate embedding vector
   * @param {number[]} embedding - Embedding vector to validate
   * @returns {boolean} True if valid
   */
  validateEmbedding(embedding) {
    return Array.isArray(embedding) && 
           embedding.length === 1024 && 
           embedding.every(val => typeof val === 'number' && !isNaN(val));
  }
}

// Export singleton instance
export const embeddingService = new EmbeddingService();