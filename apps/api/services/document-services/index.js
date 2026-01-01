/**
 * Document Services - Central Index
 *
 * Re-exports all core document-related services for easier imports.
 *
 * Usage:
 * import {
 *   DocumentProcessingService,
 *   getPostgresDocumentService,
 *   smartChunkDocument
 * } from '../services/document-services/index.js'
 */

// Core Services (via wrapper files)
export * from './documentProcessingService.js';
export * from './DocumentSearchService.js';
export * from './documentQnAService.js';
export * from './postgresDocumentService.js';
export * from './documentContentService.js';

// TextChunker (utility)
export * from './textChunker.js';
