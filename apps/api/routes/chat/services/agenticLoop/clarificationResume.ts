/**
 * Fortsetzung eines Zuges, der auf die Antwort einer `ask_human`-Rückfrage
 * gewartet hat (#3220).
 *
 * Dasselbe Muster wie `approvalResume`: kein Wiederaufsetzen des alten Loops —
 * der ist beendet. Stattdessen ein frischer agentischer Zug, der die Schritte
 * von vorher plus die BEANTWORTETE Frage als Beobachtung einspielt
 * (`buildToolObservationReplay` über `resumeApproval.priorSteps`) und
 * weiterschreibt. Die Antwort der Nutzer*in erreicht das Modell als
 * tool-result des eigenen ask_human-Aufrufs — nicht als neue User-Nachricht,
 * die die Frage aus dem Zusammenhang risse.
 */
import { buildSystemMessage } from '../../../../agents/langgraph/ChatGraph/index.js';
import { createLogger } from '../../../../utils/logger.js';
import { suspendForLoopClarification } from '../../streamStages/clarificationLoopSuspend.js';
import { suspendForToolApproval } from '../../streamStages/toolApprovalSuspend.js';
import { loopClarificationStateStore } from '../loopClarificationStateStore.js';
import { finalizeAssistantMessage, touchThread } from '../threadPersistenceService.js';

import { streamAgenticResponse } from './agenticRespondService.js';

import type { PersistedStep } from './types.js';
import type { SSEWriter } from '../sseHelpers.js';
import type { ModelMessage } from 'ai';
import type { Request } from 'express';

const log = createLogger('ClarificationResume');

export interface ClarificationResumeResult {
  handled: true;
  status: 200;
  body: undefined;
}

/**
 * `fail` wird hereingereicht statt importiert, damit dieses Modul nichts über
 * die Transportschicht wissen muss (und im Test ohne SSE prüfbar bleibt).
 */
