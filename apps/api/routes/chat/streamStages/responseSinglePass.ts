/**
 * The single-pass half of Stage 2+3: `executeIntentPipeline` runs the decided
 * tool, then either a fixed confirmation (sharepic / combined post / a finished
 * deep-research dossier) or one respond generation produces the text.
 *
 * Unlike the agentic sibling this path can end the turn on its own — a dead
 * respond lane leaves no text to persist — so it reports `MaybeHandled`.
 */

import { buildSystemMessage } from '../../../agents/langgraph/ChatGraph/index.js';
import { knownArtifactRefs } from '../../../agents/langgraph/ChatGraph/nodes/artifactInventory.js';
import {
  BOTH_LANES_FAILED,
  buildAiTelemetry,
  withLangfuseTrace,
} from '../../../services/telemetry/langfuseTelemetry.js';
import { createLogger } from '../../../utils/logger.js';
import { stripOutOfRangeCitations } from '../services/agenticLoop/citationStrip.js';
import { MAX_SOURCES } from '../services/agenticLoop/loopGuards.js';
import {
  ARTIFACT_CONFIRMATION_TEXTS,
  buildSharepicConfirmation,
} from '../services/artifactConfirmations.js';
import { injectImageAttachments } from '../services/attachmentProcessingService.js';
import { applyCompaction, pruneMessages } from '../services/contextPruningService.js';
import { executeIntentPipeline } from '../services/intentExecutionService.js';
import {
  stripFabricatedArtifactDelivery,
  stripFabricatedSystemClaims,
} from '../services/outputSanity.js';
import {
  buildMessagesForAI,
  resolveModel,
  streamForResolution,
  streamWithFallback,
} from '../services/responseStreamingService.js';
import { PROGRESS_MESSAGES, type SSEWriter } from '../services/sseHelpers.js';
import { persistSourcesOnFailure } from '../services/threadPersistenceService.js';
import { turnMaterialChars } from '../services/turnMaterial.js';
import { looksLikeMemoryRequest } from '../../../services/memory/memoryRequest.js';

import { type SharepicRefinement } from './earlyHandlerStage.js';
import { type BuildTurnTrace } from './responseAgentic.js';
import { type CleanupPending, type MaybeHandled, type StreamBody } from './types.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';
import type { StreamContext } from '../services/streamContext.js';
import type { Request } from 'express';

const log = createLogger('chatGraphContractRouter');

/** Content of the row that keeps a failed turn's sources for the retry. */
const RESEARCH_KEPT_ON_FAILURE_TEXT =
  'Die Antwort konnte nicht erzeugt werden. Die recherchierten Quellen sind gespeichert — ein erneuter Versuch nutzt sie weiter.';

type PipelineResult = Awaited<ReturnType<typeof executeIntentPipeline>>;

export interface SinglePassAnswerParams {
  sse: SSEWriter;
  req: Request;
  classifiedState: ChatGraphState;
  cleanupPending: CleanupPending;
  pendingId: string | null;
  requestId: string;
  actualThreadId: string | undefined;
  modelId: StreamBody['modelId'];
  enabledTools: StreamBody['enabledTools'];
  validMessages: StreamContext['validMessages'];
  contextWindowTokens: number;
  imageAttachments: StreamContext['imageAttachments'];
  lastUserText: string;
  forcedTool: boolean;
  sharepicRefinement: SharepicRefinement | undefined;
  buildTurnTrace: BuildTurnTrace;
  /** Turn-Decke aus turnDeadline.ts — dieselbe Frist, die auch der agentische
   *  Pfad bekommt. Komponiert unten in die Turn-Uhr des Einzeldurchlaufs. */
  turnSignal: AbortSignal;
}

export interface SinglePassAnswer {
  finalState: PipelineResult['finalState'];
  generatedImage: PipelineResult['generatedImage'];
  sharepicVariants: PipelineResult['sharepicVariants'];
  fullText: string | null;
  langfuseTraceId: string | undefined;
}

