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

// Core Services (directly from folder structure)
export * from './DocumentProcessingService/index.js';
export * from './DocumentSearchService/index.js';
export { default as DocumentSearchServiceDefault } from './DocumentSearchService/index.js';
export * from './DocumentQnAService/index.js';
export { default as DocumentQnAServiceDefault } from './DocumentQnAService/index.js';
export * from './PostgresDocumentService/index.js';
export { default as PostgresDocumentServiceDefault } from './PostgresDocumentService/index.js';
export * from './DocumentContentService/index.js';

// TextChunker (utility)
export * from './TextChunker/index.js';
