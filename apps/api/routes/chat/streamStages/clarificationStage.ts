/**
 * HITL gate: ask the user before answering when the classifier says the turn
 * is under-specified.
 *
 * `actualThreadId` is part of the gate, not an assertion inside it: a
 * clarification the client cannot resume is worse than no clarification, so a
 * thread-less turn falls through to the normal pipeline instead.
 */

import { createLogger } from '../../../utils/logger.js';
import { type SSEWriter } from '../services/sseHelpers.js';

import { suspendTurn, type SuspendTurnBase } from './turnEnd.js';
import { type InitialState, type MaybeHandled } from './types.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';

const log = createLogger('chatGraphContractRouter');

export interface ClarificationStageParams {
  sse: SSEWriter;
  classifiedState: ChatGraphState;
  initialState: InitialState;
  suspendBase: SuspendTurnBase;
  forcedTool: boolean;
  isCompound: boolean;
  actualThreadId: string | undefined;
}

export async function runClarificationStage({
  sse,
  classifiedState,
  initialState,
  suspendBase,
  forcedTool,
  isCompound,
  actualThreadId,
}: ClarificationStageParams): Promise<MaybeHandled> {
  // === HITL: Check if clarification is needed ===
  // `actualThreadId` is part of the gate, not an assertion inside it: a
  // clarification the client cannot resume is worse than no clarification,
  // so a thread-less turn falls through to the normal pipeline instead.
  if (
    classifiedState.needsClarification &&
    actualThreadId != null &&
    !forcedTool &&
    !isCompound &&
    !initialState.attachmentContext &&
    !initialState.boardContext &&
    !initialState.documentMentionContext
  ) {
    log.info(`[ChatGraph] Clarification needed: "${classifiedState.clarificationQuestion}"`);

    const stepId = `clarify_${Date.now()}`;
    sse.sendRaw('thinking_step', {
      stepId,
      toolName: 'ask_human',
      title: 'Stelle Klärungsfrage...',
      status: 'in_progress',
      args: {
        question: classifiedState.clarificationQuestion,
        options: classifiedState.clarificationOptions,
      },
    });

    const suspended = await suspendTurn({
      ...suspendBase,
      forcedTool,
      threadId: actualThreadId,
      interrupt: {
        interruptType: 'clarification',
        question: classifiedState.clarificationQuestion!,
        ...(classifiedState.clarificationOptions != null && {
          options: classifiedState.clarificationOptions,
        }),
        threadId: actualThreadId,
      },
    });
    return { handled: true, result: suspended };
  }

  return { handled: false };
}