export async function runSinglePassAnswer({
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
  buildTurnTrace,
  turnSignal,
}: SinglePassAnswerParams): Promise<MaybeHandled<SinglePassAnswer>> {
  let fullText: string | null;
  // Captured inside withLangfuseTrace so the final `done` event can hand the
  // chat-turn trace id to the client for feedback scoring. undefined when
  // Langfuse is disabled or this turn skips the respond LLM call.
  let langfuseTraceId: string | undefined;

  // === Stage 2: Search or Image Generation ===
  const { finalState, generatedImage, sharepicVariants } = await executeIntentPipeline({
    classifiedState,
    sse,
    forcedTool,
    ...(enabledTools != null && { enabledTools }),
    imageAttachments,
    req,
    threadId: actualThreadId ?? null,
    ...(sharepicRefinement && { sharepicRefinement }),
  });

  // === Stage 3: Response generation ===
  if (finalState.intent === 'sharepic') {
    // Sharepic variants were already produced + streamed in Stage 2 (sharepic_complete).
    // Skip the LLM — with the still-vague topic it asks clarifying questions over the
    // already-finished sharepic. Emit a fixed confirmation instead so the user sees the
    // assistant knows the sharepic exists. Also covers the all-variants-failed case.
    const n = sharepicVariants.length;
    const deckSlides = sharepicVariants[0]?.pages?.length;
    fullText =
      n > 0 ? buildSharepicConfirmation(n, deckSlides) : ARTIFACT_CONFIRMATION_TEXTS.sharepicFailed;
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

    // A memory request that a kill-switch (selected notebook, image
    // attachment, compound turn) kept out of the loop has no tool to honour
    // it. The answer must say so — the model used to confirm "gespeichert"
    // into the void.
    const memoryNote = looksLikeMemoryRequest(lastUserText)
      ? `\n\nHINWEIS ZUM GEDÄCHTNIS: In diesem Turn kann NICHTS gespeichert werden${
          finalState.memoryEnabled ? '' : ' — das Gedächtnis ist in den Einstellungen ausgeschaltet'
        }. Bestätige KEINE Speicherung. Sag knapp, dass du dir das gerade nicht merken kannst${
          finalState.memoryEnabled
            ? ' und schlage vor, es in einer neuen Nachricht ohne Anhang oder Notebook zu wiederholen'
            : ' und dass das Gedächtnis unter Einstellungen → Erinnerungen eingeschaltet werden kann'
        }. Erledige den Rest der Nachricht normal.`
      : '';
    const systemMessage = (await buildSystemMessage(finalState)) + memoryNote;
    const agentConfigForResolve = {
      provider: finalState.agentConfig.provider as string,
      model: finalState.agentConfig.model,
      ...(finalState.agentConfig.defaultModel != null && {
        defaultModel: finalState.agentConfig.defaultModel,
      }),
    };
    const resolution = await resolveModel(agentConfigForResolve, modelId ?? undefined, requestId, {
      hasImages: imageAttachments.length > 0,
      intent: finalState.intent,
      ...(finalState.taskShape != null && { taskShape: finalState.taskShape }),
      materialChars: turnMaterialChars(finalState),
      agentId: finalState.agentConfig.identifier,
      // Measured BEFORE pruning on purpose: the question is "does this
      // turn need a bigger lane", and pruning is exactly the loss we
      // want to avoid by answering it.
      ...(finalState.complexity != null && { complexity: finalState.complexity }),
    });
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
              turnSignal,
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
      log.warn(`[ChatGraph] Removed fabricated artefact delivery: ${delivery.removed.join(', ')}`);
      fullText = delivery.text;
    }
    const citeClamp = stripOutOfRangeCitations(fullText, finalState.citations.length);
    if (citeClamp.changed || sanity.fabricated.length > 0 || delivery.removed.length > 0) {
      fullText = citeClamp.text;
      sse.send('completion', { text: fullText, citations: finalState.citations });
    }
  }

  return {
    handled: false,
    finalState,
    generatedImage,
    sharepicVariants,
    fullText,
    langfuseTraceId,
  };
}
