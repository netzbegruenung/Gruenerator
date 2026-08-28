import { randomUUID } from 'node:crypto';

import { createLogger } from '../../../utils/logger.js';
import {
  createMessage,
  finalizeAssistantMessage,
  touchThread,
} from '../services/threadPersistenceService.js';
import { toolApprovalStateStore } from '../services/toolApprovalStateStore.js';

import type { StreamHandlerResult } from './types.js';
import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';
import type { PendingToolCall, PersistedStep } from '../services/agenticLoop/types.js';
import type { StoredRequestContext } from '../services/pipelineStateStore.js';
import type { SSEWriter } from '../services/sseHelpers.js';

const log = createLogger('ToolApprovalSuspend');

export interface SuspendForApprovalParams {
  sse: SSEWriter;
  threadId: string;
  classifiedState: ChatGraphState;
  requestContext: StoredRequestContext;
  pendingApproval: PendingToolCall[];
  /** Was bis zum Gate gestreamt wurde — bleibt stehen und wird fortgeschrieben. */
  partialText: string;
  priorSteps: PersistedStep[];
  /** Die vor dem Streamen angelegte Platzhalter-Zeile, falls vorhanden. */
  pendingId: string | null;
  startTime: number;
}

/**
 * Pausiert den Zug an einem freigabepflichtigen Werkzeugaufruf.
 *
 * Reihenfolge ist Vertrag: erst persistieren, dann fragen. Wer zuerst fragt und
 * dann speichert, riskiert eine Karte, deren Fortsetzung nirgends steht.
 *
 * Anders als `suspendTurn` wird der Platzhalter NICHT verworfen: hier wurde
 * eventuell schon Text gestreamt, und die Karte muss einen Reload überleben.
 */
export async function suspendForToolApproval({
  sse,
  threadId,
  classifiedState,
  requestContext,
  pendingApproval,
  partialText,
  priorSteps,
  pendingId,
  startTime,
}: SuspendForApprovalParams): Promise<StreamHandlerResult> {
  const approvalTurnId = randomUUID();

  const stored = await toolApprovalStateStore.store(threadId, {
    approvalTurnId,
    calls: pendingApproval,
    priorSteps,
    partialText,
    pausedMessageId: pendingId,
    classifiedState,
    requestContext,
  });

  if (!stored) {
    // Ohne gespeicherten Zustand gäbe es nichts fortzusetzen. Dann lieber
    // ehrlich abbrechen als eine Karte zeigen, deren Knöpfe ins Leere führen.
    log.error(`[Freigabe] Zustand nicht speicherbar (Thread ${threadId}) — Zug wird beendet`);
    sse.send('error', {
      error: 'Die Freigabe konnte nicht vorbereitet werden. Bitte stelle die Anfrage noch einmal.',
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
    pendingApproval: {
      approvalTurnId,
      calls: pendingApproval,
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
    log.error(`[Freigabe] Nachricht nicht persistierbar (Thread ${threadId}):`, err);
  }

  sse.send('interrupt', {
    interruptType: 'tool_approval',
    threadId,
    approvalTurnId,
    calls: pendingApproval.map((c) => ({
      toolCallId: c.toolCallId,
      toolName: c.toolName,
      args: c.args,
      ...(c.title ? { title: c.title } : {}),
      ...(c.serverName ? { serverName: c.serverName } : {}),
    })),
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

  log.info(
    `[Freigabe] Zug pausiert (Thread ${threadId}, ${pendingApproval.length} Aufruf(e)): ${pendingApproval
      .map((c) => c.toolName)
      .join(', ')}`
  );
  return { status: 200 as const, body: undefined };
}
