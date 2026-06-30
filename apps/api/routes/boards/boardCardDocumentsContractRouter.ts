/**
 * ts-rest contract router for /api/board-card-documents (JSON ops: list /
 * unlink). These are the documents the board agent (@Grünerator) creates from a
 * card comment; the worker records them in board_card_documents (see
 * cardDocumentService). Mount via mountBoardCardDocumentsContractRouter(app).
 */

import { boardCardDocumentsContract, type BoardCardDocumentEntry } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';

import { checkBoardAccess } from './boardAccess.js';

import type { Application } from 'express';

const log = createLogger('boardCardDocumentsContract');
const db = getPostgresInstance();

function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface CardDocumentRow {
  id: string;
  board_id: string;
  card_id: string;
  document_id: string;
  title: string;
  created_by: string;
  created_at: string;
}

function toEntry(r: CardDocumentRow): BoardCardDocumentEntry {
  return {
    id: r.id,
    board_id: r.board_id,
    card_id: r.card_id,
    document_id: r.document_id,
    title: r.title,
    created_by: r.created_by,
    created_at: r.created_at,
    url: `/docs/${r.document_id}`,
  };
}

const s = initServer();

export const boardCardDocumentsContractRouter = s.router(boardCardDocumentsContract, {
  listCardDocuments: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const { boardId, cardId } = args.params;

      const { hasAccess } = await checkBoardAccess(boardId, userId);
      if (!hasAccess) return { status: 403 as const, body: { error: 'Kein Zugriff' } };

      const rows = await db.query<CardDocumentRow>(
        `SELECT * FROM board_card_documents
         WHERE board_id = $1 AND card_id = $2
         ORDER BY created_at ASC`,
        [boardId, cardId]
      );
      return { status: 200 as const, body: rows.map(toEntry) };
    } catch (error) {
      log.error('Error listing card documents', { error: errMsg(error) });
      return { status: 500 as const, body: { error: 'Dokumente konnten nicht geladen werden' } };
    }
  },

  unlinkCardDocument: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const { boardId, linkId } = args.params;

      const { hasAccess, canEdit } = await checkBoardAccess(boardId, userId);
      if (!hasAccess || !canEdit)
        return { status: 403 as const, body: { error: 'Kein Schreibzugriff' } };

      const rows = await db.query<{ id: string }>(
        `SELECT id FROM board_card_documents WHERE id = $1 AND board_id = $2`,
        [linkId, boardId]
      );
      if (rows.length === 0)
        return { status: 404 as const, body: { error: 'Verknüpfung nicht gefunden' } };

      // Removes only the link row; the underlying document stays intact.
      await db.query(`DELETE FROM board_card_documents WHERE id = $1`, [linkId]);
      return { status: 200 as const, body: { success: true as const } };
    } catch (error) {
      log.error('Error unlinking card document', { error: errMsg(error) });
      return { status: 500 as const, body: { error: 'Verknüpfung konnte nicht entfernt werden' } };
    }
  },
});

export function mountBoardCardDocumentsContractRouter(app: Application): void {
  createExpressEndpoints(boardCardDocumentsContract, boardCardDocumentsContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'boardCardDocumentsContract'),
  });
}
