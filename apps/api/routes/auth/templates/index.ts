/**
 * Template routes index
 * Combines and re-exports all template-related routers
 */

import express, { type Router } from 'express';

import templateGalleryRouter from './templateGallery.js';
import userTemplatesRouter from './userTemplates.js';

const router: Router = express.Router();

// Mount all template routers
router.use(userTemplatesRouter);
router.use(templateGalleryRouter);

export default router;

// Also export individual routers for flexibility
export { userTemplatesRouter, templateGalleryRouter };
