/**
 * Auth routes main index
 * Combines and re-exports all authentication and user-related routers
 */

import express, { type Router } from 'express';

import authCoreRouter from './authCore.js';
import contentRouter from './content/index.js';
import groupsRouter from './groups/index.js';
import templatesRouter from './templates/index.js';
import userCustomGeneratorsRouter from './userCustomGenerators.js';
import userCustomPromptsRouter from './userCustomPrompts.js';
import userProfileRouter from './userProfile.js';

const router: Router = express.Router();

router.use(authCoreRouter);
router.use(userProfileRouter);
router.use(userCustomGeneratorsRouter);
router.use(userCustomPromptsRouter);

router.use(contentRouter);
router.use(templatesRouter);
router.use(groupsRouter);

export default router;

export {
  authCoreRouter,
  userProfileRouter,
  userCustomGeneratorsRouter,
  userCustomPromptsRouter,
  contentRouter,
  templatesRouter,
  groupsRouter,
};

export * from './types.js';
