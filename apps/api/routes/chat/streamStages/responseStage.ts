/**
 * Stages 2 + 3 — the turn's answer text, by whichever of the two paths applies.
 *
 * Agentic: the model holds the search tools and loops until it can answer,
 * writing the reply in the same streamed turn — Stage 2's pre-decided single
 * search is skipped entirely. Single pass: `executeIntentPipeline` runs the
 * decided tool, then either a fixed confirmation (sharepic / combined post /
 * a finished deep-research dossier) or one respond generation produces the text.
 *
 * The pipeline-agent post-steps run last and append to the same string, so
 * persistence and a reload see what is on screen.
 */

import { buildSystemMessage } from '../../../agents/langgraph/ChatGraph/index.js';
import { knownArtifactRefs } from '../../../agents/langgraph/ChatGraph/nodes/artifactInventory.js';
import {
  BOTH_LANES_FAILED,
  buildAiTelemetry,
  withLangfuseTrace,
} from '../../../services/telemetry/langfuseTelemetry.js';
import { createLogger } from '../../../utils/logger.js';
import { streamAgenticResponse } from '../services/agenticLoop/agenticRespondService.js';
import { stripOutOfRangeCitations } from '../services/agenticLoop/citationStrip.js';
import { MAX_SOURCES } from '../services/agenticLoop/loopGuards.js';
import { runAgentPipeline } from '../services/agentPipeline.js';
import {
  ARTIFACT_CONFIRMATION_TEXTS,
  buildPostWithSharepicsConfirmation,
  buildSharepicConfirmation,
  buildSharepicsWithoutPostConfirmation,
} from '../services/artifactConfirmations.js';
import { injectImageAttachments } from '../services/attachmentProcessingService.js';
import { applyCompaction, pruneMessages } from '../services/contextPruningService.js';
import { executeIntentPipeline } from '../services/intentExecutionService.js';
import { estimateRequestTokens } from '../services/messageHelpers.js';
import {
  stripFabricatedArtifactDelivery,
  stripFabricatedSystemClaims,
} from '../services/outputSanity.js';
import { type createPendingAssistantWriter } from '../services/pendingAssistantWriter.js';
import {
  buildMessagesForAI,
  resolveModel,
  streamForResolution,
  streamWithFallback,
} from '../services/responseStreamingService.js';
import { PROGRESS_MESSAGES, type SSEWriter } from '../services/sseHelpers.js';
import { persistSourcesOnFailure } from '../services/threadPersistenceService.js';
import { turnMaterialChars } from '../services/turnMaterial.js';

import { type SharepicRefinement } from './earlyHandlerStage.js';
import { type RoutingStageResult } from './routingStage.js';
import { type CleanupPending, type MaybeHandled, type StreamBody } from './types.js';

import type { ChatGraphState, CreatedDocument } from '../../../agents/langgraph/ChatGraph/types.js';
import type { PersistedStep } from '../services/agenticLoop/types.js';
import type { StreamContext } from '../services/streamContext.js';
import type { ModelMessage } from 'ai';
import type { Request } from 'express';

const log = createLogger('chatGraphContractRouter');

