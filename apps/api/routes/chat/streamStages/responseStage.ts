/**
 * Stages 2 + 3 — the turn's answer text, by whichever of the two paths applies.
 *
 * Agentic: the model holds the search tools and loops until it can answer,
 * writing the reply in the same streamed turn — Stage 2's pre-decided single
 * search is skipped entirely. Single pass: `executeIntentPipeline` runs the
 * decided tool, then either a fixed confirmation (sharepic / combined post /
 * a finished deep-research dossier) or one respond generation produces the text.
 *
 * Each path lives in its own module (`responseAgentic` / `responseSinglePass`);
 * what stays here is what both share: the placeholder writer, the one
 * `chat-turn` trace shape, and the pipeline-agent post-steps.
 *
 * The pipeline-agent post-steps run last and append to the same string, so
 * persistence and a reload see what is on screen.
 */

import { runAgentPipeline } from '../services/agentPipeline.js';
import { type executeIntentPipeline } from '../services/intentExecutionService.js';
import { type createPendingAssistantWriter } from '../services/pendingAssistantWriter.js';
import { type SSEWriter } from '../services/sseHelpers.js';

import { type SharepicRefinement } from './earlyHandlerStage.js';
import { runAgenticAnswer } from './responseAgentic.js';
import { runSinglePassAnswer } from './responseSinglePass.js';
import { type RoutingStageResult } from './routingStage.js';
import { type CleanupPending, type MaybeHandled, type StreamBody } from './types.js';

import type { ChatGraphState, CreatedDocument } from '../../../agents/langgraph/ChatGraph/types.js';
import type { PersistedStep } from '../services/agenticLoop/types.js';
import type { StreamContext } from '../services/streamContext.js';
import type { Request } from 'express';

export interface ResponseStageParams {
  sse: SSEWriter;
  req: Request;
  classifiedState: ChatGraphState;
  cleanupPending: CleanupPending;
  /** Placeholder assistant row + its streaming writer. The SSE text listener
   *  is registered HERE, not earlier: the handler branches before this stage
   *  stream their own text and persist their own rows. */
  pendingId: string | null;
  pendingWriter: ReturnType<typeof createPendingAssistantWriter> | null;
  runAgentic: boolean;
  pipelineAgent: RoutingStageResult['pipelineAgent'];
  pipelineOriginal: string;
  requestId: string;
  userId: string;
  actualThreadId: string | undefined;
  agentId: StreamBody['agentId'];
  modelId: StreamBody['modelId'];
  enabledTools: StreamBody['enabledTools'];
  validMessages: StreamContext['validMessages'];
  contextWindowTokens: number;
  imageAttachments: StreamContext['imageAttachments'];
  threadToolHistory: StreamContext['threadToolHistory'];
  lastUserText: string;
  forcedTool: boolean;
  sharepicRefinement: SharepicRefinement | undefined;
  /** Whether the turn was allowed to make a sharepic — a post without a
   *  licence is text-only, not a failed sharepic. */
  sharepicLicensed: boolean;
}

export interface ResponseStageOutput {
  finalState: ChatGraphState;
  /** Non-null: both paths either produced text or already returned. */
  fullText: string;
  generatedImage: ChatGraphState['generatedImage'] | null;
  sharepicVariants: Awaited<ReturnType<typeof executeIntentPipeline>>['sharepicVariants'];
  socialPost: Awaited<ReturnType<typeof executeIntentPipeline>>['socialPost'];
  createdDocument: CreatedDocument | null;
  createdBoard: ChatGraphState['createdBoard'];
  agenticSteps: PersistedStep[] | undefined;
  langfuseTraceId: string | undefined;
}

