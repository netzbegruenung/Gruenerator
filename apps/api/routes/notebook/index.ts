/**
 * Notebook Routes - Barrel Export
 *
 * Exports all notebook-related route controllers:
 * - Collections: CRUD operations for notebook collections
 * - Interaction: QA interaction and public access routes
 */

export { default as collectionsRouter } from './collectionsController.js';
export { internalNotebookRouter } from './internalController.js';
export { default as interactionRouter } from './interactionController.js';
export { default as recentDocumentsRouter } from './recentDocumentsController.js';
export { default as statisticsRouter } from './statisticsController.js';
export * from './types.js';
