/**
 * Video Route Group
 *
 * Mounted under /api/video. Only transcription is left: the private video
 * editor uploads through the Mediathek and renders in the browser, so the
 * former upload and render-queue routes were removed (#5606).
 */

import { Router } from 'express';

import transcribeController from './transcribeController.js';

const router = Router();

// POST /api/video/transcribe
router.use('/', transcribeController);

export default router;
