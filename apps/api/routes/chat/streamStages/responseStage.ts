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

import { runTransferTurn } from '../services/agentPipeline.js';
import { type executeIntentPipeline } from '../services/intentExecutionService.js';
import { type createPendingAssistantWriter } from '../services/pendingAssistantWriter.js';
import { type SSEWriter } from '../services/sseHelpers.js';

import { type SharepicRefinement } from './earlyHandlerStage.js';
import { runAgenticAnswer } from './responseAgentic.js';
import { runSinglePassAnswer } from './responseSinglePass.js';
import { type RoutingStageResult } from './routingStage.js';
import { type CleanupPending, type MaybeHandled, type StreamBody } from './types.js';

import type { ChatGraphState, CreatedDocument } from '../../../agents/langgraph/ChatGraph/types.js';
import type {
  PendingAskRequest,
  PendingClientToolRequest,
  PendingToolCall,
  PersistedStep,
} from '../services/agenticLoop/types.js';
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
  /** Die Decke über dem ganzen Zug (turnDeadline.ts). Beide Antwortpfade
   *  hängen daran, damit der Zug EINE Frist hat und nicht je Phase eine. */
  turnSignal: AbortSignal;
  /** Der Stopp-Knopf (`…/streams/:id/cancel`), getrennt von der Decke: ein
   *  Stopp ist ein Abbruch durch den Aufrufer, kein Timeout. */
  cancelSignal?: AbortSignal;
}

export interface ResponseStageOutput {
  finalState: ChatGraphState;
  /** Non-null: both paths either produced text or already returned. */
  fullText: string;
  generatedImage: ChatGraphState['generatedImage'] | null;
  sharepicVariants: Awaited<ReturnType<typeof executeIntentPipeline>>['sharepicVariants'];
  createdDocument: CreatedDocument | null;
  createdBoard: ChatGraphState['createdBoard'];
  agenticSteps: PersistedStep[] | undefined;
  langfuseTraceId: string | undefined;
  /** Gesetzt ⇒ der Zug pausiert; der Router suspendiert statt zu persistieren. */
  pendingApproval?: PendingToolCall[];
  /** Gesetzt ⇒ der Zug pausiert an einer Rückfrage (`ask_human`). */
  pendingAsk?: PendingAskRequest;
  /** Gesetzt ⇒ der Zug pausiert, bis der Browser ein Loop-Werkzeug ausgeführt hat. */
  pendingClientTool?: PendingClientToolRequest;
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
  turnSignal,
  cancelSignal,
}: ResponseStageParams): Promise<MaybeHandled<ResponseStageOutput>> {
  // === Stage 2 + 3: Response generation ===
  type PipelineResult = Awaited<ReturnType<typeof executeIntentPipeline>>;
  let finalState: PipelineResult['finalState'];
  let generatedImage: PipelineResult['generatedImage'];
  let sharepicVariants: PipelineResult['sharepicVariants'];
  let fullText: string | null;
  let agenticSteps: PersistedStep[] | undefined;
  let pendingApproval: PendingToolCall[] | undefined;
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

  // Ein Übertragungs-Turn (Einfache/Leichte Sprache) hat seine eigene Kette:
  // Fassung, Prüfung, Nachbesserung — und gesendet wird nur der fertige Text.
  // `pipelineOriginal` ist leer, wenn der Turn nichts zu übertragen hat (eine
  // Frage an den Agenten); dann antwortet er wie jeder andere.
  if (pipelineAgent && pipelineOriginal) {
    const transfer = await runTransferTurn({
      pipeline: pipelineAgent,
      state: classifiedState,
      sse,
      original: pipelineOriginal,
      instruction: lastUserText.trim() === pipelineOriginal.trim() ? '' : lastUserText.trim(),
      userId,
      modelId,
      requestId,
    });
    return {
      handled: false,
      finalState: classifiedState,
      fullText: transfer.fullText,
      generatedImage: null,
      sharepicVariants: [],
      createdDocument: transfer.createdDocument,
      createdBoard: null,
      agenticSteps: undefined,
      langfuseTraceId: undefined,
    };
  }

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
      turnSignal,
      ...(cancelSignal && { cancelSignal }),
    });
    ({
      finalState,
      generatedImage,
      sharepicVariants,
      fullText,
      agenticSteps,
      createdDocument,
      createdBoard,
      langfuseTraceId,
    } = agentic);
    pendingApproval = agentic.pendingApproval;
    // Ein pausierter Zug hat keine fertige Antwort: die Nachschritte (Artefakt-
    // Auslöser, Pipeline-Agenten, Persistenz) laufen erst nach der Freigabe
    // bzw. der Antwort auf die Rückfrage.
    if (
      (pendingApproval && pendingApproval.length > 0) ||
      agentic.pendingAsk ||
      agentic.pendingClientTool
    ) {
      return {
        handled: false,
        finalState,
        fullText: fullText ?? '',
        generatedImage,
        sharepicVariants,
        createdDocument,
        createdBoard,
        agenticSteps,
        langfuseTraceId,
        ...(pendingApproval && pendingApproval.length > 0 ? { pendingApproval } : {}),
        ...(agentic.pendingAsk ? { pendingAsk: agentic.pendingAsk } : {}),
        ...(agentic.pendingClientTool ? { pendingClientTool: agentic.pendingClientTool } : {}),
      };
    }
  } else {
    const singlePass = await runSinglePassAnswer({
      sse,
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
      buildTurnTrace,
      turnSignal,
      ...(cancelSignal && { cancelSignal }),
    });
    if (singlePass.handled) return singlePass;
    ({ finalState, generatedImage, sharepicVariants, fullText, langfuseTraceId } = singlePass);
  }

  // Narrow fullText for the extraction/persist stages: the agentic path
  // always yields text; the pipeline path already returned above on null.
  if (fullText === null) {
    await cleanupPending(true);
    return { handled: true, result: { status: 200 as const, body: undefined } };
  }

  return {
    handled: false,
    finalState,
    fullText,
    generatedImage,
    sharepicVariants,
    createdDocument,
    createdBoard,
    agenticSteps,
    langfuseTraceId,
  };
}
