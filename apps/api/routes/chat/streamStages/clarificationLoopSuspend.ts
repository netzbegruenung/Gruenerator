import { randomUUID } from 'node:crypto';

import { createLogger } from '../../../utils/logger.js';
import {
  loopClarificationStateStore,
  type StoredLoopClarificationState,
} from '../services/loopClarificationStateStore.js';
import {
  createMessage,
  finalizeAssistantMessage,
  touchThread,
} from '../services/threadPersistenceService.js';

import type { StreamHandlerResult } from './types.js';
import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';
import type { PendingAskRequest, PersistedStep } from '../services/agenticLoop/types.js';
import type { StoredRequestContext } from '../services/pipelineStateStore.js';
import type { SSEWriter } from '../services/sseHelpers.js';

const log = createLogger('ClarificationLoopSuspend');

export interface SuspendForLoopClarificationParams {
  sse: SSEWriter;
  threadId: string;
  classifiedState: ChatGraphState;
  requestContext: StoredRequestContext;
  pendingAsk: PendingAskRequest;
  /** Was bis zur Frage gestreamt wurde — bleibt stehen und wird fortgeschrieben. */
  partialText: string;
  priorSteps: PersistedStep[];
  /** Die vor dem Streamen angelegte Platzhalter-Zeile, falls vorhanden. */
  pendingId: string | null;
  startTime: number;
}

/**
 * Pausiert den Zug an einer `ask_human`-Rückfrage aus dem Loop (#3220).
 *
 * 1:1 das Muster von `suspendForToolApproval` — erst persistieren, dann fragen
 * — mit der Wire-Form der Pre-Loop-Klärung: die Karte ist der
 * `thinking_step {toolName: 'ask_human'}` (den Web UND ausgelieferte
 * Mobile-Binaries rendern), der Interrupt bleibt `clarification` (das Enum in
 * den Contracts ist für ausgelieferte Binaries geschlossen). Anders als
 * `suspendTurn` wird der Platzhalter NICHT verworfen: mitten im Zug wurde
 * eventuell schon Text gestreamt, und Karte + Teilantwort müssen einen Reload
 * überleben (`metadata.pendingClarification`).
 */
export async function suspendForLoopClarification({
  sse,
  threadId,
  classifiedState,
  requestContext,
  pendingAsk,
  partialText,
  priorSteps,
  pendingId,
  startTime,
}: SuspendForLoopClarificationParams): Promise<StreamHandlerResult> {
  const askTurnId = randomUUID();

  const payload: Omit<StoredLoopClarificationState, 'createdAt'> = {
    askTurnId,
    toolCallId: pendingAsk.toolCallId,
    question: pendingAsk.question,
    ...(pendingAsk.options ? { options: pendingAsk.options } : {}),
    priorSteps,
    partialText,
    pausedMessageId: pendingId,
    classifiedState,
    requestContext,
  };
  const stored = await loopClarificationStateStore.store(threadId, payload);

  if (!stored) {
    // Ohne gespeicherten Zustand gäbe es nichts fortzusetzen. Dann lieber
    // ehrlich abbrechen als eine Frage zeigen, deren Antwort ins Leere führt.
    log.error(`[Rückfrage] Zustand nicht speicherbar (Thread ${threadId}) — Zug wird beendet`);
    sse.send('error', {
      error: 'Die Rückfrage konnte nicht vorbereitet werden. Bitte stelle die Anfrage noch einmal.',
    });
    sse.send('done', { threadId, citations: [], interrupted: false });
    sse.end();
    return { status: 200 as const, body: undefined };
  }

  const metadata: Record<string, unknown> = {
    intent: classifiedState.intent,
    searchCount: 0,
    citations: [],
    toolCalls: priorSteps,
    pendingClarification: {
      askTurnId,
      toolCallId: pendingAsk.toolCallId,
      question: pendingAsk.question,
      ...(pendingAsk.options ? { options: pendingAsk.options } : {}),
      resolved: false,
    },
  };

  try {
    if (pendingId) {
      await finalizeAssistantMessage(pendingId, partialText || null, metadata);
    } else {
      await createMessage(threadId, 'assistant', partialText || null, metadata);
    }
    await touchThread(threadId);
  } catch (err) {
    log.error(`[Rückfrage] Nachricht nicht persistierbar (Thread ${threadId}):`, err);
  }

  // Exakt die Wire-Form der Pre-Loop-Klärung (`clarificationStage`): der
  // Client macht aus dem thinking_step die beantwortbare ask_human-Karte;
  // ein `completed` kommt absichtlich nie.
  sse.sendRaw('thinking_step', {
    stepId: pendingAsk.toolCallId,
    toolName: 'ask_human',
    title: 'Stelle Klärungsfrage...',
    status: 'in_progress',
    args: {
      question: pendingAsk.question,
      options: pendingAsk.options ?? null,
    },
  });

  sse.send('interrupt', {
    interruptType: 'clarification',
    question: pendingAsk.question,
    ...(pendingAsk.options ? { options: pendingAsk.options } : {}),
    threadId,
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
  sse.end();

  log.info(`[Rückfrage] Zug pausiert (Thread ${threadId}): "${pendingAsk.question.slice(0, 80)}"`);
  return { status: 200 as const, body: undefined };
}
