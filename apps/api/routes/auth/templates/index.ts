/**
 * Template routes index
 * Combines and re-exports all template-related routers
 */

import express, { Router } from 'express';
import userTemplatesRouter from './userTemplates.js';
import templateGalleryRouter from './templateGallery.js';

const router: Router = express.Router();

// Mount all template routers
router.use(userTemplatesRouter);
router.use(templateGalleryRouter);

export default router;

// Also export individual routers for flexibility
export { userTemplatesRouter, templateGalleryRouter };

// Re-export helper functions from userTemplates
export { extractTagsFromDescription, validateCanvaUrl, processCanvaUrl } from './userTemplates.js';
