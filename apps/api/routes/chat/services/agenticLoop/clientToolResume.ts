/**
 * Fortsetzung eines Zuges, der auf das Ergebnis eines Browser-Werkzeugs
 * gewartet hat (`check_sharepic` → `render_sharepic`).
 *
 * Dasselbe Muster wie `clarificationResume`: kein Wiederaufsetzen des alten
 * Loops, sondern ein frischer agentischer Zug, der die Schritte von vorher plus
 * den BEANTWORTETEN Aufruf als Beobachtung einspielt. Das Ergebnis des
 * Browsers (das Bild) ist nicht die Antwort selbst: erst die Prüfung daran
 * (`reviewRenderedSharepic`) wird das tool-result des zurückgehaltenen
 * `check_sharepic`-Aufrufs.
 */
import { buildSystemMessage } from '../../../../agents/langgraph/ChatGraph/index.js';
import { createLogger } from '../../../../utils/logger.js';
import { renderedImageOf, reviewRenderedSharepic } from '../../agents/sharepicCheckTool.js';
import { suspendForLoopClarification } from '../../streamStages/clarificationLoopSuspend.js';
import { suspendForLoopClientTool } from '../../streamStages/clientToolLoopSuspend.js';
import { finishResumedLoopTurn } from '../../streamStages/loopResumeEnd.js';
import { suspendForToolApproval } from '../../streamStages/toolApprovalSuspend.js';
import { loopClientToolStateStore } from '../loopClientToolStateStore.js';

import { streamAgenticResponse } from './agenticRespondService.js';

import type { PersistedStep } from './types.js';
import type { SSEWriter } from '../sseHelpers.js';
import type { ModelMessage } from 'ai';
import type { Request } from 'express';

const log = createLogger('ClientToolResume');

export interface ClientToolResumeResult {
  handled: true;
  status: 200;
  body: undefined;
}

/**
 * `fail` wird hereingereicht statt importiert (siehe `runClarificationLoopResume`).
 */
export async function runClientToolLoopResume(params: {
  req: Request;
  sse: SSEWriter;
  threadId: string;
  userId: string;
  result: unknown;
  fail: (message: string, code: 'invalid_request' | 'unauthorized') => ClientToolResumeResult;
}): Promise<ClientToolResumeResult> {
  const { req, sse, threadId, userId, result, fail } = params;

  const stored = await loopClientToolStateStore.get(threadId);
  if (!stored) {
    return fail(
      'Die Prüfung ist abgelaufen. Bitte stelle die Anfrage noch einmal.',
      'invalid_request'
    );
  }
  if (stored.requestContext.userId !== userId) {
    return fail('Nicht berechtigt.', 'unauthorized');
  }

  // Genau eine Fortsetzung: ein zweiter Tab darf denselben Zug nicht zweimal
  // weiterlaufen lassen. Fail-closed, wenn Redis nicht antwortet.
  const claimed = await loopClientToolStateStore.claim(threadId, stored.clientToolTurnId);
  if (!claimed) {
    return fail('Diese Prüfung wurde bereits fortgesetzt.', 'invalid_request');
  }

  const image = renderedImageOf(result);
  log.info(
    `[Client-Tool] Fortsetzung Thread ${threadId}: ${stored.clientToolName} ${image ? `Bild ${Math.round(image.length / 1024)} KB` : 'ohne Bild'}`
  );

  const { classifiedState, requestContext } = stored;
  const requestId = `client_tool_resume_${Date.now()}`;

  try {
    const variantId =
      typeof stored.clientArgs.variantId === 'string' ? stored.clientArgs.variantId : '';
    const checkResult = await reviewRenderedSharepic({
      threadId,
      variantId,
      userText: classifiedState.lastUserTextNoMentions ?? null,
      image,
    });
    classifiedState.sharepicCheck = checkResult;
    const checkStep: PersistedStep = {
      toolCallId: stored.toolCallId,
      toolName: stored.toolName,
      args: stored.args,
      result: checkResult,
      ...(image ? {} : { ok: false as const }),
    };

    // Karten-Kontinuität wie in der Rückfrage-Fortsetzung: die Vorkarten UND
    // die jetzt abgeschlossene Prüfung gehen in den Resume-Stream (der Client
    // dedupliziert über stepId).
    for (const step of [...stored.priorSteps, checkStep]) {
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
      systemMessage: await buildSystemMessage(classifiedState, {
        retrievalExpected: true,
        loop: true,
      }),
      messages: requestContext.validMessages as ModelMessage[],
      ...(requestContext.modelId != null && { modelId: requestContext.modelId }),
      requestId,
      sse,
      req,
      threadId,
      resumeApproval: {
        priorSteps: [...stored.priorSteps, checkStep],
        approved: [],
        denied: [],
      },
    });

    const mergedText = [stored.partialText, outcome.fullText].filter((t) => t.trim()).join('\n\n');

    // Die Fortsetzung pausiert selbst wieder. Der alte Zustand ist verbraucht —
    // löschen, die neue Pause schreibt ihren eigenen.
    if (outcome.pendingClientTool) {
      await loopClientToolStateStore.delete(threadId);
      return {
        ...(await suspendForLoopClientTool({
          sse,
          threadId,
          classifiedState,
          requestContext,
          pendingClientTool: outcome.pendingClientTool,
          partialText: mergedText,
          priorSteps: outcome.steps,
          pendingId: stored.pausedMessageId,
          startTime: Date.now(),
        })),
        handled: true as const,
      };
    }
    if (outcome.pendingAsk) {
      await loopClientToolStateStore.delete(threadId);
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
      await loopClientToolStateStore.delete(threadId);
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

    await loopClientToolStateStore.delete(threadId);

    // Ab hier derselbe Weg wie ein ungebrochener Zug (#4369). Es gibt keine
    // Karte, die als „aufgelöst" markiert werden müsste.
    const finished = await finishResumedLoopTurn({
      sse,
      req,
      threadId,
      classifiedState,
      requestContext,
      outcome,
      fullText: mergedText,
      pausedMessageId: stored.pausedMessageId,
      requestId,
      resolvedPause: {},
    });
    return { ...finished, handled: true as const };
  } catch (err) {
    // Der Anspruch wird zurückgegeben: die Fortsetzung ist nicht gelaufen, ein
    // erneuter Versuch soll möglich bleiben.
    await loopClientToolStateStore.releaseClaim(threadId, stored.clientToolTurnId);
    log.error(`[Client-Tool] Fortsetzung gescheitert (Thread ${threadId}):`, err);
    return fail('Die Fortsetzung ist fehlgeschlagen. Bitte versuche es erneut.', 'invalid_request');
  }
}
