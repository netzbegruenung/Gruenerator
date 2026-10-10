/**
 * Das Ende eines agentischen Zuges, der pausiert hatte (Rückfrage `ask_human`
 * oder Werkzeug-Freigabe) und jetzt fortgesetzt fertig wird.
 *
 * Der Zug endet über DIESELBEN Stufen wie ein ungebrochener Zug — Artefakt-
 * Stufe und Persistenz-Stufe —, nur mit der pausierten Zeile als Platzhalter
 * und dem zusammengeführten Text. Die Fortsetzungen hatten früher je eine
 * eigene, ärmere Kopie davon; die verlor alles, was Werkzeuge auf den
 * Zugzustand schreiben (Dokument, Bild, Rezept, Bildtreffer …) und lief mit
 * jedem neuen Feld weiter auseinander (#4369).
 */

import { runArtifactEmitStage } from './artifactEmitStage.js';
import { runPersistStage } from './persistStage.js';

import type { StreamHandlerResult } from './types.js';
import type { ChatGraphState, CreatedDocument } from '../../../agents/langgraph/ChatGraph/types.js';
import type { AgenticResponseOutcome } from '../services/agenticLoop/agenticRespondService.js';
import type { StoredRequestContext } from '../services/pipelineStateStore.js';
import type { SharepicVariant } from '../services/sharepicVariantHelpers.js';
import type { SSEWriter } from '../services/sseHelpers.js';
import type { ModelMessage } from 'ai';
import type { Request } from 'express';

export interface LiftedLoopOutcome {
  finalState: ChatGraphState;
  generatedImage: ChatGraphState['generatedImage'] | null;
  sharepicVariants: SharepicVariant[];
  createdDocument: CreatedDocument | null;
  createdBoard: ChatGraphState['createdBoard'];
}

/**
 * Was ein Loop-Zug für Persistenz und `done` hinterlässt. Die Werkzeuge
 * schreiben ihre Ergebnisse auf den geteilten Zugzustand; hier werden sie in
 * die Form gehoben, die die Persistenz-Stufe liest.
 */
export function liftLoopOutcome(
  classifiedState: ChatGraphState,
  outcome: Pick<AgenticResponseOutcome, 'citations' | 'sources'>
): LiftedLoopOutcome {
  const finalState = classifiedState;
  finalState.citations = outcome.citations;
  if (outcome.sources.length > 0) {
    finalState.searchResults = outcome.sources;
    finalState.searchCount = outcome.sources.length;
  }
  return {
    finalState,
    // generate_image legt sein Ergebnis auf den Zustand; die Rehydrierung
    // liest das Bild aus den Nachrichten-Metadaten, nicht aus dem Tool-Call.
    generatedImage: finalState.generatedImage ?? null,
    sharepicVariants: finalState.sharepicVariants ?? [],
    createdDocument: finalState.createdDocument ?? null,
    createdBoard: finalState.createdBoard ?? null,
  };
}

export async function finishResumedLoopTurn(params: {
  sse: SSEWriter;
  req: Request;
  threadId: string;
  classifiedState: ChatGraphState;
  requestContext: StoredRequestContext;
  outcome: AgenticResponseOutcome;
  /** Teiltext von vor der Pause plus Fortsetzung — eine Blase. */
  fullText: string;
  pausedMessageId: string | null;
  requestId: string;
  /** Die aufgelöste Pause (`pendingClarification`/`pendingApproval` mit
   *  `resolved`) — der Client rendert daraus die entschiedene Karte. */
  resolvedPause: Record<string, unknown>;
}): Promise<StreamHandlerResult> {
  const { sse, req, threadId, classifiedState, requestContext, outcome, fullText } = params;

  // Die Versätze der Schritte zeigen in Teiltexte, nicht in die zusammengeführte
  // Blase — fallen lassen, dann lädt der Thread karten-zuerst statt falsch
  // verschachtelt.
  for (const step of outcome.steps) delete step.textOffset;

  const lifted = liftLoopOutcome(classifiedState, outcome);
  const lastUserMessage = [...requestContext.validMessages]
    .reverse()
    .find((m) => m.role === 'user') as ModelMessage;

  runArtifactEmitStage({ sse, finalState: lifted.finalState, fullText });

  return runPersistStage({
    sse,
    req,
    finalState: lifted.finalState,
    classifiedState,
    // Kein Platzhalter-Schreiber: die pausierte Zeile ist schon 'complete'.
    cleanupPending: async () => {},
    fullText,
    actualThreadId: threadId,
    userId: requestContext.userId,
    requestId: params.requestId,
    validMessages: requestContext.validMessages,
    lastUserMessage,
    processedMeta: requestContext.processedMeta,
    // Nicht `requestContext.isNewThread`: der Titel entscheidet sich an der
    // Zeile (threadNeedsTitle), damit ein inzwischen vergebener nicht
    // überschrieben wird.
    isNewThread: false,
    memoryRetrieveTimeMs: requestContext.memoryRetrieveTimeMs,
    generatedImage: lifted.generatedImage,
    sharepicVariants: lifted.sharepicVariants,
    createdDocument: lifted.createdDocument,
    createdBoard: lifted.createdBoard,
    agenticSteps: outcome.steps,
    langfuseTraceId: undefined,
    pendingId: params.pausedMessageId,
    userMessageId: requestContext.userMessageId ?? null,
    agentId: requestContext.agentId,
    rawDocMentionIds: undefined,
    rawBoardIds: undefined,
    resolvedPause: params.resolvedPause,
  });
}
