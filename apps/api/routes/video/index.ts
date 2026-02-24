/**
 * Video Route Group
 *
 * Aggregates all video editor API routes under /api/video.
 */

import { Router } from 'express';

import renderController from './renderController.js';
import transcribeController from './transcribeController.js';
import uploadController from './uploadController.js';

const router = Router();

// POST /api/video/transcribe
router.use('/', transcribeController);

// POST/GET /api/video/uploads, /api/video/uploads/from-url, /api/video/uploads/file/:filename
router.use('/uploads', uploadController);

// POST /api/video/render, GET /api/video/render/:id, DELETE /api/video/render/:id
router.use('/', renderController);

export default router;
