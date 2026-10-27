/**
 * Video Transcription Controller
 *
 * Provides speech-to-text via Voxtral for the video editor.
 * Takes media by URL or as an uploaded file, transcribes with word timestamps,
 * and returns results in the format expected by @designcombo/captions.
 */

import crypto from 'crypto';
import fs from 'fs';
import { pipeline } from 'stream/promises';

import { Router, type NextFunction, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';

import { type AuthenticatedRequest } from '../../middleware/types.js';
import { validateBody, type TypedRequest } from '../../middleware/validateBody.js';
import { type Locale } from '../../services/localization/types.js';
import { transcribeWithProvider } from '../../services/subtitler/transcriptionService.js';
import { requireInstanceAdmin } from '../../utils/adminAuthz.js';
import { createLogger } from '../../utils/logger.js';
import { safeFetch } from '../../utils/validation/urlSecurity.js';

const log = createLogger('video-transcribe');
const router = Router();

const TEMP_DIR = '/tmp/video-transcribe';
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB, same as /api/video/uploads

async function ensureTempDir(): Promise<void> {
  try {
    await fs.promises.mkdir(TEMP_DIR, { recursive: true });
  } catch {
    // directory already exists
  }
}

async function downloadToTempFile(url: string): Promise<string> {
  await ensureTempDir();

  // The extension comes from the caller's URL: only plain alphanumerics may
  // reach the path, or "a./../x" would write outside TEMP_DIR.
  const urlExt = new URL(url).pathname.split('.').pop() ?? '';
  const ext = /^[a-z0-9]{1,8}$/i.test(urlExt) ? urlExt : 'mp4';
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

const transcribeSchema = z.object({
  url: z.string().min(1),
  targetLanguage: z.string().optional(),
});

/**
 * Transcribes a media file on disk and answers in the video editor format:
 * { results: { main: { words: [{ word, start, end }] } } } (start/end in seconds).
 * The file is removed afterwards, whether the provider succeeded or not.
 */
async function respondWithTranscription(
  res: Response,
  tempPath: string,
  locale: Locale
): Promise<void> {
  try {
    const result = await transcribeWithProvider(tempPath, true, null, locale);

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
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    log.error(`Transcription failed: ${errMsg}`);
    res.status(500).json({ error: errMsg || 'Transcription failed' });
  } finally {
    await cleanupTempFile(tempPath);
  }
}

/**
 * POST /api/video/transcribe
 *
 * Accepts { url, targetLanguage? } for media reachable on the public internet.
 */
router.post(
  '/transcribe',
  validateBody(transcribeSchema),
  async (req: TypedRequest<z.infer<typeof transcribeSchema>>, res: Response): Promise<void> => {
    const { url } = req.body;

    log.info(`Transcription requested for: ${url.substring(0, 80)}...`);

    let tempPath: string;
    try {
      tempPath = await downloadToTempFile(url);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      log.error(`Transcription download failed: ${errMsg}`);
      res.status(500).json({ error: errMsg || 'Transcription failed' });
      return;
    }
    log.debug(`Downloaded to temp file: ${tempPath}`);

    await respondWithTranscription(res, tempPath, req.user?.locale ?? 'de-DE');
  }
);

const upload = multer({
  defParamCharset: 'utf8',
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      void ensureTempDir().then(() => cb(null, TEMP_DIR));
    },
    filename: (_req, _file, cb) => cb(null, crypto.randomUUID()),
  }),
  limits: { fileSize: MAX_FILE_SIZE },
});

function receiveFile(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  upload.single('file')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: 'Das Video ist zu groß für die Untertitelung (max. 500 MB).' });
      return;
    }
    if (err) {
      next(err);
      return;
    }
    next();
  });
}

/**
 * The video editor is open to instance admins only while it is being tried
 * out; checked before the upload is received.
 */
async function requireEditorAccess(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const user = req.user;
  if (!user || !(await requireInstanceAdmin(user.id, user.email))) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  next();
}

/**
 * POST /api/video/transcribe/file
 *
 * Multipart upload (field `file`) for media that only exists in the person's
 * browser, e.g. a clip the video editor holds as a blob. Transcribed straight
 * from disk: fetching it back through /api would hit requireAuth and the SSRF
 * guard.
 */
router.post(
  '/transcribe/file',
  requireEditorAccess,
  receiveFile,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: 'No file provided' });
      return;
    }

    log.info(`Transcription requested for upload (${(req.file.size / 1024 / 1024).toFixed(1)}MB)`);

    await respondWithTranscription(res, req.file.path, req.user?.locale ?? 'de-DE');
  }
);

export default router;
