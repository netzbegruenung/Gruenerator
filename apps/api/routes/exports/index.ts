/**
 * Exports Routes - Barrel Export
 *
 * Document export functionality split into:
 * - pdfController: PDF generation with custom fonts
 * - docxController: DOCX generation with formatting and citations
 * - contentParser: HTML/markdown parsing utilities
 * - citationParser: Citation marker handling
 */

import express from 'express';
import pdfRouter from './pdfController.js';
import docxRouter from './docxController.js';

const router = express.Router();

// Mount sub-routers
router.use('/pdf', pdfRouter);
router.use('/docx', docxRouter);

export default router;

// Named exports for individual controllers
export { default as pdfController } from './pdfController.js';
export { default as docxController } from './docxController.js';

// Utility exports
export * from './contentParser.js';
export * from './citationParser.js';
export * from './types.js';
