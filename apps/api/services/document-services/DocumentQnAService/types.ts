/**
 * Type definitions for DocumentQnAService
 * Defines interfaces for Q&A and document context operations
 */

/**
 * Agent types for context-specific knowledge extraction
 */
export type AgentType =
  | 'social_media'
  | 'pressemitteilung'
  | 'antrag'
  | 'zitat'
  | 'leichte_sprache'
  | 'gruene_jugend'
  | 'universal';

/**
 * Intent object with agent type
 */
export interface Intent {
  agent: AgentType;
  [key: string]: any;
}

/**
 * Attachment from frontend
 */
export interface Attachment {
  name: string;
  type: string;
  data: string; // base64
  size: number;
}

/**
 * Document stored in Redis
 */
export interface StoredDocument {
  name: string;
  type: string;
  data: string; // base64
  size: number;
  uploadedAt: number;
  userId: string;
}

/**
 * Knowledge extraction options
 */
export interface KnowledgeExtractionOptions {
  documentIds: string[];
  intent: Intent;
  message: string;
  userId: string;
}

/**
 * Mistral content item (text or document)
 */
export interface MistralContentItem {
  type: 'text' | 'document';
  text?: string;
  source?: {
    type: 'base64';
    media_type: string;
    data: string;
  };
}

/**
 * Cache key components
 */
export interface CacheKeyComponents {
  documentIds: string[];
  agent: AgentType;
  message: string;
}

/**
 * Clear user data result
 */
export interface ClearUserDataResult {
  success: boolean;
  deletedDocuments: number;
  deletedCacheEntries: number;
}
