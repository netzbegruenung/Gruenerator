/**
 * Type definitions for FastEmbedService
 * Defines interfaces for embedding generation, caching, and model information
 */

export interface ModelInfo {
  modelName: string;
  dimensions: number;
  maxSequenceLength: number;
  isInitialized: boolean;
  serverConnected?: boolean;
}

export interface EmbeddingOptions {
  model?: string;
  useCache?: boolean;
  inputType?: 'search_document' | 'search_query';
}

export interface EmbeddingResult {
  embedding: number[];
  cached: boolean;
  processingTime?: number;
  dimensions: number;
}

export interface BatchEmbeddingResult {
  embeddings: number[][];
  count: number;
  processingTime: number;
}

export interface CacheConfig {
  ttl: number;
  keyPrefix: string;
  enabled: boolean;
}

export interface ServiceState {
  isInitialized: boolean;
  modelInfo: ModelInfo | null;
}
