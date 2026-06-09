/**
 * Plain Express router for board attachment binary I/O (multipart upload +
 * authenticated download). The JSON ops (list/delete/cover) are the ts-rest
 * boardAttachmentsContract. Mounted at /api/board-attachments (after requireAuth).
 *
 * Download is access-controlled via checkBoardAccess — unlike the video upload
 * precedent, board files must not be world-readable by filename.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import { Router, type Request, type Response } from 'express';
import multer from 'multer';

import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import { recordCardActivity } from '../../services/boards/cardActivityService.js';
import {
  autoSubscribe,
  getCardSubscribers,
} from '../../services/boards/cardSubscriptionService.js';
import { createNotification } from '../../services/notifications/NotificationService.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';

import { checkBoardAccess } from './boardAccess.js';
import {
  ATTACHMENT_DIR,
  MAX_ATTACHMENT_SIZE,
  deleteStoredFile,
  lookupMime,
} from './boardAttachmentStorage.js';

const log = createLogger('board-attachment-upload');
const db = getPostgresInstance();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, ATTACHMENT_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.bin';
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: MAX_ATTACHMENT_SIZE } });

export const boardAttachmentUploadRouter: Router = Router();

boardAttachmentUploadRouter.post(
  '/:boardId/cards/:cardId/upload',
  upload.single('file'),
  async (req: Request<{ boardId: string; cardId: string }>, res: Response): Promise<void> => {
    const { boardId, cardId } = req.params;
    const file = req.file;
    try {
      const userId = getAuthedUser(req).id;
      const { hasAccess, canEdit, boardTitle } = await checkBoardAccess(boardId, userId);
      if (!hasAccess || !canEdit) {
        if (file) await deleteStoredFile(file.filename);
        res.status(403).json({ error: 'Kein Schreibzugriff' });
        return;
      }
      if (!file) {
        res.status(400).json({ error: 'Keine Datei übermittelt' });
        return;
      }

      const rows = await db.query<{ id: string; created_at: string }>(
        `INSERT INTO board_attachments
           (board_id, card_id, user_id, file_name, stored_filename, mime_type, file_size)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, created_at`,
        [
          boardId,
          cardId,
          userId,
          file.originalname,
          file.filename,
          file.mimetype || lookupMime(file.filename),
          file.size,
        ]
      );
      const inserted = rows[0];

      // Uploader auto-watches; record activity; notify other watchers.
      await autoSubscribe(boardId, cardId, userId, 'manual');
      await recordCardActivity({
        boardId,
        cardId,
        userId,
        type: 'attachment_added',
        payload: { attachmentId: inserted.id, fileName: file.originalname },
      });
      void fanOutAttachmentNotification(boardId, cardId, userId, file.originalname, boardTitle);

      res.status(201).json({
        id: inserted.id,
        board_id: boardId,
        card_id: cardId,
        user_id: userId,
        file_name: file.originalname,
        stored_filename: file.filename,
        mime_type: file.mimetype || lookupMime(file.filename),
        file_size: file.size,
        is_cover: false,
        created_at: inserted.created_at,
        url: `/api/board-attachments/${boardId}/attachments/${inserted.id}/download`,
      });
    } catch (error) {
      if (file) await deleteStoredFile(file.filename);
      log.error('Attachment upload failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Upload fehlgeschlagen' });
    }
  }
);

boardAttachmentUploadRouter.get(
  '/:boardId/attachments/:attachmentId/download',
  async (req: Request<{ boardId: string; attachmentId: string }>, res: Response): Promise<void> => {
    const { boardId, attachmentId } = req.params;
    try {
      const userId = getAuthedUser(req).id;
      const { hasAccess } = await checkBoardAccess(boardId, userId);
      if (!hasAccess) {
        res.status(403).json({ error: 'Kein Zugriff' });
        return;
      }

      const rows = await db.query<{
        stored_filename: string;
        file_name: string;
        mime_type: string | null;
      }>(
        `SELECT stored_filename, file_name, mime_type FROM board_attachments
         WHERE id = $1 AND board_id = $2`,
        [attachmentId, boardId]
      );
      const row = rows[0];
      if (!row) {
        res.status(404).json({ error: 'Anhang nicht gefunden' });
        return;
      }

      const safe = path.basename(row.stored_filename);
      const filePath = path.join(ATTACHMENT_DIR, safe);
      await fs.promises.access(filePath);
      const stats = await fs.promises.stat(filePath);

      res.writeHead(200, {
        'Content-Length': stats.size,
        'Content-Type': row.mime_type || lookupMime(safe),
        'Content-Disposition': `inline; filename="${encodeURIComponent(row.file_name)}"`,
        'Cache-Control': 'private, max-age=3600',
      });
      fs.createReadStream(filePath).pipe(res);
    } catch (error) {
      log.warn('Attachment download failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(404).json({ error: 'Datei nicht gefunden' });
    }
  }
);

async function fanOutAttachmentNotification(
  boardId: string,
  cardId: string,
  actorId: string,
  fileName: string,
  boardTitle: string | null
): Promise<void> {
  try {
    const subscribers = await getCardSubscribers(boardId, cardId);
    await Promise.all(
      subscribers
        .filter((uid) => uid !== actorId)
        .map((uid) =>
          createNotification({
            userId: uid,
            type: 'board_attachment_added',
            title: `Neuer Anhang${boardTitle ? ` in „${boardTitle}"` : ''}`,
            body: fileName,
            actionUrl: `/boards/${boardId}?card=${cardId}`,
            metadata: { boardId, cardId },
            groupKey: `board-attachment-${boardId}-${cardId}`,
          }).catch(() => null)
        )
    );
  } catch (error) {
    log.warn('Attachment notification fan-out failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
