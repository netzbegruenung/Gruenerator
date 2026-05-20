/**
 * Auth routes main index
 * Combines and re-exports all authentication and user-related routers
 */

import express, { type Router } from 'express';

import appLoginRouter from './appLogin.js';
import authCoreRouter from './authCore.js';
import contentRouter from './content/index.js';
import groupsRouter from './groups/index.js';
import mobileAuthRouter from './mobileAuth.js';
import templatesRouter from './templates/index.js';
import userCustomGeneratorsRouter from './userCustomGenerators.js';
import userCustomPromptsRouter from './userCustomPrompts.js';

const router: Router = express.Router();

router.use(appLoginRouter);
router.use(mobileAuthRouter);
router.use(authCoreRouter);
router.use(userCustomGeneratorsRouter);
router.use(userCustomPromptsRouter);

router.use(contentRouter);
router.use(templatesRouter);
router.use(groupsRouter);

export default router;

export {
  appLoginRouter,
  authCoreRouter,
  mobileAuthRouter,
  userCustomGeneratorsRouter,
  userCustomPromptsRouter,
  contentRouter,
  templatesRouter,
  groupsRouter,
};

export * from './types.js';
