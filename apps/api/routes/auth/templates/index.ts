/**
 * Template routes index
 * Combines and re-exports all template-related routers
 *
 * NOTE: the former userTemplatesRouter has been replaced by the ts-rest
 * userTemplatesContractRouter (mounted in routes.ts before authRouter).
 */

import express, { type Router } from 'express';

import adminTemplatesRouter from './adminTemplates.js';
import templateGalleryRouter from './templateGallery.js';

const router: Router = express.Router();

// Mount all template routers
router.use(templateGalleryRouter);
router.use(adminTemplatesRouter);

export default router;

// Also export individual routers for flexibility
export { templateGalleryRouter, adminTemplatesRouter };
