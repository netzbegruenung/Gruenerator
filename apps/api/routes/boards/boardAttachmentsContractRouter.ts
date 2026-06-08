/**
 * ts-rest contract router for /api/board-attachments (JSON ops: list / delete /
 * set-cover). Multipart upload + binary download live in boardAttachmentUpload.ts
 * (plain Express). Mount via mountBoardAttachmentsContractRouter(app).
 */

import { boardAttachmentsContract, type BoardAttachmentEntry } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';

import { checkBoardAccess } from './boardAccess.js';
import { deleteStoredFile } from './boardAttachmentStorage.js';

import type { Application } from 'express';

const log = createLogger('boardAttachmentsContract');
const db = getPostgresInstance();

function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface AttachmentRow {
  id: string;
  board_id: string;
  card_id: string;
  user_id: string;
  file_name: string;
  stored_filename: string;
  mime_type: string | null;
  file_size: number | string | null;
  is_cover: boolean;
  created_at: string;
}

function downloadUrl(boardId: string, id: string): string {
  return `/api/board-attachments/${boardId}/attachments/${id}/download`;
}

function toEntry(r: AttachmentRow): BoardAttachmentEntry {
  return {
    id: r.id,
    board_id: r.board_id,
    card_id: r.card_id,
    user_id: r.user_id,
    file_name: r.file_name,
    stored_filename: r.stored_filename,
    mime_type: r.mime_type,
    file_size: Number(r.file_size ?? 0),
    is_cover: r.is_cover,
    created_at: r.created_at,
    url: downloadUrl(r.board_id, r.id),
  };
}

const s = initServer();

export const boardAttachmentsContractRouter = s.router(boardAttachmentsContract, {
  listAttachments: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const { boardId, cardId } = args.params;

      const { hasAccess } = await checkBoardAccess(boardId, userId);
      if (!hasAccess) return { status: 403 as const, body: { error: 'Kein Zugriff' } };

      const rows = await db.query<AttachmentRow>(
        `SELECT * FROM board_attachments
         WHERE board_id = $1 AND card_id = $2
         ORDER BY created_at ASC`,
        [boardId, cardId]
      );
      return { status: 200 as const, body: rows.map(toEntry) };
    } catch (error) {
      log.error('Error listing attachments', { error: errMsg(error) });
      return { status: 500 as const, body: { error: 'Anhänge konnten nicht geladen werden' } };
    }
  },

  deleteAttachment: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const { boardId, attachmentId } = args.params;

      const { hasAccess, canEdit, createdBy } = await checkBoardAccess(boardId, userId);
      if (!hasAccess || !canEdit)
        return { status: 403 as const, body: { error: 'Kein Schreibzugriff' } };

      const rows = await db.query<{ user_id: string; stored_filename: string }>(
        `SELECT user_id, stored_filename FROM board_attachments WHERE id = $1 AND board_id = $2`,
        [attachmentId, boardId]
      );
      const row = rows[0];
      if (!row) return { status: 404 as const, body: { error: 'Anhang nicht gefunden' } };
      if (row.user_id !== userId && createdBy !== userId)
        return { status: 403 as const, body: { error: 'Keine Berechtigung' } };

      await db.query(`DELETE FROM board_attachments WHERE id = $1`, [attachmentId]);
      await deleteStoredFile(row.stored_filename);
      return { status: 200 as const, body: { success: true as const } };
    } catch (error) {
      log.error('Error deleting attachment', { error: errMsg(error) });
      return { status: 500 as const, body: { error: 'Anhang konnte nicht gelöscht werden' } };
    }
  },

  setCover: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const { boardId, attachmentId } = args.params;
      const { isCover } = args.body;

      const { hasAccess, canEdit } = await checkBoardAccess(boardId, userId);
      if (!hasAccess || !canEdit)
        return { status: 403 as const, body: { error: 'Kein Schreibzugriff' } };

      const rows = await db.query<{ card_id: string }>(
        `SELECT card_id FROM board_attachments WHERE id = $1 AND board_id = $2`,
        [attachmentId, boardId]
      );
      const row = rows[0];
      if (!row) return { status: 404 as const, body: { error: 'Anhang nicht gefunden' } };

      // Only one cover per card.
      if (isCover) {
        await db.query(
          `UPDATE board_attachments SET is_cover = FALSE WHERE board_id = $1 AND card_id = $2`,
          [boardId, row.card_id]
        );
      }
      await db.query(`UPDATE board_attachments SET is_cover = $1 WHERE id = $2`, [
        isCover,
        attachmentId,
      ]);
      return { status: 200 as const, body: { success: true as const } };
    } catch (error) {
      log.error('Error setting cover', { error: errMsg(error) });
      return { status: 500 as const, body: { error: 'Cover konnte nicht gesetzt werden' } };
    }
  },
});

export function mountBoardAttachmentsContractRouter(app: Application): void {
  createExpressEndpoints(boardAttachmentsContract, boardAttachmentsContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'boardAttachmentsContract'),
  });
}
