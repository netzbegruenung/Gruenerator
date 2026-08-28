/**
 * Fortsetzung eines Zuges, der auf eine Werkzeug-Freigabe gewartet hat.
 *
 * Kein Wiederaufsetzen des alten Loops — der ist beendet, seine MCP-Verbindungen
 * sind geschlossen und `streamText` lässt sich nicht einfrieren. Stattdessen ein
 * frischer agentischer Zug (Open-WebUI-Muster): Katalog neu montieren, die
 * Schritte von vorher als Beobachtung einspielen, die freigegebenen Aufrufe
 * ausführen, die abgelehnten als Fehler einspeisen, weiterschreiben.
 */
import { buildSystemMessage } from '../../../../agents/langgraph/ChatGraph/index.js';
import { createLogger } from '../../../../utils/logger.js';
import { suspendForToolApproval } from '../../streamStages/toolApprovalSuspend.js';
import { finalizeAssistantMessage, touchThread } from '../threadPersistenceService.js';
import { toolApprovalStateStore } from '../toolApprovalStateStore.js';

import { streamAgenticResponse } from './agenticRespondService.js';
import { grantApproval } from './toolApprovalRepo.js';

import type { PendingToolCall } from './types.js';
import type { ToolApprovalDecision } from '../resumeInput.js';
import type { SSEWriter } from '../sseHelpers.js';
import type { ModelMessage } from 'ai';
import type { Request } from 'express';

const log = createLogger('ApprovalResume');

export interface ApprovalResumeResult {
  handled: true;
  status: 200;
  body: undefined;
}

/**
 * `sseFail` wird hereingereicht statt importiert, damit dieses Modul nichts über
 * die Transportschicht wissen muss (und im Test ohne SSE prüfbar bleibt).
 */
export async function runToolApprovalResume(params: {
  req: Request;
  sse: SSEWriter;
  threadId: string;
  userId: string;
  approvalTurnId?: string | undefined;
  decisions: ToolApprovalDecision[];
  fail: (message: string, code: 'invalid_request' | 'unauthorized') => ApprovalResumeResult;
}): Promise<ApprovalResumeResult> {
  const { req, sse, threadId, userId, decisions, fail } = params;

  const stored = await toolApprovalStateStore.get(threadId);
  if (!stored) {
    return fail(
      'Die Freigabe ist abgelaufen. Bitte stelle die Anfrage noch einmal.',
      'invalid_request'
    );
  }
  if (stored.requestContext.userId !== userId) {
    return fail('Nicht berechtigt.', 'unauthorized');
  }
  if (params.approvalTurnId != null && params.approvalTurnId !== stored.approvalTurnId) {
    return fail('Diese Freigabe gehört zu einem anderen Zug.', 'invalid_request');
  }

  // Genau eine Fortsetzung: ein zweiter Tab darf den freigegebenen Aufruf nicht
  // ein zweites Mal ausführen. Fail-closed, wenn Redis nicht antwortet.
  const claimed = await toolApprovalStateStore.claim(threadId, stored.approvalTurnId);
  if (!claimed) {
    return fail('Diese Freigabe wurde bereits verarbeitet.', 'invalid_request');
  }

  const byId = new Map(stored.calls.map((c) => [c.toolCallId, c]));
  const approved: PendingToolCall[] = [];
  const denied: Array<{ call: PendingToolCall; reason?: string }> = [];
  const grantedOnce = new Map<string, number>();

  for (const decision of decisions) {
    const call = byId.get(decision.toolCallId);
    if (!call) continue;
    if (decision.approved) {
      approved.push(call);
      grantedOnce.set(call.scopeKey, (grantedOnce.get(call.scopeKey) ?? 0) + 1);
      if (decision.optionId === 'allow-always') {
        // VOR der Ausführung geschrieben: die Entscheidung soll auch dann
        // dauerhaft sein, wenn der Aufruf selbst gleich scheitert.
        await grantApproval(
          userId,
          call.scopeKey,
          call.serverName ? `${call.serverName} · ${call.toolName}` : call.toolName
        ).catch((err: unknown) => log.warn(`[Freigabe] dauerhaft speichern gescheitert: ${err}`));
      }
    } else {
      denied.push({ call, ...(decision.reason != null && { reason: decision.reason }) });
    }
  }

  // Aufrufe ohne Entscheidung gelten als abgelehnt: der Zug muss weiterlaufen,
  // und stillschweigend ausführen wäre das Gegenteil dessen, wofür das Gate da ist.
  for (const call of stored.calls) {
    const decided = decisions.some((d) => d.toolCallId === call.toolCallId);
    if (!decided) denied.push({ call });
  }

  log.info(
    `[Freigabe] Fortsetzung Thread ${threadId}: ${approved.length} erlaubt, ${denied.length} abgelehnt`
  );

  const { classifiedState, requestContext } = stored;

  try {
    const outcome = await streamAgenticResponse({
      finalState: classifiedState,
      // Neu gebaut statt aus Redis geholt: derselbe Weg wie im Erst-Zug, und
      // die Nachricht hängt an Zustandsfeldern, die sich geändert haben können.
      systemMessage: await buildSystemMessage(classifiedState, { retrievalExpected: true }),
      messages: requestContext.validMessages as ModelMessage[],
      ...(requestContext.modelId != null && { modelId: requestContext.modelId }),
      requestId: `approval_resume_${Date.now()}`,
      sse,
      req,
      threadId,
      grantedOnce,
      // Eine Ablehnung bindet den Rest des Zuges: das Modell bekommt den
      // Fehler zu lesen, und das Gate lässt denselben `scopeKey` nicht noch
      // einmal in eine Rückfrage laufen.
      deniedScopeKeys: new Set(denied.map((d) => d.call.scopeKey)),
      resumeApproval: { priorSteps: stored.priorSteps, approved, denied },
    });

    // Eine Blase: die pausierte Zeile wird fortgeschrieben, nicht ergänzt.
    const mergedText = [stored.partialText, outcome.fullText].filter((t) => t.trim()).join('\n\n');

    // Die Fortsetzung ist selbst wieder auf ein Gate gelaufen. Dann erneut
    // pausieren statt zu beenden — sonst zeigt die Karte Knöpfe, hinter denen
    // kein Zustand mehr liegt. Der alte Anspruch wird vorher aufgelöst, damit
    // die NEUE Pause ihren eigenen bekommt.
    if (outcome.pendingApproval && outcome.pendingApproval.length > 0) {
      await toolApprovalStateStore.releaseClaim(threadId, stored.approvalTurnId);
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
      pendingApproval: {
        approvalTurnId: stored.approvalTurnId,
        calls: stored.calls,
        resolved: true,
        decisions,
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

    await toolApprovalStateStore.delete(threadId);

    sse.send('done', { threadId, citations: outcome.citations });
    sse.end();
    return { handled: true, status: 200 as const, body: undefined };
  } catch (err) {
    // Der Anspruch wird zurückgegeben: die Fortsetzung ist nicht gelaufen, ein
    // erneuter Versuch soll möglich bleiben.
    await toolApprovalStateStore.releaseClaim(threadId, stored.approvalTurnId);
    log.error(`[Freigabe] Fortsetzung gescheitert (Thread ${threadId}):`, err);
    return fail('Die Fortsetzung ist fehlgeschlagen. Bitte versuche es erneut.', 'invalid_request');
  }
}
