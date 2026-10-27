import { randomUUID } from 'node:crypto';

import { createLogger } from '../../../utils/logger.js';
import {
  loopClientToolStateStore,
  type StoredLoopClientToolState,
} from '../services/loopClientToolStateStore.js';
import { persistSuspendedTurnAttachments } from '../services/postResponseService.js';
import {
  createMessage,
  finalizeAssistantMessage,
  touchThread,
} from '../services/threadPersistenceService.js';

import type { StreamHandlerResult } from './types.js';
import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';
import type { PendingClientToolRequest, PersistedStep } from '../services/agenticLoop/types.js';
import type { StoredRequestContext } from '../services/pipelineStateStore.js';
import type { SSEWriter } from '../services/sseHelpers.js';

const log = createLogger('ClientToolLoopSuspend');

export interface SuspendForLoopClientToolParams {
  sse: SSEWriter;
  threadId: string;
  classifiedState: ChatGraphState;
  requestContext: StoredRequestContext;
  pendingClientTool: PendingClientToolRequest;
  /** Was bis zur Pause gestreamt wurde — bleibt stehen und wird fortgeschrieben. */
  partialText: string;
  priorSteps: PersistedStep[];
  /** Die vor dem Streamen angelegte Platzhalter-Zeile, falls vorhanden. */
  pendingId: string | null;
  startTime: number;
  /** Eine vor dieser Pause aufgelöste Pause (die entschiedene Freigabe-Karte) —
   *  steht in der Nachricht, damit die Karte einen Reload übersteht, und reist
   *  im Zustand mit bis zum Ende des Zuges. */
  resolvedPause?: Record<string, unknown>;
}

/**
 * Pausiert den Zug an einem Loop-Werkzeug, das der Browser ausführt
 * (`check_sharepic` → `render_sharepic`).
 *
 * Das Muster von `suspendForLoopClarification` — erst persistieren, dann
 * pausieren — mit der Wire-Form des früheren Pre-Loop-`run_python`: ein
 * `client_tool`-Interrupt, den der Client-Adapter selbst ausführt und mit
 * `{threadId, toolName, result}` beantwortet. Keine Karte für den
 * zurückgehaltenen Aufruf: sie entsteht erst in der Fortsetzung, mit Ergebnis.
 */
export async function suspendForLoopClientTool({
  sse,
  threadId,
  classifiedState,
  requestContext,
  pendingClientTool,
  partialText,
  priorSteps,
  pendingId,
  startTime,
  resolvedPause,
}: SuspendForLoopClientToolParams): Promise<StreamHandlerResult> {
  const payload: Omit<StoredLoopClientToolState, 'createdAt'> = {
    clientToolTurnId: randomUUID(),
    toolCallId: pendingClientTool.toolCallId,
    toolName: pendingClientTool.toolName,
    args: pendingClientTool.args,
    clientToolName: pendingClientTool.clientToolName,
    clientArgs: pendingClientTool.clientArgs,
    priorSteps,
    partialText,
    pausedMessageId: pendingId,
    classifiedState,
    requestContext,
    ...(resolvedPause ? { resolvedPause } : {}),
  };
  const stored = await loopClientToolStateStore.store(threadId, payload);

  if (!stored) {
    // Ohne gespeicherten Zustand gäbe es keine Fortsetzung: lieber ehrlich
    // abbrechen als den Browser rendern lassen, dessen Ergebnis ins Leere führt.
    log.error(`[Client-Tool] Zustand nicht speicherbar (Thread ${threadId}) — Zug wird beendet`);
    sse.send('error', {
      error:
        'Der Schritt im Browser konnte nicht vorbereitet werden. Bitte stelle die Anfrage noch einmal.',
    });
    sse.send('done', { threadId, citations: [], interrupted: false });
    sse.end();
    return { status: 200 as const, body: undefined };
  }

  // Erst die Anhänge des Turns sichern, dann fragen: der Browser holt die
  // Tabellen-Bytes für Pyodide aus diesen Zeilen (auch nach einem Reload).
  await persistSuspendedTurnAttachments(threadId, requestContext);

  const metadata: Record<string, unknown> = {
    intent: classifiedState.intent,
    searchCount: 0,
    citations: [],
    ...resolvedPause,
    toolCalls: priorSteps,
  };

  try {
    if (pendingId) {
      await finalizeAssistantMessage(pendingId, partialText || null, metadata);
    } else {
      await createMessage(threadId, 'assistant', partialText || null, metadata);
    }
    await touchThread(threadId);
  } catch (err) {
    log.error(`[Client-Tool] Nachricht nicht persistierbar (Thread ${threadId}):`, err);
  }

  sse.send('interrupt', {
    interruptType: 'client_tool',
    toolName: pendingClientTool.clientToolName,
    args: pendingClientTool.clientArgs,
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

  log.info(
    `[Client-Tool] Zug pausiert (Thread ${threadId}): ${pendingClientTool.toolName} → ${pendingClientTool.clientToolName}`
  );
  return { status: 200 as const, body: undefined };
}
