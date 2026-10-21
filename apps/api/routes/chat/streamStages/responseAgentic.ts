/**
 * The agentic half of Stage 2+3: the model holds the search tools and loops
 * until it can answer, writing the reply in the same streamed turn — Stage 2's
 * pre-decided single search is skipped entirely.
 *
 * Unlike the single-pass sibling this path can never end the turn early: it
 * always yields text, so it returns a plain answer rather than `MaybeHandled`.
 */

import {
  buildSystemMessage,
  restoreAttachmentsDroppedWithHistory,
} from '../../../agents/langgraph/ChatGraph/index.js';
import { withLangfuseTrace } from '../../../services/telemetry/langfuseTelemetry.js';
import { streamAgenticResponse } from '../services/agenticLoop/agenticRespondService.js';
import { applyCompaction, pruneMessages } from '../services/contextPruningService.js';

import { liftLoopOutcome } from './loopResumeEnd.js';

import type { ChatGraphState, CreatedDocument } from '../../../agents/langgraph/ChatGraph/types.js';
import type {
  PendingAskRequest,
  PendingClientToolRequest,
  PendingToolCall,
  PersistedStep,
} from '../services/agenticLoop/types.js';
import type { SharepicVariant } from '../services/sharepicVariantHelpers.js';
import type { SSEWriter } from '../services/sseHelpers.js';
import type { StreamBody, StreamContext } from '../services/streamContext.js';
import type { ModelMessage } from 'ai';
import type { Request } from 'express';

/** The `chat-turn` trace both answer paths open, built by the caller so the
 *  turn's identity (user, thread, request, agent, model) stays in one place. */
export type BuildTurnTrace = (intent: string) => Parameters<typeof withLangfuseTrace>[0];

export interface AgenticAnswerParams {
  sse: SSEWriter;
  req: Request;
  classifiedState: ChatGraphState;
  requestId: string;
  actualThreadId: string | undefined;
  modelId: StreamBody['modelId'];
  validMessages: StreamContext['validMessages'];
  contextWindowTokens: number;
  threadToolHistory: StreamContext['threadToolHistory'];
  lastUserText: string;
  buildTurnTrace: BuildTurnTrace;
  /** Turn-Decke aus turnDeadline.ts — dieselbe Frist, die auch der
   *  Einzeldurchlauf bekommt. */
  turnSignal: AbortSignal;
  /** Der Stopp-Knopf (`…/streams/:id/cancel`), getrennt von der Decke: ein
   *  Stopp ist ein Abbruch durch den Aufrufer, kein Timeout. */
  cancelSignal?: AbortSignal;
}

export interface AgenticAnswer {
  finalState: ChatGraphState;
  generatedImage: ChatGraphState['generatedImage'] | null;
  sharepicVariants: SharepicVariant[];
  fullText: string | null;
  agenticSteps: PersistedStep[] | undefined;
  createdDocument: CreatedDocument | null;
  createdBoard: ChatGraphState['createdBoard'];
  langfuseTraceId: string | undefined;
  /** Gesetzt ⇒ der Zug pausiert und wartet auf eine Werkzeug-Freigabe. */
  pendingApproval?: PendingToolCall[];
  /** Gesetzt ⇒ der Zug pausiert und wartet auf die Antwort einer Rückfrage. */
  pendingAsk?: PendingAskRequest;
  /** Gesetzt ⇒ der Zug pausiert, bis der Browser ein Loop-Werkzeug ausgeführt hat. */
  pendingClientTool?: PendingClientToolRequest;
}

export async function runAgenticAnswer({
  sse,
  req,
  classifiedState,
  requestId,
  actualThreadId,
  modelId,
  validMessages,
  contextWindowTokens,
  threadToolHistory,
  lastUserText,
  buildTurnTrace,
  turnSignal,
  cancelSignal,
}: AgenticAnswerParams): Promise<AgenticAnswer> {
  // Captured inside withLangfuseTrace so the final `done` event can hand the
  // chat-turn trace id to the client for feedback scoring. undefined when
  // Langfuse is disabled or this turn skips the respond LLM call.
  let langfuseTraceId: string | undefined;

  // Agentic path: the model holds the search tools and loops until it can
  // answer, writing the reply in the same streamed turn. Stage 2's
  // pre-decided single search is skipped entirely.
  // `retrievalExpected`: this prompt is written before the loop calls a
  // single tool, so the citation count it would otherwise read is 0 on
  // every agentic turn — not because the answer will be thin, but because
  // the search has not happened yet.
  const systemMessage = await buildSystemMessage(classifiedState, {
    retrievalExpected: true,
    loop: true,
  });
  // `contextWindowTokens` already carries the lane floor (turnContextWindow in
  // streamContext): this path cannot ask the resolution — `resolveModel` runs
  // inside streamAgenticResponse, i.e. after pruning.
  const prunedValidMessages = pruneMessages(
    validMessages as Parameters<typeof pruneMessages>[0],
    contextWindowTokens,
    systemMessage
  );
  const { systemMessage: compactedSystemMessage, messages: contextMessages } = actualThreadId
    ? await applyCompaction(actualThreadId, prunedValidMessages, systemMessage, contextWindowTokens)
    : { systemMessage, messages: prunedValidMessages };
  const finalSystemMessage = restoreAttachmentsDroppedWithHistory(
    classifiedState,
    systemMessage,
    compactedSystemMessage,
    contextMessages
  );

  // The loop's gather/synth generations nest under this root span — they
  // pass buildAiTelemetry() from inside loopEngine. Until this existed the
  // most expensive turns in the product were the only untraced ones, and
  // the client got no traceId, so their thumbs buttons never rendered.
  const outcome = await withLangfuseTrace(
    buildTurnTrace(classifiedState.intent ?? 'agentic'),
    async (trace) => {
      langfuseTraceId = trace.traceId;
      const result = await streamAgenticResponse({
        finalState: classifiedState,
        systemMessage: finalSystemMessage,
        messages: contextMessages as ModelMessage[],
        ...(modelId != null && { modelId }),
        requestId,
        sse,
        req,
        threadId: actualThreadId ?? null,
        // Dieselben Zeilen, die buildStreamContext schon gelesen hat.
        // Null heisst nur „nicht vorgelesen" — der Loop liest dann selbst.
        toolHistory: threadToolHistory,
        reqSignal: cancelSignal ? AbortSignal.any([turnSignal, cancelSignal]) : turnSignal,
      });
      trace.update({ input: lastUserText, output: result.fullText });
      return result;
    }
  );

  return {
    // Dieselbe Hebung, mit der eine fortgesetzte Pause endet (loopResumeEnd).
    ...liftLoopOutcome(classifiedState, outcome),
    fullText: outcome.fullText,
    agenticSteps: outcome.steps,
    langfuseTraceId,
    ...(outcome.pendingApproval != null && { pendingApproval: outcome.pendingApproval }),
    ...(outcome.pendingAsk != null && { pendingAsk: outcome.pendingAsk }),
    ...(outcome.pendingClientTool != null && { pendingClientTool: outcome.pendingClientTool }),
  };
}
