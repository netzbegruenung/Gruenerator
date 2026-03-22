import { Router, type Request, type Response } from 'express';
import multer from 'multer';

import { requireAuth } from '../../middleware/authMiddleware.js';
import { transferService } from '../../services/transferService.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('transfer');
const router: Router = Router();

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
});

interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

/**
 * POST /api/transfer/upload
 * Upload file to Wolke and create a transfer share link.
 * Info + download are handled by the shared /api/share/:token routes.
 */
router.post(
  '/upload',
  requireAuth,
  upload.single('file'),
  async (req: MulterRequest, res: Response): Promise<void> => {
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

      const { shareLinkId, folderPath } = req.body as {
        shareLinkId: string;
        folderPath?: string;
      };

      if (!shareLinkId) {
        res.status(400).json({ error: 'Wolke-Verbindung (shareLinkId) ist erforderlich' });
        return;
      }

      const { originalname, buffer, mimetype, size } = req.file;

      log.info('Transfer upload started', {
        userId,
        filename: originalname,
        size,
        mimetype,
      });

      const result = await transferService.uploadAndCreateTransfer(
        userId,
        buffer,
        originalname,
        mimetype,
        shareLinkId,
        folderPath as string | undefined
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