export async function runResponseStage({
  sse,
  req,
  classifiedState,
  cleanupPending,
  pendingId,
  pendingWriter,
  runAgentic,
  pipelineAgent,
  pipelineOriginal,
  requestId,
  userId,
  actualThreadId,
  agentId,
  modelId,
  enabledTools,
  validMessages,
  contextWindowTokens,
  imageAttachments,
  threadToolHistory,
  lastUserText,
  forcedTool,
  sharepicRefinement,
  sharepicLicensed,
}: ResponseStageParams): Promise<MaybeHandled<ResponseStageOutput>> {
  // === Stage 2 + 3: Response generation ===
  type PipelineResult = Awaited<ReturnType<typeof executeIntentPipeline>>;
  let finalState: PipelineResult['finalState'];
  let generatedImage: PipelineResult['generatedImage'];
  let sharepicVariants: PipelineResult['sharepicVariants'];
  let socialPost: PipelineResult['socialPost'];
  let fullText: string | null;
  let agenticSteps: PersistedStep[] | undefined;
  // Presentation/sheet created by a compound loop tool — lifted from the
  // shared state and persisted as message-level `createdDocument` metadata
  // (the single-pass handlers persist it directly; the loop path lifts it).
  let createdDocument: CreatedDocument | null = null;
  // Board created by a compound loop tool — boards have no card path, so
  // this is emitted in the `done` event (boardId + boardGeneratedStructure),
  // the way the single-pass @board-erstellen handler does.
  let createdBoard: ChatGraphState['createdBoard'] = null;
  // Captured inside withLangfuseTrace so the final `done` event can hand the
  // chat-turn trace id to the client for feedback scoring. undefined when
  // Langfuse is disabled or this turn skips the respond LLM call.
  let langfuseTraceId: string | undefined;

  // From here on the reply streams into the placeholder row. Registering the
  // listener only now keeps the earlier handler branches (which stream their
  // own text and persist their own rows) out of the placeholder.
  const activeWriter = pendingWriter;
  if (activeWriter) {
    sse.setTextListener((kind, text) => activeWriter.onText(kind, text));
  }

  /**
   * Both answer-writing paths open the same `chat-turn` trace — the agentic
   * loop and the single-pass respond call. `intent` is the only field that
   * differs: the loop answers under the classifier's intent, the pipeline
   * may have rewritten it by the time it reaches the respond model.
   */
  const buildTurnTrace = (intent: string) => ({
    name: 'chat-turn',
    ...(userId && { userId }),
    ...(actualThreadId && { sessionId: actualThreadId }),
    metadata: {
      requestId,
      intent,
      ...(agentId && { agentId }),
      ...(modelId && { modelId }),
    },
  });

  if (runAgentic) {
    const agentic = await runAgenticAnswer({
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
    });
    ({
      finalState,
      generatedImage,
      sharepicVariants,
      socialPost,
      fullText,
      agenticSteps,
      createdDocument,
      createdBoard,
      langfuseTraceId,
    } = agentic);
  } else {
    const singlePass = await runSinglePassAnswer({
      sse,
      req,
      classifiedState,
      cleanupPending,
      pendingId,
      requestId,
      actualThreadId,
      modelId,
      enabledTools,
      validMessages,
      contextWindowTokens,
      imageAttachments,
      lastUserText,
      forcedTool,
      sharepicRefinement,
      sharepicLicensed,
      buildTurnTrace,
    });
    if (singlePass.handled) return singlePass;
    ({ finalState, generatedImage, sharepicVariants, socialPost, fullText, langfuseTraceId } =
      singlePass);
  }

  // Narrow fullText for the extraction/persist stages: the agentic path
  // always yields text; the pipeline path already returned above on null.
  if (fullText === null) {
    await cleanupPending(true);
    return { handled: true, result: { status: 200 as const, body: undefined } };
  }

  // === Pipeline-Agenten: die Nachschritte, jeder mit eigenem Kontext ===
  // Laufen NACH der gestromten Antwort und hängen an denselben Text an,
  // damit Persistenz und Neuladen sehen, was auf dem Bildschirm steht.
  // `pipelineOriginal` ist dieselbe Zeichenkette, die Schritt 1 oben im
  // Systemprompt festgenagelt bekam — die Prüfung misst nichts anderes, als
  // was übertragen werden sollte.
  if (pipelineAgent) {
    fullText += await runAgentPipeline({
      pipeline: pipelineAgent,
      state: finalState,
      sse,
      produced: fullText,
      original: pipelineOriginal,
    });
  }
  return {
    handled: false,
    finalState,
    fullText,
    generatedImage,
    sharepicVariants,
    socialPost,
    createdDocument,
    createdBoard,
    agenticSteps,
    langfuseTraceId,
  };
}
