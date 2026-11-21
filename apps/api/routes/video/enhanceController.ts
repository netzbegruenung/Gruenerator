/**
 * "Ton verbessern": the video editor uploads a clip, the speech track is
 * cleaned of background noise, and the result is kept in the Mediathek. The
 * clip gets a new `src` there; a separate audio overlay would drift out of
 * step with the clip's segments and speed.
 */

import fs from 'fs';
import path from 'path';

import { Router, type Response } from 'express';

import { rateLimitMiddleware } from '../../middleware/rateLimitMiddleware.js';
import { type AuthenticatedRequest } from '../../middleware/types.js';
import { getSharedMediaService } from '../../services/sharedMediaService.js';
import { enhanceVideoAudio } from '../../services/subtitler/audioEnhance.js';
import { AudioEnhanceError } from '../../services/voice/enhanceService.js';
import { createLogger } from '../../utils/logger.js';

import { cleanupTempFile, receiveFile, tempFilePath } from './tempUpload.js';

const log = createLogger('video-enhance');
const router = Router();

function failure(error: unknown): { status: number; message: string } {
  if (error instanceof AudioEnhanceError) {
    switch (error.code) {
      case 'too_long':
        return { status: 400, message: 'Ton verbessern geht bei Videos bis 5 Minuten.' };
      case 'no_audio':
        return { status: 400, message: 'Das Video hat keine Tonspur.' };
      case 'invalid_input':
        return { status: 400, message: 'Dieses Video kann nicht verbessert werden.' };
      case 'rate_limited':
        return {
          status: 429,
          message: 'Gerade wird zu viel Ton verbessert. Versuch es gleich noch einmal.',
        };
      case 'unavailable':
        break;
    }
  }
  return { status: 503, message: 'Ton verbessern ist gerade nicht verfügbar.' };
}

/**
 * POST /api/video/enhance/file
 *
 * Multipart upload (field `file`, optional `title`). Answers with the
 * Mediathek entry of the enhanced video.
 */
router.post(
  '/enhance/file',
  rateLimitMiddleware('audio_enhance', { autoIncrement: true }),
  receiveFile,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: 'Kein Video übergeben.' });
      return;
    }

    const inputPath = tempFilePath(req.file.filename);
    const outputPath = tempFilePath(`${req.file.filename}.enhanced.mp4`);
    const userId = req.user?.id;

    try {
      if (!userId) {
        res.status(401).json({ error: 'Nicht angemeldet.' });
        return;
      }
      await enhanceVideoAudio(inputPath, outputPath);

      const body = req.body as { title?: unknown } | null;
      const rawTitle = typeof body?.title === 'string' ? body.title.trim() : '';
      const title = `${rawTitle || 'Video'} (Ton verbessert)`;
      const share = await getSharedMediaService().uploadMediaFile(userId, {
        fileBuffer: await fs.promises.readFile(outputPath),
        originalFilename: `${path.parse(req.file.originalname || 'video').name}-ton-verbessert.mp4`,
        mimeType: 'video/mp4',
        title,
        altText: null,
        uploadSource: 'audio-enhance',
      });

      res.status(201).json({ id: share.id, shareToken: share.shareToken, mediaType: 'video' });
    } catch (error: unknown) {
      log.error(`Audio enhancement failed: ${error instanceof Error ? error.message : error}`);
      const { status, message } = failure(error);
      res.status(status).json({ error: message });
    } finally {
      await Promise.all([cleanupTempFile(inputPath), cleanupTempFile(outputPath)]);
    }
  }
);

export default router;
