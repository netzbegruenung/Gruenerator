/**
 * How a turn ends before the response stage when the client has to act on it.
 *
 * Shared by several stages (both HITL gates, the client-tool interrupt), which
 * is why it is a plain function with explicit parameters rather than a closure
 * over the router's locals.
 */

import { pipelineStateStore } from '../services/pipelineStateStore.js';
import { persistSuspendedTurnAttachments } from '../services/postResponseService.js';
import { type SSEEventPayloads, type SSEWriter } from '../services/sseHelpers.js';

import { type CleanupPending, type StreamBody, type StreamHandlerResult } from './types.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';
import type { StreamContext } from '../services/streamContext.js';

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
  // Before the client acts: it refills its Pyodide store from these rows.
  await persistSuspendedTurnAttachments(threadId, { userId, processedMeta, userMessageId });
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