/** Content of the row that keeps a failed turn's sources for the retry. */
const RESEARCH_KEPT_ON_FAILURE_TEXT =
  'Die Antwort konnte nicht erzeugt werden. Die recherchierten Quellen sind gespeichert — ein erneuter Versuch nutzt sie weiter.';

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
  let socialPostRefused: PipelineResult['socialPostRefused'] = false;
  let socialPostRefusalIsPolicy: PipelineResult['socialPostRefusalIsPolicy'] = false;
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
      ? await applyCompaction(
          actualThreadId,
          prunedValidMessages,
          systemMessage,
          contextWindowTokens
        )
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
        });
        trace.update({ input: lastUserText, output: result.fullText });
        return result;
      }
    );

    finalState = classifiedState;
    finalState.citations = outcome.citations;
    if (outcome.sources.length > 0) {
      finalState.searchResults = outcome.sources;
      finalState.searchCount = outcome.sources.length;
    }
    // The generate_image loop tool merges its result onto the shared state;
    // lift it so the assistant message persists the image (its rehydration
    // reads message-level generatedImage metadata, not the tool-call).
    generatedImage = finalState.generatedImage ?? null;
    // Same lift for the sharepic fat tool (compound turns) — persistence
    // reads the variants from the recorded tool step, but the non-empty
    // check + fixed confirmation branches key on this variable.
    sharepicVariants = finalState.sharepicVariants ?? [];
    // Same lift for the presentation/sheet fat tools (compound turns).
    createdDocument = finalState.createdDocument ?? null;
    createdBoard = finalState.createdBoard ?? null;
    socialPost = null;
    fullText = outcome.fullText;
    agenticSteps = outcome.steps;
  } else {
    // === Stage 2: Search or Image Generation ===
    ({
      finalState,
      generatedImage,
      sharepicVariants,
      socialPost,
      socialPostRefused,
      socialPostRefusalIsPolicy,
    } = await executeIntentPipeline({
      classifiedState,
      sse,
      forcedTool,
      ...(enabledTools != null && { enabledTools }),
      imageAttachments,
      req,
      threadId: actualThreadId ?? null,
      ...(sharepicRefinement && { sharepicRefinement }),
    }));

    // === Stage 3: Response generation ===
    if (finalState.intent === 'social_post') {
      // Combined post (EXPERIMENTAL): both halves were already produced +
      // streamed in Stage 2 (social_post_complete / sharepic_complete).
      // Fixed confirmation like the sharepic branch — no extra LLM call.
      const hasText = socialPost != null;
      const n = sharepicVariants.length;
      fullText = socialPostRefused
        ? // The text model refused, so both halves were discarded. Say so
          // plainly — the old copy promised "dein Post mit N Varianten"
          // because it only checked that SOME text came back.
          //
          // Only name the POLICY reason when the sharepic half declined on
          // the same request; otherwise all we know is that no usable post
          // came back, and asserting the fabricated-quote reason accused
          // the user of something they never asked for (live: a plain
          // request for an English version of their own post).
          socialPostRefusalIsPolicy
          ? ARTIFACT_CONFIRMATION_TEXTS.postRefusedPolicy
          : ARTIFACT_CONFIRMATION_TEXTS.postRefusedGeneric
        : hasText && n > 0
          ? buildPostWithSharepicsConfirmation(n)
          : // A post is text-only unless the user named a sharepic. Without
            // this split, every ordinary post reported a FAILED sharepic
            // that was never requested.
            hasText && !sharepicLicensed
            ? ARTIFACT_CONFIRMATION_TEXTS.postTextOnly
            : hasText
              ? ARTIFACT_CONFIRMATION_TEXTS.postSharepicFailed
              : n > 0
                ? buildSharepicsWithoutPostConfirmation(n)
                : ARTIFACT_CONFIRMATION_TEXTS.genericFailed;
      sse.send('response_start', { message: PROGRESS_MESSAGES.responseStart });
      sse.send('text_delta', { text: fullText });
    } else if (finalState.intent === 'sharepic') {
      // Sharepic variants were already produced + streamed in Stage 2 (sharepic_complete).
      // Skip the LLM — with the still-vague topic it asks clarifying questions over the
      // already-finished sharepic. Emit a fixed confirmation instead so the user sees the
      // assistant knows the sharepic exists. Also covers the all-variants-failed case.
      const n = sharepicVariants.length;
      const deckSlides = sharepicVariants[0]?.pages?.length;
      fullText =
        n > 0
          ? buildSharepicConfirmation(n, deckSlides)
          : ARTIFACT_CONFIRMATION_TEXTS.sharepicFailed;
      sse.send('response_start', { message: PROGRESS_MESSAGES.responseStart });
      sse.send('text_delta', { text: fullText });
    } else if (finalState.deepResearchAnswer) {
      // @deepresearch: the dossier is ALREADY WRITTEN (see deepResearchTurn.ts)
      // and is served verbatim as the assistant message. No tool card, no
      // artefact — the text lands in the transcript like any other answer, so
      // a follow-up ("kürz mir den zweiten Abschnitt") can actually refer to
      // it. That was impossible with the old research card, where the dossier
      // lived only in a tool result the model never saw.
      //
      // Skipping the synthesis pass is the point, not an optimisation: a model
      // run over a finished text paraphrases what we just paid for, costs a
      // second LLM pass, and renumbers citations it has no way to verify.
      //
      // One delta rather than chunks: the whole text is already in hand, so
      // splitting it would only fake a stream — and the smooth-streaming hook
      // has a history of breaking on prefix boundaries.
      fullText = finalState.deepResearchAnswer;
      sse.send('response_start', { message: PROGRESS_MESSAGES.responseStart });
      //
      // No `completion` follow-up: that event exists to REPLACE streamed text
      // after a correction, and there is nothing to correct here — the
      // out-of-range clamp already ran before the text left deepResearchTurn.
      // `done` carries the citations, as on every other path.
      sse.send('text_delta', { text: fullText });
    } else {
      sse.send('response_start', { message: PROGRESS_MESSAGES.responseStart });

      const systemMessage = await buildSystemMessage(finalState);
      const agentConfigForResolve = {
        provider: finalState.agentConfig.provider as string,
        model: finalState.agentConfig.model,
        ...(finalState.agentConfig.defaultModel != null && {
          defaultModel: finalState.agentConfig.defaultModel,
        }),
      };
      const resolution = await resolveModel(
        agentConfigForResolve,
        modelId ?? undefined,
        requestId,
        {
          hasImages: imageAttachments.length > 0,
          intent: finalState.intent,
          ...(finalState.taskShape != null && { taskShape: finalState.taskShape }),
          materialChars: turnMaterialChars(finalState),
          agentId: finalState.agentConfig.identifier,
          // Measured BEFORE pruning on purpose: the question is "does this
          // turn need a bigger lane", and pruning is exactly the loss we
          // want to avoid by answering it.
          estimatedInputTokens: estimateRequestTokens(systemMessage, validMessages),
          ...(finalState.complexity != null && { complexity: finalState.complexity }),
        }
      );
      if (resolution.unknownModelId) {
        sse.send('warning', {
          code: 'unknown_model_id',
          message: `Modell "${resolution.unknownModelId}" ist nicht verfügbar — Standardmodell wird verwendet.`,
        });
      }

      // contextWindowTokens was computed before the classifier ran, when
      // `auto` had no concrete model yet (→ conservative 32k default). Now
      // that the policy has picked a lane, use its real window so a
      // long-context model isn't compacted as if it were a short one.
      //
      // This MUST be resolved before pruning, not just before compaction:
      // pruneMessages physically drops the oldest turns, so running it on
      // the stale 32k default trimmed a 128k lane to ~20k tokens and
      // compaction then only ever saw the survivors.
      const resolvedContextWindow = resolution.contextWindow ?? contextWindowTokens;
      const prunedValidMessages = pruneMessages(
        validMessages as Parameters<typeof pruneMessages>[0],
        resolvedContextWindow
      );
      const { systemMessage: finalSystemMessage, messages: contextMessages } = actualThreadId
        ? await applyCompaction(
            actualThreadId,
            prunedValidMessages,
            systemMessage,
            resolvedContextWindow
          )
        : { systemMessage, messages: prunedValidMessages };

      let messagesForAI = buildMessagesForAI(
        finalSystemMessage,
        contextMessages as Parameters<typeof buildMessagesForAI>[1]
      );
      // image_edit narrates from BILDVERGLEICH text descriptions; the raw image
      // would put bytes in front of a non-vision model (since we no longer
      // force-switch above) and create a redundant grounding source for vision
      // models — skip injection so the descriptions are the single source.
      if (finalState.intent !== 'image_edit') {
        messagesForAI = injectImageAttachments(
          messagesForAI as Parameters<typeof injectImageAttachments>[0],
          imageAttachments,
          requestId
        );
      }

      // Context (requestId/intent/agentId/modelId) rides on the trace below —
      // AI SDK 7 telemetry has no metadata field.
      const respondTelemetry = buildAiTelemetry('chat-graph.respond');

      try {
        // One Langfuse trace per chat turn: the respond generation (and any
        // sibling-fallback retry) nest under this `chat-turn` root span, and
        // `traceId` is captured for the client feedback score.
        fullText = await withLangfuseTrace(
          buildTurnTrace(finalState.intent ?? 'unknown'),
          async (trace) => {
            langfuseTraceId = trace.traceId;
            const text = await streamWithFallback({
              primary: resolution,
              sse,
              logPrefix: '[ChatGraph]',
              buildStream: async (r) =>
                // No output cap (OpenWebUI-style): the provider/model window is
                // the backstop; agentConfig.params.max_tokens is deliberately
                // ignored here so answers are never cut mid-sentence.
                streamForResolution({
                  resolution: r,
                  messages: messagesForAI as Parameters<typeof streamForResolution>[0]['messages'],
                  temperature: finalState.agentConfig.params.temperature,
                  sse,
                  logPrefix: '[ChatGraph]',
                  ...(respondTelemetry && { telemetry: respondTelemetry }),
                }),
            });
            // streamWithFallback swallows a dead primary AND a dead sibling
            // into `null` instead of throwing, so without this the failed
            // turn would sit in Langfuse as a successful one.
            trace.update(
              text === null
                ? { input: lastUserText, level: 'ERROR', statusMessage: BOTH_LANES_FAILED }
                : { input: lastUserText, output: text }
            );
            return text;
          }
        );
      } finally {
        if (resolution.releaseSlot) await resolution.releaseSlot();
      }

      if (fullText === null) {
        // Generation failed, but the retrieval that preceded it was real and
        // expensive. Keep its sources on the thread so the retry rehydrates
        // them instead of paying for the whole deep-research run again.
        if (pendingId && (finalState.searchResults?.length ?? 0) > 0) {
          const kept = await persistSourcesOnFailure(
            pendingId,
            RESEARCH_KEPT_ON_FAILURE_TEXT,
            finalState.searchResults.slice(0, MAX_SOURCES),
            finalState.searchQuery ?? undefined
          ).catch(() => false);
          if (kept) {
            log.info(
              `[ChatGraph] Generation failed — kept ${finalState.searchResults.length} researched source(s) for the retry`
            );
            await cleanupPending(false);
            return { handled: true, result: { status: 200 as const, body: undefined } };
          }
        }
        await cleanupPending(true);
        return { handled: true, result: { status: 200 as const, body: undefined } };
      }

      // The single-pass synth model cites numbers the registry can't back —
      // out-of-range ("[5]" with 3 sources) or, worst, [N] placeholders when
      // there are NO sources at all (observed on at-gruene-position). The
      // agentic loop already clamps; this is its single-pass equivalent. When
      // anything changes, push the corrected text via `completion` so the
      // frontend replaces the streamed deltas (same channel as the notebook flow).
      const sanity = stripFabricatedSystemClaims(fullText, [
        // The user's own message grounds a filename too — see the parameter
        // doc. Without it, "fass Internetkonzept.pdf zusammen" had its
        // answer deleted and replaced with a denial of file access.
        finalState.lastUserTextNoMentions ?? '',
        finalState.attachmentContext ?? '',
        finalState.currentDocument?.title ?? '',
        ...finalState.searchResults.map((r) => `${r.title ?? ''} ${r.content ?? ''}`),
      ]);
      if (sanity.fabricated.length > 0) {
        log.warn(
          `[ChatGraph] Removed fabricated internal file claim(s): ${sanity.fabricated.join(', ')}`
        );
        fullText = sanity.text;
      }
      // A file the model typed out, or an artefact path it made up. This is
      // the path that produced the base64 „.pptx" and the 404'ing
      // /office/<uuid> on 02.08.2026 — single-pass, no artefact tool.
      const delivery = stripFabricatedArtifactDelivery(fullText, knownArtifactRefs(finalState));
      if (delivery.removed.length > 0) {
        log.warn(
          `[ChatGraph] Removed fabricated artefact delivery: ${delivery.removed.join(', ')}`
        );
        fullText = delivery.text;
      }
      const citeClamp = stripOutOfRangeCitations(fullText, finalState.citations.length);
      if (citeClamp.changed || sanity.fabricated.length > 0 || delivery.removed.length > 0) {
        fullText = citeClamp.text;
        sse.send('completion', { text: fullText, citations: finalState.citations });
      }
    }
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