export async function runClarificationLoopResume(params: {
  req: Request;
  sse: SSEWriter;
  threadId: string;
  userId: string;
  answer: string;
  fail: (message: string, code: 'invalid_request' | 'unauthorized') => ClarificationResumeResult;
}): Promise<ClarificationResumeResult> {
  const { req, sse, threadId, userId, answer, fail } = params;

  const stored = await loopClarificationStateStore.get(threadId);
  if (!stored) {
    return fail(
      'Die Rückfrage ist abgelaufen. Bitte stelle die Anfrage noch einmal.',
      'invalid_request'
    );
  }
  if (stored.requestContext.userId !== userId) {
    return fail('Nicht berechtigt.', 'unauthorized');
  }

  // Genau eine Fortsetzung: ein zweiter Tab darf denselben Zug nicht zweimal
  // weiterlaufen lassen. Fail-closed, wenn Redis nicht antwortet.
  const claimed = await loopClarificationStateStore.claim(threadId, stored.askTurnId);
  if (!claimed) {
    return fail('Diese Rückfrage wurde bereits beantwortet.', 'invalid_request');
  }

  log.info(
    `[Rückfrage] Fortsetzung Thread ${threadId}: "${answer.slice(0, 80)}" auf "${stored.question.slice(0, 80)}"`
  );

  // Die beantwortete Frage als regulärer Schritt: so trägt der Replay sie als
  // tool-call/tool-result-Paar, und die Persistenz zeigt sie nach dem Reload
  // als beantwortete Klärung.
  const askStep: PersistedStep = {
    toolCallId: stored.toolCallId,
    toolName: 'ask_human',
    args: {
      question: stored.question,
      ...(stored.options ? { options: stored.options } : {}),
    },
    result: { answer },
  };

  const { classifiedState, requestContext } = stored;

  try {
    // Karten-Kontinuität: der ask_human-Zweig des Client-Adapters führt —
    // anders als der Freigabe-Zweig — keine Vorkarten in den Resume-Stream
    // mit. Serverseitig re-emittiert (Client-Dedupe über stepId macht das
    // sicher), damit die Karten der schon gelaufenen Schritte nicht mit der
    // Antwort aus der Blase verschwinden. Die beantwortete Frage selbst wird
    // NICHT re-emittiert: eine ask_human-Karte ohne Ergebnis wäre wieder
    // beantwortbar und blockierte den nächsten Zug.
    for (const step of stored.priorSteps) {
      sse.send('tool_step_start', {
        stepId: step.toolCallId,
        toolName: step.toolName,
        args: step.args,
        ...(step.serverName ? { serverName: step.serverName } : {}),
      });
      sse.send('tool_step_result', {
        stepId: step.toolCallId,
        toolName: step.toolName,
        ok: step.ok !== false,
        result: step.result,
      });
    }

    const outcome = await streamAgenticResponse({
      finalState: classifiedState,
      // Neu gebaut statt aus Redis geholt: derselbe Weg wie im Erst-Zug.
      systemMessage: await buildSystemMessage(classifiedState, { retrievalExpected: true }),
      messages: requestContext.validMessages as ModelMessage[],
      ...(requestContext.modelId != null && { modelId: requestContext.modelId }),
      requestId: `clarification_resume_${Date.now()}`,
      sse,
      req,
      threadId,
      // Der Freigabe-Mechanismus trägt auch die Rückfrage: Schritte seeden,
      // Cross-Turn-Replay überspringen, Beobachtungs-Replay bauen. Es gibt
      // nichts auszuführen und nichts Abgelehntes.
      resumeApproval: {
        priorSteps: [...stored.priorSteps, askStep],
        approved: [],
        denied: [],
      },
    });

    // Eine Blase: die pausierte Zeile wird fortgeschrieben, nicht ergänzt.
    const mergedText = [stored.partialText, outcome.fullText].filter((t) => t.trim()).join('\n\n');

    // Die Fortsetzung pausiert selbst wieder. Der Rückfrage-Zustand ist mit der
    // Antwort verbraucht — löschen, damit er keine spätere ask_human-Antwort
    // beschattet; die neue Pause schreibt ihren eigenen Zustand.
    if (outcome.pendingAsk) {
      await loopClarificationStateStore.delete(threadId);
      return {
        ...(await suspendForLoopClarification({
          sse,
          threadId,
          classifiedState,
          requestContext,
          pendingAsk: outcome.pendingAsk,
          partialText: mergedText,
          priorSteps: outcome.steps,
          pendingId: stored.pausedMessageId,
          startTime: Date.now(),
        })),
        handled: true as const,
      };
    }
    if (outcome.pendingApproval && outcome.pendingApproval.length > 0) {
      await loopClarificationStateStore.delete(threadId);
      return {
        ...(await suspendForToolApproval({
          sse,
          threadId,
          classifiedState,
          requestContext,
          pendingApproval: outcome.pendingApproval,
          partialText: mergedText,
          priorSteps: outcome.steps,
          pendingId: stored.pausedMessageId,
          startTime: Date.now(),
        })),
        handled: true as const,
      };
    }

    const metadata: Record<string, unknown> = {
      intent: classifiedState.intent,
      searchCount: outcome.sources.length,
      citations: outcome.citations,
      toolCalls: outcome.steps,
      pendingClarification: {
        askTurnId: stored.askTurnId,
        toolCallId: stored.toolCallId,
        question: stored.question,
        ...(stored.options ? { options: stored.options } : {}),
        resolved: true,
        answer,
      },
    };
    if (stored.pausedMessageId) {
      // Die Versätze der pausierten Schritte zeigen in den alten Text — dieselbe
      // Regel wie bei jeder Textersetzung: fallen lassen, dann lädt der Thread
      // wieder karten-zuerst statt falsch verschachtelt.
      for (const step of outcome.steps) delete step.textOffset;
      await finalizeAssistantMessage(stored.pausedMessageId, mergedText || null, metadata);
      await touchThread(threadId);
    }

    await loopClarificationStateStore.delete(threadId);

    sse.send('done', { threadId, citations: outcome.citations });
    sse.end();
    return { handled: true, status: 200 as const, body: undefined };
  } catch (err) {
    // Der Anspruch wird zurückgegeben: die Fortsetzung ist nicht gelaufen, ein
    // erneuter Versuch soll möglich bleiben.
    await loopClarificationStateStore.releaseClaim(threadId, stored.askTurnId);
    log.error(`[Rückfrage] Fortsetzung gescheitert (Thread ${threadId}):`, err);
    return fail('Die Fortsetzung ist fehlgeschlagen. Bitte versuche es erneut.', 'invalid_request');
  }
}
