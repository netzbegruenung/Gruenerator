/**
 * PostgresDocumentService - Main orchestration class
 * Handles document metadata operations with PostgreSQL
 * This service manages document metadata only, not file storage
 */

import { getPostgresInstance } from '../../../database/services/PostgresService.js';
import type {
  DocumentMetadata,
  DocumentRecord,
  DocumentUpdateData,
  DeleteResult,
  BulkDeleteResult,
  UserDocumentMode,
  UserDocumentModeResult,
  DocumentStats,
  UserTextDocument
} from './types.js';

// Import module functions
import {
  saveDocumentMetadata,
  updateDocumentMetadata,
  getDocumentsBySourceType,
  getDocumentById,
  deleteDocument,
  bulkDeleteDocuments
} from './metadataOperations.js';

import {
  storeDocumentText,
  getDocumentText,
  createDocumentWithText
} from './textOperations.js';

import {
  getDocumentByWolkeFile
} from './wolkeOperations.js';

import {
  getUserDocumentMode,
  setUserDocumentMode
} from './userPreferences.js';

import {
  getDocumentStats,
  getUserTexts
} from './statistics.js';

/**
 * Main PostgresDocumentService class
 * Delegates operations to specialized modules
 */
export class PostgresDocumentService {
  private postgres: any;

  constructor() {
    this.postgres = getPostgresInstance();
  }

  /**
   * Ensure PostgreSQL is initialized
   */
  async ensureInitialized(): Promise<void> {
    await this.postgres.ensureInitialized();
  }

  // ========================================
  // User Preferences
  // ========================================

  /**
   * Get user's document mode preference
   */
  async getUserDocumentMode(userId: string): Promise<UserDocumentMode> {
    return getUserDocumentMode(this.postgres, userId);
  }

  /**
   * Set user's document mode preference
   */
  async setUserDocumentMode(userId: string, mode: UserDocumentMode): Promise<UserDocumentModeResult> {
    return setUserDocumentMode(this.postgres, userId, mode);
  }

  // ========================================
  // Metadata Operations
  // ========================================

  /**
   * Save document metadata (no file content)
   */
  async saveDocumentMetadata(userId: string, metadata: DocumentMetadata): Promise<DocumentRecord> {
    return saveDocumentMetadata(this.postgres, userId, metadata);
  }

  /**
   * Update document metadata
   */
  async updateDocumentMetadata(
    documentId: string,
    userId: string,
    updates: DocumentUpdateData
  ): Promise<DocumentRecord> {
    return updateDocumentMetadata(this.postgres, documentId, userId, updates);
  }

  /**
   * Get documents by source type for a user
   */
  async getDocumentsBySourceType(userId: string, sourceType: string | null = null): Promise<DocumentRecord[]> {
    return getDocumentsBySourceType(this.postgres, userId, sourceType);
  }

  /**
   * Get document by ID (with ownership check)
   */
  async getDocumentById(documentId: string, userId: string): Promise<DocumentRecord | null> {
    return getDocumentById(this.postgres, documentId, userId);
  }

  /**
   * Delete document metadata
   */
  async deleteDocument(documentId: string, userId: string): Promise<DeleteResult> {
    return deleteDocument(this.postgres, documentId, userId);
  }

  /**
   * Bulk delete documents
   */
  async bulkDeleteDocuments(documentIds: string[], userId: string): Promise<BulkDeleteResult> {
    return bulkDeleteDocuments(this.postgres, documentIds, userId);
  }

  // ========================================
  // Text Operations
  // ========================================

  /**
   * Store document full text (for text-only system)
   */
  async storeDocumentText(
    documentId: string,
    userId: string,
    text: string
  ): Promise<{ success: boolean; textLength: number }> {
    return storeDocumentText(this.postgres, documentId, userId, text);
  }

  /**
   * Retrieve document full text
   */
  async getDocumentText(
    documentId: string,
    userId: string
  ): Promise<{ success: boolean; text: string; textLength: number; storedAt: string }> {
    return getDocumentText(this.postgres, documentId, userId);
  }

  /**
   * Create document with text content (text-only system)
   */
  async createDocumentWithText(
    userId: string,
    metadata: DocumentMetadata,
    text: string
  ): Promise<DocumentRecord> {
    return createDocumentWithText(this.postgres, userId, metadata, text);
  }

  // ========================================
  // Statistics
  // ========================================

  /**
   * Get user's document statistics
   */
  async getDocumentStats(userId: string): Promise<DocumentStats> {
    return getDocumentStats(this.postgres, userId);
  }

  /**
   * Get user texts from user_documents table
   */
  async getUserTexts(userId: string): Promise<UserTextDocument[]> {
    return getUserTexts(this.postgres, userId);
  }

  // ========================================
  // Wolke Operations
  // ========================================

  /**
   * Get document by Wolke file path (for duplicate checking)
   */
  async getDocumentByWolkeFile(
    userId: string,
    shareLinkId: string,
    filePath: string
  ): Promise<DocumentRecord | null> {
    return getDocumentByWolkeFile(this.postgres, userId, shareLinkId, filePath);
  }
}
