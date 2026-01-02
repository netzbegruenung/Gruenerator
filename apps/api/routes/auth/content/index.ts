/**
 * User content routes index
 * Combines and re-exports all content-related routers
 */

import express, { Router } from 'express';
import userInstructionsRouter from './userInstructions.js';
import userLibraryRouter from './userLibrary.js';
import userGalleryRouter from './userGallery.js';

const router: Router = express.Router();

// Mount all content routers
router.use(userInstructionsRouter);
router.use(userLibraryRouter);
router.use(userGalleryRouter);

export default router;

// Also export individual routers for flexibility
export { userInstructionsRouter, userLibraryRouter, userGalleryRouter };
