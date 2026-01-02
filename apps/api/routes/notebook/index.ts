/**
 * Notebook Routes - Barrel Export
 *
 * Exports all notebook-related route controllers:
 * - Collections: CRUD operations for notebook collections
 * - Interaction: QA interaction and public access routes
 */

export { default as collectionsRouter } from './collectionsController.js';
export { default as interactionRouter } from './interactionController.js';
export * from './types.js';
