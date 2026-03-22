import fs from 'fs';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

import express, { type Router, type Response } from 'express';
import multer from 'multer';
import sharp from 'sharp';

import authMiddlewareModule from '../../../middleware/authMiddleware.js';
import { createLogger } from '../../../utils/logger.js';

import { getPostgresAndCheckMembership } from './groupCore.js';

import type { AuthRequest } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const log = createLogger('group-avatar');
const { requireAuth: ensureAuthenticated } = authMiddlewareModule;

const router: Router = express.Router();

const AVATAR_UPLOAD_DIR = path.join(__dirname, '../../../uploads/group-avatars');
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_DIMENSION = 512;
const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

void (async () => {
  try {
    await fs.promises.mkdir(AVATAR_UPLOAD_DIR, { recursive: true });
    log.debug(`Group avatar upload directory: ${AVATAR_UPLOAD_DIR}`);
  } catch (err: unknown) {
    log.error(`Failed to create group avatar directory: ${(err as Error).message}`);
  }
})();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Ungültiger Dateityp: ${file.mimetype}. Erlaubt: PNG, JPG, WebP, GIF`));
    }
  },
});

// ============================================================================
// POST /:groupId/avatar — Upload group avatar (admin-only)
// ============================================================================
router.post(
  '/:groupId/avatar',
  ensureAuthenticated,
  upload.single('avatar'),
  async (req: AuthRequest<{ groupId: string }>, res: Response) => {
    try {
      const { groupId } = req.params;
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: 'Nicht authentifiziert' });
        return;
      }

      const { postgres } = await getPostgresAndCheckMembership(groupId, userId, true);

      if (!req.file) {
        res.status(400).json({ success: false, error: 'Keine Datei hochgeladen' });
        return;
      }

      const filename = `${groupId}-${Date.now()}.webp`;
      const filepath = path.join(AVATAR_UPLOAD_DIR, filename);

      await sharp(req.file.buffer)
        .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'cover' })
        .webp({ quality: 85 })
        .toFile(filepath);

      const existingGroup = (await postgres.queryOne(
        'SELECT avatar_url FROM groups WHERE id = $1',
        [groupId],
        { table: 'groups' }
      )) as { avatar_url?: string | null } | null;

      if (existingGroup?.avatar_url) {
        const oldPath = path.join(AVATAR_UPLOAD_DIR, path.basename(existingGroup.avatar_url));
        fs.promises.unlink(oldPath).catch(() => {});
      }

      await postgres.query(
        'UPDATE groups SET avatar_url = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [filename, groupId],
        { table: 'groups' }
      );

      log.info(`Group avatar uploaded for group ${groupId} by user ${userId}`);
      res.json({ success: true, avatar_url: filename });
    } catch (err: unknown) {
      const error = err as Error;
      log.error(`Group avatar upload error: ${error.message}`);
      if (error.message.includes('Mitglied') || error.message.includes('Admin')) {
        res.status(403).json({ success: false, error: error.message });
        return;
      }
      res.status(500).json({ success: false, error: 'Fehler beim Hochladen des Gruppenbildes' });
    }
  }
);

// ============================================================================
// GET /:groupId/avatar — Serve group avatar
// ============================================================================
router.get(
  '/:groupId/avatar',
  ensureAuthenticated,
  async (req: AuthRequest<{ groupId: string }>, res: Response) => {
    try {
      const { groupId } = req.params;

      const { postgres } = await getPostgresAndCheckMembership(groupId, req.user?.id || '', false);

      const group = (await postgres.queryOne(
        'SELECT avatar_url FROM groups WHERE id = $1',
        [groupId],
        { table: 'groups' }
      )) as { avatar_url?: string | null } | null;

      if (!group?.avatar_url) {
        res.status(404).json({ success: false, error: 'Kein Gruppenbild vorhanden' });
        return;
      }

      const filepath = path.join(AVATAR_UPLOAD_DIR, path.basename(group.avatar_url));

      try {
        await fs.promises.access(filepath);
      } catch {
        res.status(404).json({ success: false, error: 'Gruppenbild nicht gefunden' });
        return;
      }

      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('Content-Type', 'image/webp');
      res.sendFile(filepath);
    } catch (err: unknown) {
      const error = err as Error;
      log.error(`Group avatar serve error: ${error.message}`);
      if (error.message.includes('Mitglied')) {
        res.status(403).json({ success: false, error: error.message });
        return;
      }
      res.status(500).json({ success: false, error: 'Fehler beim Laden des Gruppenbildes' });
    }
  }
);

// ============================================================================
// DELETE /:groupId/avatar — Remove group avatar (admin-only)
// ============================================================================
router.delete(
  '/:groupId/avatar',
  ensureAuthenticated,
  async (req: AuthRequest<{ groupId: string }>, res: Response) => {
    try {
      const { groupId } = req.params;
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: 'Nicht authentifiziert' });
        return;
      }

      const { postgres } = await getPostgresAndCheckMembership(groupId, userId, true);

      const group = (await postgres.queryOne(
        'SELECT avatar_url FROM groups WHERE id = $1',
        [groupId],
        { table: 'groups' }
      )) as { avatar_url?: string | null } | null;

      if (group?.avatar_url) {
        const filepath = path.join(AVATAR_UPLOAD_DIR, path.basename(group.avatar_url));
        fs.promises.unlink(filepath).catch(() => {});
      }

      await postgres.query(
        'UPDATE groups SET avatar_url = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [groupId],
        { table: 'groups' }
      );

      log.info(`Group avatar deleted for group ${groupId} by user ${userId}`);
      res.json({ success: true });
    } catch (err: unknown) {
      const error = err as Error;
      log.error(`Group avatar delete error: ${error.message}`);
      if (error.message.includes('Mitglied') || error.message.includes('Admin')) {
        res.status(403).json({ success: false, error: error.message });
        return;
      }
      res.status(500).json({ success: false, error: 'Fehler beim Löschen des Gruppenbildes' });
    }
  }
);

export default router;
