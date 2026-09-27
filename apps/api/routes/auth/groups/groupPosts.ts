/**
 * Beiträge im Gruppen-Feed: Anlegen (Multipart, Text + Dateien) und Dateien
 * ausliefern. Bearbeiten und Löschen sind JSON und stehen im groupsContract.
 * Die Logik liegt in `services/groups/groupPosts.ts`.
 *
 * Dateien sind nur für Mitglieder lesbar. Ausgeliefert wird inline nur, was
 * `isSafeToInline` erlaubt — sonst würde eine hochgeladene SVG/HTML-Datei im
 * Origin der API gerendert (Stored XSS).
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import { GROUP_POST_FILE_LIMIT, GROUP_POST_FILE_MAX_BYTES } from '@gruenerator/contracts';
import express, { type NextFunction, type Response, type Router } from 'express';
import multer from 'multer';

import authMiddlewareModule from '../../../middleware/authMiddleware.js';
import {
  GROUP_POST_DIR,
  createGroupPost,
  getGroupPostFile,
} from '../../../services/groups/groupPosts.js';
import { isSafeToInline } from '../../../utils/fileAttachments.js';
import { createLogger } from '../../../utils/logger.js';

import type { UserProfile } from '../../../services/user/types.js';
import type { AuthRequest } from '../types.js';

const log = createLogger('group-posts');
const { requireAuth: ensureAuthenticated } = authMiddlewareModule;

const router: Router = express.Router();

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, GROUP_POST_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).slice(0, 16) || '.bin';
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  // Browser schicken Dateinamen als UTF-8; der multer-Standard latin1 macht
  // aus „Protokoll_März.pdf" Mojibake.
  defParamCharset: 'utf8',
  limits: { fileSize: GROUP_POST_FILE_MAX_BYTES, files: GROUP_POST_FILE_LIMIT },
});

/** multer-Grenzen als 400 statt 500; multer räumt geschriebene Teile selbst weg. */
function receiveFiles(req: AuthRequest, res: Response, next: NextFunction): void {
  upload.array('files', GROUP_POST_FILE_LIMIT)(req, res, (err: unknown) => {
    if (!err) return next();
    const code = err instanceof multer.MulterError ? err.code : null;
    const message =
      code === 'LIMIT_FILE_SIZE'
        ? `Eine Datei ist größer als ${GROUP_POST_FILE_MAX_BYTES / 1024 / 1024} MB.`
        : code === 'LIMIT_FILE_COUNT' || code === 'LIMIT_UNEXPECTED_FILE'
          ? `Höchstens ${GROUP_POST_FILE_LIMIT} Dateien pro Beitrag.`
          : 'Upload fehlgeschlagen.';
    res.status(400).json({ success: false, message });
  });
}

function isMembershipError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('Mitglied');
}

router.post(
  '/groups/:groupId/posts',
  ensureAuthenticated,
  receiveFiles,
  async (req: AuthRequest<{ groupId: string }>, res: Response) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    try {
      const user = req.user as UserProfile | undefined;
      if (!user?.id) {
        res.status(401).json({ success: false, message: 'Nicht authentifiziert' });
        return;
      }
      const body: unknown = (req.body as Record<string, unknown> | undefined)?.body;
      const outcome = await createGroupPost({
        groupId: req.params.groupId,
        userId: user.id,
        authorName: user.display_name || user.first_name || 'Jemand',
        body: typeof body === 'string' ? body : '',
        files: files.map((f) => ({
          storedFilename: f.filename,
          originalName: f.originalname,
          size: f.size,
        })),
      });
      if ('message' in outcome) {
        res.status(outcome.status).json({ success: false, message: outcome.message });
        return;
      }
      res.status(201).json({ success: true, ...outcome.data });
    } catch (error) {
      // createGroupPost hat die Dateien bei einem Wurf schon gelöscht.
      if (isMembershipError(error)) {
        res.status(403).json({ success: false, message: (error as Error).message });
        return;
      }
      log.error(`Group post create failed: ${(error as Error).message}`);
      res.status(500).json({ success: false, message: 'Beitrag konnte nicht gespeichert werden.' });
    }
  }
);

router.get(
  '/groups/:groupId/posts/:postId/files/:fileId',
  ensureAuthenticated,
  async (req: AuthRequest<{ groupId: string; postId: string; fileId: string }>, res: Response) => {
    const { groupId, postId, fileId } = req.params;
    try {
      const file = await getGroupPostFile({ groupId, postId, fileId, userId: req.user?.id ?? '' });
      if (!file) {
        res.status(404).json({ success: false, message: 'Datei nicht gefunden.' });
        return;
      }
      const filePath = path.join(GROUP_POST_DIR, path.basename(file.stored_filename));
      const stats = await fs.promises.stat(filePath);
      const disposition = isSafeToInline(file.mime_type) ? 'inline' : 'attachment';
      res.writeHead(200, {
        'Content-Length': stats.size,
        'Content-Type': file.mime_type,
        'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(file.file_name)}`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, max-age=3600',
      });
      fs.createReadStream(filePath).pipe(res);
    } catch (error) {
      if (isMembershipError(error)) {
        res.status(403).json({ success: false, message: (error as Error).message });
        return;
      }
      log.warn(`Group post file download failed: ${(error as Error).message}`);
      res.status(404).json({ success: false, message: 'Datei nicht gefunden.' });
    }
  }
);

export default router;
