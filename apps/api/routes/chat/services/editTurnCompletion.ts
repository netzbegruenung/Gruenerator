/**
 * Shared terminal step for the edit/loop turn services.
 *
 * sharepicEditService, reelEditService, socialPostEditService,
 * sharepicAgenticService and recallToolLoopService each ended a turn the same
 * way: emit the reply, emit `done`, persist the assistant message with one
 * retry, touch the thread, warn on a failed persist, close the stream. Five
 * copies of a sequence whose retry policy and warning behaviour must not drift
 * — a silent persist failure lets state and history diverge.
 */

import { withRetry } from '../../../services/search/searchRetryStrategy.js';
import { createLogger } from '../../../utils/logger.js';

import { sendChatWarning, type SSEWriter } from './sseHelpers.js';
import { createMessage, touchThread } from './threadPersistenceService.js';

const log = createLogger('ChatEditTurn');

export interface FinishEditTurnParams {
  sse: SSEWriter;
  /** Null for turns that never got a persisted thread — the reply still streams. */
  threadId: string | null;
  text: string;
  /**
   * Persisted + wire intent. A plain string, not SearchIntent: the edit
   * services use pseudo-intents (`sharepic_edit`, `reel_edit`,
   * `social_post_edit`) that are deliberately absent from the contract enum,
   * which is why `done` goes out via sendRaw here.
   */
  intent: string;
  /** withRetry label, e.g. 'reelEdit:persist'. */
  persistLabel: string;
  /** Log prefix for a failed persist, e.g. '[ReelEdit]'. */
  logPrefix: string;
  startTime: number;
  classificationTimeMs?: number;
  searchCount?: number;
  toolCalls?: Record<string, unknown>[];
  /** Caller already streamed the text — skip response_start/text_delta. */
  streamed?: boolean;
}

export async function finishEditTurn({
  sse,
  threadId,
  text,
  intent,
  persistLabel,
  logPrefix,
  startTime,
  classificationTimeMs,
  searchCount = 0,
  toolCalls,
  streamed = false,
}: FinishEditTurnParams): Promise<void> {
  if (!streamed) {
    sse.send('response_start', { message: 'Antwort wird erstellt...' });
    sse.send('text_delta', { text });
  }

  sse.sendRaw('done', {
    threadId,
    citations: [],
    metadata: {
      intent,
      searchCount,
      totalTimeMs: Date.now() - startTime,
      ...(classificationTimeMs != null && { classificationTimeMs }),
      searchTimeMs: 0,
    },
  });

  if (threadId) {
    try {
      await withRetry(
        () =>
          createMessage(threadId, 'assistant', text, {
            intent,
            ...(toolCalls && toolCalls.length > 0 ? { toolCalls } : {}),
          }),
        { maxRetries: 1, delayMs: 300, isRecoverable: () => true, label: persistLabel }
      );
      await touchThread(threadId);
    } catch (err) {
      // Retry + Warnung: ein stiller Persist-Fehler lässt State und History divergieren.
      log.error(`${logPrefix} Failed to persist message:`, err);
      sendChatWarning(sse, 'persist_failed');
    }
  }

  sse.end();
}
