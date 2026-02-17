/**
 * Documents Router - Main entry point for document routes
 *
 * This aggregates all document-related controllers and mounts them to specific paths.
 * Previously all functionality was in a single 1,288-line documents.mjs file.
 * Now split into focused controllers for better maintainability.
 *
 * Controllers:
 * - modeController: User document mode management (manual vs wolke)
 * - manualController: Manual uploads, text additions, URL crawling
 * - wolkeController: Wolke integration (sync, browse, import)
 * - searchController: Search operations (hybrid, text, vector)
 * - qdrantController: Qdrant-specific operations (full-text, stats)
 * - retrievalController: Document retrieval, stats, delete operations
 */

import express, { type Router } from 'express';

import authMiddleware from '../../middleware/authMiddleware.js';

import manualController from './manualController.js';
import modeController from './modeController.js';
import qdrantController from './qdrantController.js';
import retrievalController from './retrievalController.js';
import searchController from './searchController.js';
import wolkeController from './wolkeController.js';

const router: Router = express.Router();

// ============================================================================
// Shared Middleware
// ============================================================================

// Supports both JWT Bearer tokens (mobile) and session cookies (web)
router.use(authMiddleware.requireAuth);

// ============================================================================
// Controller Mounting
// ============================================================================

// IMPORTANT: Route order matters!
// - More specific paths must be mounted before generic ones
// - /search must be before /:id to avoid matching search as an ID
// - retrievalController is mounted last because it contains /:id route

// Mode management
router.use('/mode', modeController);

// Manual operations (upload, text, URL crawling)
router.use('/', manualController);

// Wolke operations (sync, browse, import)
router.use('/wolke', wolkeController);

// Search operations
router.use('/search', searchController);

// Qdrant operations
router.use('/qdrant', qdrantController);

// Retrieval & stats (MUST BE LAST - contains /:id route)
router.use('/', retrievalController);

export default router;
