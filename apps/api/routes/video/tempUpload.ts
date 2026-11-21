/**
 * Shared temp-file handling for the video routes that take a multipart upload
 * (field `file`) and work on it from disk.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import { type NextFunction, type Response } from 'express';
import multer from 'multer';

import { type AuthenticatedRequest } from '../../middleware/types.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('video-temp-upload');

export const TEMP_DIR = '/tmp/video-transcribe';
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

/** A file in TEMP_DIR by name; anything resolving outside it is refused. */
export function tempFilePath(name: string): string {
  const resolved = path.resolve(TEMP_DIR, name);
  if (!resolved.startsWith(TEMP_DIR + path.sep)) throw new Error('Invalid temp file name');
  return resolved;
}

export async function ensureTempDir(): Promise<void> {
  try {
    await fs.promises.mkdir(TEMP_DIR, { recursive: true });
  } catch {
    // directory already exists
  }
}

export async function cleanupTempFile(filePath: string): Promise<void> {
  try {
    await fs.promises.unlink(filePath);
  } catch {
    log.warn(`Failed to cleanup temp file: ${filePath}`);
  }
}

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

export function receiveFile(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
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
