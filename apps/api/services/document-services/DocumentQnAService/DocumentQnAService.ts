/**
 * DocumentQnAService - Main orchestration class
 * Context-aware document knowledge extraction
 * Stores raw documents in Redis and extracts relevant information on-demand using Mistral
 */

// Import module functions

import { generateQuestionsForIntent } from './contextExtraction.js';
import { generateCacheKey, getCachedKnowledge, cacheKnowledge } from './contextManagement.js';
import { askMistralAboutDocuments } from './mistralIntegration.js';
import {
  getDocumentsFromRedis,
  storeAttachment,
  storeAttachments,
  getRecentDocuments,
  clearUserDocuments,
} from './redisOperations.js';

import type {
  Intent,
  Attachment,
  StoredDocument,
  KnowledgeExtractionOptions,
  ClearUserDataResult,
} from './types.js';

/**
 * Main DocumentQnAService class
 * Delegates operations to specialized modules
 */
export class DocumentQnAService {
  private redis: any;
  private mistral: any;

  constructor(redisClient: any, mistralClient: any) {
    this.redis = redisClient;
    this.mistral = mistralClient;
  }

  // ========================================
  // Knowledge Extraction
  // ========================================

  /**
   * Extract context-specific knowledge from documents for a given intent
   */
  async extractKnowledgeForIntent(
    documentIds: string[],
    intent: Intent,
    message: string,
    userId: string
  ): Promise<string | null> {
    if (!documentIds || documentIds.length === 0) {
      return null;
    }

    console.log(
      `[DocumentQnAService] Extracting knowledge for intent: ${intent.agent}, documents: ${documentIds.length}`
    );

    // Check cache first
    const cacheKey = generateCacheKey(documentIds, intent.agent, message);
    const cached = await getCachedKnowledge(this.redis, cacheKey);
    if (cached) {
      console.log(`[DocumentQnAService] Using cached knowledge for ${intent.agent}`);
      return cached;
    }

    // Get documents from Redis
    const documents = await getDocumentsFromRedis(this.redis, documentIds, userId);
    if (documents.length === 0) {
      console.log(`[DocumentQnAService] No accessible documents found`);
      return null;
    }

    try {
      // Generate context-specific questions
      const questions = generateQuestionsForIntent(intent, message);

      // Ask Mistral to extract relevant knowledge
      const knowledge = await askMistralAboutDocuments(this.mistral, documents, questions);

      // Cache the result for 1 hour
      await cacheKnowledge(this.redis, cacheKey, knowledge, 3600);

      console.log(
        `[DocumentQnAService] Extracted knowledge for ${intent.agent}: ${knowledge.length} chars`
      );
      return knowledge;
    } catch (error) {
      console.error(`[DocumentQnAService] Error extracting knowledge:`, error);
      return null;
    }
  }

  // ========================================
  // Redis Operations
  // ========================================

  /**
   * Retrieve documents from Redis by IDs
   */
  async getDocumentsFromRedis(documentIds: string[], userId: string): Promise<StoredDocument[]> {
    return getDocumentsFromRedis(this.redis, documentIds, userId);
  }

  /**
   * Store raw attachment in Redis with 24-hour TTL
   */
  async storeAttachment(userId: string, attachment: Attachment): Promise<string> {
    return storeAttachment(this.redis, userId, attachment);
  }

  /**
   * Store multiple attachments and update user's recent documents list
   */
  async storeAttachments(userId: string, attachments: Attachment[]): Promise<string[]> {
    return storeAttachments(this.redis, userId, attachments);
  }

  /**
   * Get user's recent document IDs for conversation memory
   */
  async getRecentDocuments(userId: string, limit: number = 5): Promise<string[]> {
    return getRecentDocuments(this.redis, userId, limit);
  }

  /**
   * Clear all user documents and caches from Redis
   */
  async clearUserDocuments(userId: string): Promise<boolean> {
    const result = await clearUserDocuments(this.redis, userId);
    return result.success;
  }

  // ========================================
  // Context Extraction
  // ========================================

  /**
   * Generate context-specific questions based on intent and user message
   */
  generateQuestionsForIntent(intent: Intent, message: string): string {
    return generateQuestionsForIntent(intent, message);
  }

  // ========================================
  // Mistral Integration
  // ========================================

  /**
   * Ask Mistral to extract knowledge from documents using context-specific questions
   */
  async askMistralAboutDocuments(documents: StoredDocument[], questions: string): Promise<string> {
    return askMistralAboutDocuments(this.mistral, documents, questions);
  }

  // ========================================
  // Cache Management
  // ========================================

  /**
   * Generate cache key for document extraction
   */
  generateCacheKey(documentIds: string[], agent: string, message: string): string {
    return generateCacheKey(documentIds, agent as any, message);
  }
}
