/**
 * The agentic half of Stage 2+3: the model holds the search tools and loops
 * until it can answer, writing the reply in the same streamed turn — Stage 2's
 * pre-decided single search is skipped entirely.
 *
 * Unlike the single-pass sibling this path can never end the turn early: it
 * always yields text, so it returns a plain answer rather than `MaybeHandled`.
 */

import { buildSystemMessage } from '../../../agents/langgraph/ChatGraph/index.js';
import { withLangfuseTrace } from '../../../services/telemetry/langfuseTelemetry.js';
import { streamAgenticResponse } from '../services/agenticLoop/agenticRespondService.js';
import { applyCompaction, pruneMessages } from '../services/contextPruningService.js';

import type { ChatGraphState, CreatedDocument } from '../../../agents/langgraph/ChatGraph/types.js';
import type { PersistedStep } from '../services/agenticLoop/types.js';
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
}

export interface AgenticAnswer {
  finalState: ChatGraphState;
  generatedImage: ChatGraphState['generatedImage'] | null;
  sharepicVariants: SharepicVariant[];
  socialPost: null;
  fullText: string | null;
  agenticSteps: PersistedStep[] | undefined;
  createdDocument: CreatedDocument | null;
  createdBoard: ChatGraphState['createdBoard'];
  langfuseTraceId: string | undefined;
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
  });
  const prunedValidMessages = pruneMessages(
    validMessages as Parameters<typeof pruneMessages>[0],
    contextWindowTokens
  );
  const { systemMessage: finalSystemMessage, messages: contextMessages } = actualThreadId
    ? await applyCompaction(actualThreadId, prunedValidMessages, systemMessage, contextWindowTokens)
    : { systemMessage, messages: prunedValidMessages };

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
        reqSignal: turnSignal,
      });
      trace.update({ input: lastUserText, output: result.fullText });
      return result;
    }
  );

  const finalState = classifiedState;
  finalState.citations = outcome.citations;
  if (outcome.sources.length > 0) {
    finalState.searchResults = outcome.sources;
    finalState.searchCount = outcome.sources.length;
  }
  return {
    finalState,
    // The generate_image loop tool merges its result onto the shared state;
    // lift it so the assistant message persists the image (its rehydration
    // reads message-level generatedImage metadata, not the tool-call).
    generatedImage: finalState.generatedImage ?? null,
    // Same lift for the sharepic fat tool (compound turns) — persistence
    // reads the variants from the recorded tool step, but the non-empty
    // check + fixed confirmation branches key on this variable.
    sharepicVariants: finalState.sharepicVariants ?? [],
    // Same lift for the presentation/sheet fat tools (compound turns).
    createdDocument: finalState.createdDocument ?? null,
    createdBoard: finalState.createdBoard ?? null,
    socialPost: null,
    fullText: outcome.fullText,
    agenticSteps: outcome.steps,
    langfuseTraceId,
  };
}
