/**
 * The two ways a turn ends before the response stage: suspended for the client
 * to act on, or answered with a fixed sentence.
 *
 * Both are shared by several stages (the reel gate, the sharepic licence, both
 * HITL gates, the client-tool interrupt), which is why they are plain functions
 * with explicit parameters rather than closures over the router's locals.
 */

import { createLogger } from '../../../utils/logger.js';
import { pipelineStateStore } from '../services/pipelineStateStore.js';
import {
  PROGRESS_MESSAGES,
  type SSEEventPayloads,
  type SSEWriter,
} from '../services/sseHelpers.js';
import { createMessage, touchThread } from '../services/threadPersistenceService.js';

import { type CleanupPending, type StreamBody, type StreamHandlerResult } from './types.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';
import type { StreamContext } from '../services/streamContext.js';

const log = createLogger('chatGraphContractRouter');

export interface SuspendTurnParams {
  /** Required, not optional: the store builds its Redis key by string
   *  concatenation, so a missing id used to write everything into the shared
   *  `pipeline_state:undefined` key — and emit an interrupt the client could
   *  never resume, dead-ending the turn. */
  threadId: string;
  interrupt: SSEEventPayloads['interrupt'];
  sse: SSEWriter;
  classifiedState: ChatGraphState;
  cleanupPending: CleanupPending;
  userId: string;
  agentId: StreamBody['agentId'];
  enabledTools: StreamBody['enabledTools'];
  modelId: StreamBody['modelId'];
  isNewThread: boolean;
  processedMeta: StreamContext['processedMeta'];
  userMessageId: string | null;
  imageAttachments: StreamContext['imageAttachments'];
  memoryContext: string | null;
  memoryRetrieveTimeMs: number;
  validMessages: StreamContext['validMessages'];
  forcedTool: boolean;
  rawDocumentIds: StreamBody['documentIds'];
  /** `initialState.startTime` — the turn clock the `done` metadata reports. */
  startTime: number;
}

/**
 * Everything a suspend needs that is fixed for the whole turn. Built once by
 * the router and handed to the stages that can suspend; only `threadId`,
 * `interrupt` and the still-moving `forcedTool` are supplied per call.
 */
export type SuspendTurnBase = Omit<SuspendTurnParams, 'threadId' | 'interrupt' | 'forcedTool'>;

/**
 * Suspend the turn: tell the client what it must do, park everything the
 * resume endpoint needs in Redis, then close cleanly.
 *
 * The 14-field requestContext has to stay in lockstep with what
 * resumePipeline reads back out. Three hand-maintained copies of it
 * guaranteed a new field would eventually land in only two.
 */
export async function suspendTurn({
  threadId,
  interrupt,
  sse,
  classifiedState,
  cleanupPending,
  userId,
  agentId,
  enabledTools,
  modelId,
  isNewThread,
  processedMeta,
  userMessageId,
  imageAttachments,
  memoryContext,
  memoryRetrieveTimeMs,
  validMessages,
  forcedTool,
  rawDocumentIds,
  startTime,
}: SuspendTurnParams): Promise<StreamHandlerResult> {
  sse.send('interrupt', interrupt);

  await pipelineStateStore.store(threadId, {
    classifiedState,
    requestContext: {
      userId,
      agentId: agentId ?? 'gruenerator-universal',
      enabledTools: enabledTools ?? {},
      ...(modelId != null && { modelId }),
      actualThreadId: threadId,
      isNewThread,
      processedMeta,
      userMessageId,
      imageAttachments,
      memoryContext,
      memoryRetrieveTimeMs,
      validMessages,
      forcedTool,
      ...(rawDocumentIds != null && { rawDocumentIds }),
    },
  });

  sse.send('done', {
    threadId,
    citations: [],
    interrupted: true,
    metadata: {
      intent: classifiedState.intent,
      searchCount: 0,
      totalTimeMs: Date.now() - startTime,
      classificationTimeMs: classifiedState.classificationTimeMs,
      searchTimeMs: 0,
    },
  });

  // Interrupt turn — nothing streamed; drop the empty placeholder (the
  // resume path persists its own message).
  await cleanupPending(true);
  sse.end();
  return { status: 200 as const, body: undefined };
}

export interface FinishTurnWithFixedTextParams {
  text: string;
  intent: NonNullable<ChatGraphState['intent']>;
  sse: SSEWriter;
  cleanupPending: CleanupPending;
  actualThreadId: string | undefined;
  /** Read for its `classificationTimeMs` at call time, as the closure this
   *  replaced did — a later stage may still be refining the turn's timings. */
  classifiedState: ChatGraphState;
  /** `initialState.startTime` — the turn clock the `done` metadata reports. */
  startTime: number;
}

/** Fixed-text-end parameters that are constant for the turn. */
export type FixedTextBase = Omit<FinishTurnWithFixedTextParams, 'text' | 'intent'>;

/**
 * End the turn with a fixed sentence — no model call. For the cases where
 * the honest answer is known in advance (this surface can't do it; there
 * is nothing here to edit), so paying a generation to phrase it would
 * only add latency and a chance to phrase it wrongly.
 */
export async function finishTurnWithFixedText({
  text,
  intent,
  sse,
  cleanupPending,
  actualThreadId,
  classifiedState,
  startTime,
}: FinishTurnWithFixedTextParams): Promise<StreamHandlerResult> {
  sse.send('response_start', { message: PROGRESS_MESSAGES.responseStart });
  sse.send('text_delta', { text });
  sse.send('done', {
    threadId: actualThreadId ?? null,
    citations: [],
    metadata: {
      intent,
      searchCount: 0,
      totalTimeMs: Date.now() - startTime,
      classificationTimeMs: classifiedState.classificationTimeMs,
      searchTimeMs: 0,
    },
  });
  if (actualThreadId) {
    try {
      await createMessage(actualThreadId, 'assistant', text, { intent });
      await touchThread(actualThreadId);
    } catch (err) {
      log.error('[ChatGraph] Failed to persist fixed-text turn:', err);
    }
  }
  await cleanupPending(true);
  sse.end();
  return { status: 200 as const, body: undefined };
}
