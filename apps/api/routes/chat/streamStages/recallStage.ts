/**
 * What the model gets to know about the user's own past work.
 *
 * Two paths: the flag-gated recall tool loop owns the whole `chat_history`
 * turn, and — for everyone else — a best-effort enrichment pass that injects
 * relevant past chats, office documents and reels as context. The Space roster
 * is always surfaced when the thread is filed in one, so the model knows what
 * it could search even when no recall pass ran.
 */

import { createLogger } from '../../../utils/logger.js';
import { withTimeout } from '../../../utils/withTimeout.js';
import { extractTextContent } from '../services/messageHelpers.js';
import {
  formatOfficeDocsBlock,
  formatPastChatsBlock,
  formatReelsBlock,
  getSpaceRecallScope,
  recallOfficeDocuments,
  recallPastChats,
  recallReels,
  rerankRecall,
} from '../services/pastChatRecallService.js';
import {
  handleRecallToolLoop,
  isChatRecallLoopEnabled,
} from '../services/recallToolLoopService.js';
import { sendChatWarning, type SSEWriter } from '../services/sseHelpers.js';

import { type CleanupPending, type MaybeHandled } from './types.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';
import type { StreamContext } from '../services/streamContext.js';

const log = createLogger('chatGraphContractRouter');

/** Cap best-effort past-chat recall so it never delays the user-facing stream. */
const EXTERNAL_CONTEXT_TIMEOUT_MS = 3_000;

export interface RecallStageParams {
  sse: SSEWriter;
  classifiedState: ChatGraphState;
  cleanupPending: CleanupPending;
  actualThreadId: string | undefined;
  userId: string;
  lastUserMessage: StreamContext['lastUserMessage'];
  isNewThread: boolean;
  memoryEnabled: boolean;
}

export async function runRecallStage({
  sse,
  classifiedState,
  cleanupPending,
  actualThreadId,
  userId,
  lastUserMessage,
  isNewThread,
  memoryEnabled,
}: RecallStageParams): Promise<MaybeHandled> {
  // === Recall tool-loop (flag-gated) ===
  // For the chat_history intent, let the model search + read the user's own
  // content on demand (size-probed) instead of pre-injecting everything.
  // Handles the whole turn; when off, falls through to the deterministic
  // chat_history branch in executeIntentPipeline below.
  if (
    classifiedState.intent === 'chat_history' &&
    isChatRecallLoopEnabled() &&
    actualThreadId &&
    lastUserMessage
  ) {
    const handled = await handleRecallToolLoop({
      sse,
      threadId: actualThreadId,
      userId,
      instruction: (extractTextContent(lastUserMessage.content) as string) || '',
      query:
        classifiedState.searchQuery ||
        (extractTextContent(lastUserMessage.content) as string) ||
        '',
      startTime: Date.now(),
    });
    if (handled) {
      await cleanupPending(true);
      return { handled: true, result: { status: 200 as const, body: undefined } };
    }
  }

  // === Chat history context enrichment ===
  // Explicit: the user referenced a past conversation (classifier/regex).
  // Proactive: first turn of a new thread — surface a relevant past chat so
  // the assistant can continue with continuity, gated on the same
  // memory_enabled toggle as mem0. The `chat_history` tool handles its own
  // retrieval, so skip the proactive pass for it.
  const explicitRecall =
    classifiedState.searchSources?.includes('chat_history') && !!classifiedState.searchQuery;
  const proactiveRecall =
    isNewThread && memoryEnabled && !!lastUserMessage && classifiedState.intent !== 'chat_history';

  // Space scope: when the thread is filed in a Space, recall is restricted to
  // that Space's chats and the model is told which threads it can search.
  const spaceScope = actualThreadId
    ? await getSpaceRecallScope(actualThreadId, userId).catch((err: unknown) => {
        // Was a bare noop — the Space roster silently vanished and recall
        // widened to all chats without anyone noticing.
        log.warn(`[ChatGraph] Space recall scope failed: ${err}`);
        return null;
      })
    : null;

  if (explicitRecall || proactiveRecall) {
    try {
      const recallQuery =
        classifiedState.searchQuery ||
        (lastUserMessage
          ? (extractTextContent(lastUserMessage.content) as string).slice(0, 200)
          : '');
      if (recallQuery.trim()) {
        // Fetch chats + office content + reels, then cross-source rerank to
        // the few most relevant — all inside the best-effort timeout.
        const recalled = await withTimeout(
          (async () => {
            const [chatResults, officeDocs, reels] = await Promise.all([
              recallPastChats(userId, recallQuery, {
                ...(actualThreadId != null && { excludeThreadId: actualThreadId }),
                limit: 3,
                ...(spaceScope && { threadIds: spaceScope.threadIds }),
              }),
              recallOfficeDocuments(userId, recallQuery, 3),
              recallReels(userId, recallQuery, 3),
            ]);
            return rerankRecall(recallQuery, chatResults, officeDocs, 4, reels);
          })(),
          EXTERNAL_CONTEXT_TIMEOUT_MS,
          'past-work recall'
        ).catch(
          () =>
            ({ chats: [], officeDocs: [], reels: [] }) as Awaited<ReturnType<typeof rerankRecall>>
        );
        const blocks = [
          spaceScope?.rosterBlock ?? '',
          recalled.chats.length > 0 ? formatPastChatsBlock(recalled.chats) : '',
          formatOfficeDocsBlock(recalled.officeDocs),
          formatReelsBlock(recalled.reels),
        ].filter(Boolean);
        if (blocks.length > 0) {
          classifiedState.chatHistoryContext = blocks.join('\n\n');
          log.info(
            `[ChatGraph] Injected recall: ${recalled.chats.length} chats, ${recalled.officeDocs.length} docs, ${recalled.reels.length} reels for "${recallQuery}" (${explicitRecall ? 'explicit' : 'proactive'})`
          );
        }
      }
    } catch (err) {
      // An EXPLICIT recall request ("was haben wir letzte Woche besprochen")
      // that finds nothing because the search broke must not read as "there
      // was nothing". Proactive recall is best-effort and stays quiet.
      log.warn(`[ChatGraph] Past-chat recall failed: ${err}`);
      if (explicitRecall) sendChatWarning(sse, 'recall_degraded');
    }
  }

  // Always surface the Space roster when filed in a Space, even if no recall
  // pass ran (so the model knows it can search the Space's chats on demand).
  if (spaceScope) {
    const existing = classifiedState.chatHistoryContext;
    if (!existing) {
      classifiedState.chatHistoryContext = spaceScope.rosterBlock;
    } else if (!existing.includes(spaceScope.rosterBlock)) {
      classifiedState.chatHistoryContext = `${spaceScope.rosterBlock}\n\n${existing}`;
    }
  }
  return { handled: false };
}
