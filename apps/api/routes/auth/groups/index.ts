/**
 * Group routes index
 * Combines and re-exports all group-related routers
 */

import express, { type Router } from 'express';

import groupAvatarRouter from './groupAvatar.js';
import groupContentRouter from './groupContent.js';
import groupCoreRouter, { getPostgresAndCheckMembership } from './groupCore.js';

const router: Router = express.Router();

// Mount all group routers
router.use(groupCoreRouter);
router.use(groupContentRouter);
router.use(groupAvatarRouter);

export default router;

// Also export individual routers for flexibility
export { groupCoreRouter, groupContentRouter };

// Re-export helper function from groupCore
export { getPostgresAndCheckMembership };
