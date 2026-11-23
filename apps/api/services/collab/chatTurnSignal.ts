/**
 * Server-side live signal for team chats. Web members learn about a peer's turn
 * from the sender's Hocuspocus awareness, which only the web runtime sets; a
 * turn from the app or the API never ticks. So the API itself tells Hocuspocus
 * to poke the `chat-<threadId>` room whenever it persists a turn step, and the
 * web clients refetch through the same path as for the awareness nudge.
 *
 * Fire-and-forget: never throws, a failed signal only costs liveness.
 */
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { createLogger } from '../../utils/logger.js';

import { hocuspocusInternal } from './hocuspocusInternal.js';

const log = createLogger('chatTurnSignal');

export type ChatTurnSignalKind = 'started' | 'message';

async function isTeamChat(threadId: string): Promise<boolean> {
  const rows = await getPostgresInstance().query(
    `SELECT 1
     FROM group_content_shares gcs
     INNER JOIN groups g ON g.id = gcs.group_id AND g.deleted_at IS NULL
     WHERE gcs.content_type = 'chat_threads' AND gcs.content_id = $1::text
     LIMIT 1`,
    [threadId]
  );
  return rows.length > 0;
}

/** Call with `void`; only threads shared to a project/group are signalled. */
export async function signalTeamChatTurn(
  threadId: string,
  kind: ChatTurnSignalKind,
  by: string | null
): Promise<void> {
  if (!process.env.HOCUSPOCUS_INTERNAL_TOKEN) return; // internal API disabled
  try {
    if (!(await isTeamChat(threadId))) return;
    await hocuspocusInternal('POST', `/internal/chat/${encodeURIComponent(threadId)}/turn-signal`, {
      kind,
      by,
    });
  } catch (err) {
    log.warn(
      `turn signal (${kind}) for thread ${threadId} failed: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
}
