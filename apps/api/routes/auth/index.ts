/**
 * Auth routes main index
 * Combines and re-exports all authentication and user-related routers
 */

import express, { Router } from 'express';

// Core auth routes
import authCoreRouter from './authCore.js';
import userProfileRouter from './userProfile.js';
import userCustomGeneratorsRouter from './userCustomGenerators.js';
import userCustomPromptsRouter from './userCustomPrompts.js';

// Subdirectory routers
import contentRouter from './content/index.js';
import templatesRouter from './templates/index.js';
import groupsRouter from './groups/index.js';

const router: Router = express.Router();

// Mount core routers
router.use(authCoreRouter);
router.use(userProfileRouter);
router.use(userCustomGeneratorsRouter);
router.use(userCustomPromptsRouter);

// Mount subdirectory routers
router.use(contentRouter);
router.use(templatesRouter);
router.use(groupsRouter);

export default router;

// Export individual routers for direct mounting or testing
export {
  authCoreRouter,
  userProfileRouter,
  userCustomGeneratorsRouter,
  userCustomPromptsRouter,
  contentRouter,
  templatesRouter,
  groupsRouter,
};

// Re-export types
export * from './types.js';
