import fs from 'fs';
import os from 'os';
import path from 'path';

import { Router, type Request, type Response } from 'express';
import multer from 'multer';

import { requireAuth } from '../../middleware/authMiddleware.js';
import { transferService } from '../../services/transferService.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('transfer');
const router: Router = Router();

const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB

const diskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(os.tmpdir(), 'gruenerator-transfer');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({
  storage: diskStorage,
  limits: { fileSize: MAX_FILE_SIZE },
});

interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

/**
 * POST /api/transfer/upload
 * Upload file to Wolke and create a transfer share link.
 * Uses disk storage + streaming to handle files up to 2GB.
 */
router.post(
  '/upload',
  requireAuth,
  upload.single('file'),
  async (req: MulterRequest, res: Response): Promise<void> => {
    const tempPath = req.file?.path;

    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Nicht authentifiziert' });
        return;
      }

      if (!req.file) {
        res.status(400).json({ error: 'Keine Datei hochgeladen' });
        return;
      }

      const { shareLinkId, folderPath, password, expiresInDays, message } = req.body as {
        shareLinkId: string;
        folderPath?: string;
        password?: string;
        expiresInDays?: string;
        message?: string;
      };

      if (!shareLinkId) {
        res.status(400).json({ error: 'Wolke-Verbindung (shareLinkId) ist erforderlich' });
        return;
      }

      const { originalname, mimetype, size, path: filePath } = req.file;

      log.info('Transfer upload started', {
        userId,
        filename: originalname,
        size,
        mimetype,
      });

      const result = await transferService.uploadAndCreateTransferStream(
        userId,
        filePath,
        originalname,
        mimetype,
        size,
        shareLinkId,
        folderPath as string | undefined,
        {
          password: password || undefined,
          expiresInDays: expiresInDays ? parseInt(expiresInDays, 10) : undefined,
          message: message || undefined,
        }
      );

      res.json({
        success: true,
        shareToken: result.shareToken,
        shareUrl: `/share/${result.shareToken}`,
        id: result.id,
      });
    } catch (error) {
      const err = error as Error;
      log.error('Transfer upload failed', { error: err.message });

      if (err.message.includes('storage') || err.message.includes('507')) {
        res.status(507).json({
          error: 'Nicht genug Speicherplatz in deiner Wolke.',
        });
        return;
      }

      if (err.message.includes('nicht gefunden') || err.message.includes('deaktiviert')) {
        res.status(400).json({ error: err.message });
        return;
      }

      res.status(500).json({ error: 'Upload fehlgeschlagen. Bitte versuche es erneut.' });
    } finally {
      if (tempPath) {
        const expectedDir = path.resolve(os.tmpdir(), 'gruenerator-transfer');
        const resolvedTemp = path.resolve(tempPath);
        if (resolvedTemp.startsWith(expectedDir + path.sep)) {
          fs.unlink(tempPath, () => {});
        }
      }
    }
  }
);

/**
 * GET /api/transfer/list
 * Authenticated — returns the user's transfer history
 */
router.get('/list', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Nicht authentifiziert' });
      return;
    }

    const transfers = await transferService.listUserTransfers(userId);

    res.json({
      success: true,
      transfers: transfers.map((t) => ({
        id: t.id,
        shareToken: t.share_token,
        fileName: t.file_name,
        fileSize: t.file_size,
        mimeType: t.mime_type,
        downloadCount: t.download_count,
        createdAt: t.created_at,
        expiresAt: t.expires_at ?? null,
        isPasswordProtected: !!t.password_hash,
      })),
    });
  } catch (error) {
    log.error('Failed to list transfers', { error });
    res.status(500).json({ error: 'Fehler beim Laden der Transfers' });
  }
});

/**
 * DELETE /api/transfer/:token
 * Authenticated — deletes a transfer (owner only)
 */
router.delete(
  '/:token',
  requireAuth,
  async (req: Request<{ token: string }>, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Nicht authentifiziert' });
        return;
      }

      const deleted = await transferService.deleteTransfer(userId, req.params.token as string);

      if (!deleted) {
        res.status(404).json({ error: 'Transfer nicht gefunden' });
        return;
      }

      res.json({ success: true });
    } catch (error) {
      log.error('Failed to delete transfer', { error });
      res.status(500).json({ error: 'Fehler beim Löschen des Transfers' });
    }
  }
);

export default router;
