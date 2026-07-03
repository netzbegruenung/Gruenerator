/**
 * Persist the link between a board card and a document the agent created
 * ("Grünerator-Dokumente").
 *
 * This replaces the fragile Yjs-cell write (boardLinkService → Hocuspocus
 * internal API), which silently failed for most boards. A plain Postgres INSERT
 * in the same process the worker already uses is reliable; the card lists these
 * rows via the board-card-documents contract. Idempotent on (card_id,
 * document_id) so a retried task never double-links.
 */
import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import { createLogger } from '../../utils/logger.js';

const db = getPostgresInstance();
const log = createLogger('cardDocumentService');

export async function linkAgentDocumentToCard(
  boardId: string,
  cardId: string,
  documentId: string,
  title: string,
  createdBy: string
): Promise<boolean> {
  try {
    await db.query(
      `INSERT INTO board_card_documents (board_id, card_id, document_id, title, created_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (card_id, document_id) DO NOTHING`,
      [boardId, cardId, documentId, title, createdBy]
    );
    log.info(`Linked agent doc ${documentId} to card ${cardId} on board ${boardId}`);
    return true;
  } catch (err) {
    log.warn(
      `Failed to link agent doc ${documentId} to card ${cardId} on board ${boardId}: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return false;
  }
}
