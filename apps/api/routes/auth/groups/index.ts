/**
 * Group routes index
 * Combines and re-exports all group-related routers
 */

import express, { Router } from 'express';
import groupCoreRouter, { getPostgresAndCheckMembership } from './groupCore.js';
import groupKnowledgeRouter from './groupKnowledge.js';
import groupContentRouter from './groupContent.js';

const router: Router = express.Router();

// Mount all group routers
router.use(groupCoreRouter);
router.use(groupKnowledgeRouter);
router.use(groupContentRouter);

export default router;

// Also export individual routers for flexibility
export { groupCoreRouter, groupKnowledgeRouter, groupContentRouter };

// Re-export helper function from groupCore
export { getPostgresAndCheckMembership };
