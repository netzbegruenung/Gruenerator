/**
 * A voice call is a turn sequence in an ordinary chat thread, not a
 * conversation of its own: the call opens or continues a thread, every final
 * line lands in it, and what the call creates is persisted the way a chat turn
 * persists it (voicePort.ts). Reload, the thread list and the follow-up edit
 * tools then see a call like any typed chat.
 *
 * The server never hears the call — audio and transcripts run between the
 * device and Mistral's LiveKit room — so the device reports the final lines.
 */
import { type ModelMessage } from 'ai';

import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { getDefaultAgentId } from '../../routes/chat/agents/agentLoader.js';
import { seedThreadTitleIfUnnamed } from '../../routes/chat/services/postResponseService.js';
import { canWriteThread } from '../../routes/chat/services/threadAccessService.js';
import {
  createMessage,
  createThread,
  touchThread,
} from '../../routes/chat/services/threadPersistenceService.js';
import { ThreadId, UserId } from '../../utils/types/branded.js';
import { threadNeedsTitle } from '../chat/threadTitleService.js';

/** Enough of the thread for the call to know what was said, little enough for a voice prompt. */
const HISTORY_MESSAGES = 20;
const HISTORY_CHARS = 6000;

/** The thread the call writes to: the given one if the person may write there, else a new one. */
export async function openVoiceThread(
  userId: string,
  threadId: string | null
): Promise<string | null> {
  if (threadId) {
    return (await canWriteThread(ThreadId(threadId), UserId(userId))) ? threadId : null;
  }
  return (await createThread(userId, getDefaultAgentId())).id;
}

export async function loadVoiceHistory(threadId: string): Promise<ModelMessage[]> {
  const rows = (await getPostgresInstance().query(
    `SELECT role, content FROM chat_messages
     WHERE thread_id = $1 AND role IN ('user', 'assistant') AND content IS NOT NULL AND content <> ''
     ORDER BY created_at DESC
     LIMIT $2`,
    [threadId, HISTORY_MESSAGES]
  )) as { role: 'user' | 'assistant'; content: string }[];
  return rows.reverse().map((r) => ({ role: r.role, content: r.content }));
}

/** The thread so far, for the voice agent's instructions; empty for a new thread. */
export function historyForInstructions(history: ModelMessage[]): string {
  const lines = history.map(
    (m) => `${m.role === 'user' ? 'Person' : 'Grünerator'}: ${String(m.content)}`
  );
  let text = lines.join('\n');
  if (text.length > HISTORY_CHARS) text = `…${text.slice(-HISTORY_CHARS)}`;
  return text ? `\n\nBisheriger Verlauf dieser Unterhaltung, an den du anknüpfst:\n${text}` : '';
}

export async function saveVoiceLine(
  threadId: string,
  userId: string,
  role: 'user' | 'assistant',
  text: string
): Promise<void> {
  await createMessage(threadId, role, text, undefined, role === 'user' ? userId : undefined);
  await touchThread(threadId);
  // A thread a call started has no title until its first exchange is complete.
  if (role !== 'assistant' || !(await threadNeedsTitle(threadId))) return;
  const history = await loadVoiceHistory(threadId);
  const firstUser = history.find((m) => m.role === 'user');
  await seedThreadTitleIfUnnamed({
    threadId,
    userText: firstUser ? String(firstUser.content) : null,
    fullText: text,
  });
}
