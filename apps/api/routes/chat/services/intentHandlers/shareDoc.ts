/**
 * share_doc — resolve the target group, then hand the user a confirm card.
 * Short-circuits the turn: no LLM response is needed.
 */

import { findBestMatch } from '@gruenerator/shared/utils';

import { createLogger } from '../../../../utils/logger.js';
import { CONFIRM_ACTION_CONFIG } from '../confirmActionService.js';
import { extractTextContent } from '../messageHelpers.js';
import { pendingActionStore } from '../pendingActionStore.js';
import { createMessage, touchThread } from '../threadPersistenceService.js';

import type {
  ChatGraphState,
  PendingAction,
} from '../../../../agents/langgraph/ChatGraph/types.js';
import type { SSEWriter } from '../sseHelpers.js';
import type { ModelMessage } from 'ai';

const log = createLogger('ChatGraphController');

/**
 * Handle share_doc intent (short-circuit — no LLM response needed).
 * Returns true if handled (caller should return early).
 */
export async function handleShareDoc(opts: {
  sse: SSEWriter;
  classifiedState: ChatGraphState;
  actualThreadId: string;
  userId: string;
  lastUserMessage?: ModelMessage;
  rawDocMentionIds?: string[];
  rawDocumentChatIds?: string[];
}): Promise<boolean> {
  const {
    sse,
    classifiedState,
    actualThreadId,
    userId,
    lastUserMessage,
    rawDocMentionIds,
    rawDocumentChatIds,
  } = opts;

  const shareDocDoneMeta = {
    intent: classifiedState.intent,
    searchCount: 0,
    totalTimeMs: Date.now() - classifiedState.startTime,
    classificationTimeMs: classifiedState.classificationTimeMs,
    searchTimeMs: 0,
  };

  async function sendShareDocError(text: string) {
    sse.send('response_start', { message: 'Antwort wird erstellt...' });
    sse.send('text_delta', { text });
    await createMessage(actualThreadId, 'assistant', text);
    await touchThread(actualThreadId);
    sse.send('done', { threadId: actualThreadId, citations: [], metadata: shareDocDoneMeta });
    sse.end();
  }

  const { targetGroupName } = classifiedState;
  if (!targetGroupName) {
    await sendShareDocError(
      'Bitte gib an, mit welcher Gruppe du das Dokument teilen möchtest. Beispiel: „Teile das mit AG Umwelt"'
    );
    return true;
  }

  const docId = rawDocMentionIds?.[0] || rawDocumentChatIds?.[0] || null;
  if (!docId) {
    await sendShareDocError(
      'Kein Dokument gefunden. Bitte erwähne ein Dokument mit @Dokument oder erstelle zuerst eins.'
    );
    return true;
  }

  const { getPostgresInstance } = await import('../../../../database/services/PostgresService.js');
  const pg = getPostgresInstance();

  const [docRows, userGroups] = await Promise.all([
    pg.query('SELECT title FROM collaborative_documents WHERE id = $1 AND is_deleted = false', [
      docId,
    ]) as Promise<{ title: string }[]>,
    pg.query(
      `SELECT g.id, g.name FROM groups g
       INNER JOIN group_memberships gm ON gm.group_id = g.id
       WHERE gm.user_id = $1 ORDER BY g.name ASC`,
      [userId]
    ) as Promise<{ id: string; name: string }[]>,
  ]);

  if (!docRows.length) {
    await sendShareDocError('Das referenzierte Dokument wurde nicht gefunden.');
    return true;
  }

  const docTitle = docRows[0].title || 'Unbenanntes Dokument';

  if (userGroups.length === 0) {
    await sendShareDocError(
      'Du bist noch keiner Gruppe beigetreten. Erstelle oder tritt einer Gruppe bei, um Dokumente zu teilen.'
    );
    return true;
  }

  const groupNames = userGroups.map((g) => g.name);
  const match = findBestMatch(targetGroupName, groupNames, 0.5);
  const matchedGroup = match ? userGroups.find((g) => g.name === match.match) : null;

  if (!matchedGroup) {
    const groupList = groupNames.map((n) => `• ${n}`).join('\n');
    await sendShareDocError(
      `Keine passende Gruppe für „${targetGroupName}" gefunden.\n\nDeine Gruppen:\n${groupList}`
    );
    return true;
  }

  const lastUserText = lastUserMessage
    ? extractTextContent(lastUserMessage.content).toLowerCase()
    : '';
  const isReadOnly = /nur lesen|read.?only|leserecht|ansehen|viewer|lesezugriff/.test(lastUserText);
  const permissionLevel = isReadOnly ? ('viewer' as const) : ('editor' as const);
  const permissionLabel = permissionLevel === 'editor' ? 'Bearbeiten' : 'Nur lesen';

  const pendingAction: PendingAction = {
    actionId: `action_${Date.now()}`,
    threadId: actualThreadId,
    userId,
    title: 'Dokument teilen',
    preview: `${docTitle} → ${matchedGroup.name}`,
    createdAt: Date.now(),
    type: 'share_doc',
    payload: {
      docId,
      docTitle,
      groupId: matchedGroup.id,
      groupName: matchedGroup.name,
      permissionLevel,
    },
  };

  sse.send('response_start', { message: 'Antwort wird erstellt...' });
  const responseText = `Dokument **„${docTitle}"** mit **${matchedGroup.name}** teilen (${permissionLabel}):`;
  sse.send('text_delta', { text: responseText });
  await createMessage(actualThreadId, 'assistant', responseText);
  await touchThread(actualThreadId);

  const ssePayload = CONFIRM_ACTION_CONFIG[pendingAction.type];
  sse.send('confirm_action', {
    actionId: pendingAction.actionId,
    type: pendingAction.type,
    title: ssePayload.title,
    description: ssePayload.description,
    icon: ssePayload.icon,
    metadata: [
      { key: 'Dokument', value: docTitle },
      { key: 'Gruppe', value: matchedGroup.name },
      { key: 'Berechtigung', value: permissionLabel },
    ],
    confirmLabel: ssePayload.confirmLabel,
    cancelLabel: 'Abbrechen',
    threadId: actualThreadId,
  });

  await pendingActionStore.store(pendingAction);
  log.info(
    `[ChatGraph] Share confirm action stored: ${pendingAction.actionId} (${docTitle} → ${matchedGroup.name})`
  );

  sse.send('done', { threadId: actualThreadId, citations: [], metadata: shareDocDoneMeta });
  sse.end();
  return true;
}
