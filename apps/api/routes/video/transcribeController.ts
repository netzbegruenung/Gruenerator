/**
 * Video Transcription Controller
 *
 * Provides speech-to-text via Gladia for the video editor.
 * Downloads media from URL, transcribes with word timestamps,
 * and returns results in the format expected by @designcombo/captions.
 */

import crypto from 'crypto';
import fs from 'fs';
import { pipeline } from 'stream/promises';

import { Router, type Response } from 'express';

import { type AuthenticatedRequest } from '../../middleware/types.js';
import { transcribeWithProvider } from '../../services/subtitler/transcriptionService.js';
import { createLogger } from '../../utils/logger.js';
import { safeFetch } from '../../utils/validation/urlSecurity.js';

const log = createLogger('video-transcribe');
const router = Router();

const TEMP_DIR = '/tmp/video-transcribe';

async function ensureTempDir(): Promise<void> {
  try {
    await fs.promises.mkdir(TEMP_DIR, { recursive: true });
  } catch {
    // directory already exists
  }
}

async function downloadToTempFile(url: string): Promise<string> {
  await ensureTempDir();

  const ext = new URL(url).pathname.split('.').pop()?.split('?')[0] || 'mp4';
  const filename = `${crypto.randomUUID()}.${ext}`;
  const tempPath = `${TEMP_DIR}/${filename}`;

  const response = await safeFetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download media: ${response.status} ${response.statusText}`);
  }
  if (!response.body) {
    throw new Error('Response body is empty');
  }

  const fileStream = fs.createWriteStream(tempPath);
  await pipeline(response.body!, fileStream);

  return tempPath;
}

async function cleanupTempFile(filePath: string): Promise<void> {
  try {
    await fs.promises.unlink(filePath);
  } catch {
    log.warn(`Failed to cleanup temp file: ${filePath}`);
  }
}

/**
 * POST /api/video/transcribe
 *
 * Accepts { url, targetLanguage? } and returns word-level transcription
 * in the format the video editor expects:
 * { results: { main: { words: [{ word, start, end }] } } }
 */
router.post('/transcribe', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { url } = req.body;

  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'url is required' });
    return;
  }

  let tempPath: string | null = null;

  try {
    log.info(`Transcription requested for: ${url.substring(0, 80)}...`);

    tempPath = await downloadToTempFile(url);
    log.debug(`Downloaded to temp file: ${tempPath}`);

    const result = await transcribeWithProvider(tempPath, true);

    // Transform response → video editor format
    // Provider returns { text, words: [{ word, start, end }] } where start/end are in seconds
    // Video editor expects { results: { main: { words: [{ word, start, end }] } } }
    const words = (result.words || []).map((w) => ({
      word: w.word,
      start: w.start,
      end: w.end,
    }));

    res.json({
      results: {
        main: {
          words,
        },
      },
    });

    log.info(`Transcription complete: ${words.length} words`);
  } catch (error: any) {
    log.error(`Transcription failed: ${error.message}`);
    res.status(500).json({ error: error.message || 'Transcription failed' });
  } finally {
    if (tempPath) {
      await cleanupTempFile(tempPath);
    }
  }
});

export default router;
