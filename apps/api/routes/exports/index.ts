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

import chatMessageRouter from './chatMessageExport.js';
import docxRouter from './docxController.js';
import pdfRouter from './pdfController.js';
import zipRouter from './zipController.js';

const router = express.Router();

// Mount sub-routers
router.use('/pdf', pdfRouter);
router.use('/docx', docxRouter);
router.use('/zip', zipRouter);
router.use('/chat-message', chatMessageRouter);

export default router;

// Named exports for individual controllers
export { default as pdfController } from './pdfController.js';
export { default as docxController } from './docxController.js';
export { default as zipController } from './zipController.js';
export { default as chatMessageExport } from './chatMessageExport.js';

// Utility exports
export * from './contentParser.js';
export * from './citationParser.js';
export * from './types.js';
