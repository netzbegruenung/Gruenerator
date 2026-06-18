/**
 * Façade over the Hocuspocus internal board API.
 *
 * Links an agent-generated document into a board card's "Dokumente" list
 * (field-linked-docs). The write goes through Hocuspocus' `openDirectConnection`
 * on the service side, so it applies whether or not anyone has the board open and
 * never races a live editing session. Mirrors canvasStateService's internal-fetch
 * pattern. Best-effort: failures are logged and swallowed so the agent task still
 * completes (the document is created, shared, and linked in the comment regardless).
 */
import { createLogger } from '../../utils/logger.js';

const log = createLogger('boardLinkService');

const INTERNAL_URL = process.env.HOCUSPOCUS_INTERNAL_URL || 'http://localhost:1241';
const INTERNAL_TOKEN = process.env.HOCUSPOCUS_INTERNAL_TOKEN || '';
const FETCH_TIMEOUT_MS = 5000;

export interface LinkedDoc {
  id: string;
  title: string;
}

/**
 * Returns whether the link actually persisted. Failures are still logged and
 * swallowed (the agent task completes regardless), but the boolean lets callers
 * avoid claiming "verknüpft" in the UI when the link didn't apply.
 */
export async function linkDocumentToCard(
  boardId: string,
  cardId: string,
  doc: LinkedDoc
): Promise<boolean> {
  if (!INTERNAL_TOKEN) {
    log.warn('HOCUSPOCUS_INTERNAL_TOKEN not configured — skipping card link');
    return false;
  }
  try {
    const res = await fetch(
      `${INTERNAL_URL}/internal/board/${encodeURIComponent(boardId)}/link-doc`,
      {
        method: 'POST',
        headers: {
          'x-internal-token': INTERNAL_TOKEN,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ cardId, doc }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      }
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`internal POST returned ${res.status}: ${text.slice(0, 200)}`);
    }
    log.info(`Linked doc ${doc.id} to card ${cardId} on board ${boardId}`);
    return true;
  } catch (err) {
    log.warn(
      `Failed to link doc ${doc.id} to card ${cardId} on board ${boardId}: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return false;
  }
}
