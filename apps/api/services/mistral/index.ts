/**
 * Mistral Services - Central Index
 *
 * Re-exports all Mistral-related services for easier imports.
 *
 * Usage:
 * import {
 *   mistralEmbeddingService,
 *   MistralEmbeddingClient
 * } from '../services/mistral/index.js'
 */

// Embedding Service (renamed from FastEmbedService)
export * from './MistralEmbeddingService/index.js';
