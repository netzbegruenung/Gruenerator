/**
 * Resume handler for the chat-graph `resume` endpoint.
 *
 * Restores the stored pipeline state after a clarification interrupt and
 * finishes the turn — either by regenerating a sharepic (the answer is the
 * topic) or by running search + response generation for non-sharepic intents.
 */

import {
  computePayloadSchema,
  type ComputePayload,
  type chatGraphContract,
} from '@gruenerator/contracts';
import { type ChatIntentId } from '@gruenerator/shared/chat-intents';

import {
  buildSystemMessage,
  briefGeneratorNode,
  classifierNode,
  pandasComputeNode,
  computeVerifierNode,
  searchNode,
  rerankNode,
  buildCitations,
} from '../../../agents/langgraph/ChatGraph/index.js';
import { partitionSearchErrors } from '../../../agents/langgraph/ChatGraph/types.js';
import {
  BOTH_LANES_FAILED,
  buildAiTelemetry,
  withLangfuseTrace,
} from '../../../services/telemetry/langfuseTelemetry.js';
import { getAIWorkerPool } from '../../../utils/getAIWorkerPool.js';
import { createLogger } from '../../../utils/logger.js';
import { getContextWindow } from '../agents/providers.js';

import {
  ARTIFACT_CONFIRMATION_TEXTS,
  buildPostWithSharepicsConfirmation,
  buildSharepicConfirmation,
} from './artifactConfirmations.js';
import { persistComputeAssets } from './computeAssetStorage.js';
import { hasBrokenComputeValues } from './computeResultSanity.js';
import { pruneMessages } from './contextPruningService.js';
import { executeIntentPipeline, reportUnavailableSources } from './intentExecutionService.js';
import { extractTextContent } from './messageHelpers.js';
import { createPendingAssistantWriter } from './pendingAssistantWriter.js';
import { pipelineStateStore } from './pipelineStateStore.js';
import { persistResumedResponse } from './postResponseService.js';
import {
  resolveModel,
  buildMessagesForAI,
  streamForResolution,
  streamWithFallback,
} from './responseStreamingService.js';
import { resolveResumeInput } from './resumeInput.js';
import {
  type createSSEStream,
  getIntentMessage,
  PROGRESS_MESSAGES,
  sendChatWarning,
  sendSearchDegradedWarning,
  sseFail,
  sseInternalError,
} from './sseHelpers.js';
import {
  createPendingAssistantMessage,
  deleteEmptyStreamingRows,
  discardPendingAssistantIfEmpty,
  getUser,
} from './threadPersistenceService.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';
import type { ServerInferRequest } from '@ts-rest/core';
import type { Request } from 'express';

/**
 * Intents a clarification answer upgrades to `search` (see the call site for
 * why this is NOT `NON_SEARCH_INTENTS`).
 */
const CLARIFICATION_UPGRADE_INTENTS: ReadonlySet<ChatIntentId> = new Set([
  'direct',
  'image',
  'image_edit',
] as const satisfies readonly ChatIntentId[]);

const log = createLogger('chatGraphContractRouter');

type ResumeBody = ServerInferRequest<typeof chatGraphContract.resume>['body'];
type SSEStream = ReturnType<typeof createSSEStream>;

export async function runChatGraphResume({
  req,
  body,
  sse,
}: {
  req: Request;
  body: ResumeBody;
  sse: SSEStream;
}): Promise<{ status: 200; body: undefined }> {
  const _requestId = `resume_${Date.now()}`;
  log.info('[chatGraphContract] resume handler entered, request_id=%s', _requestId);

  // Turn persistence (WP-B) for the resume path: the placeholder assistant row
  // + its streaming writer. Declared in the handler scope (not inside the try)
  // so the outer catch can run cleanupPending too. Assigned only right before
  // the truly streaming stage — the sharepic fixed-text branch and run_python
  // correction rounds return earlier and must not stream into the placeholder.
  let pendingId: string | null = null;
  let pendingWriter: ReturnType<typeof createPendingAssistantWriter> | null = null;
  const cleanupPending = async (discard: boolean): Promise<void> => {
    sse.setTextListener(undefined);
    await pendingWriter?.stop().catch(() => {});
    if (discard && pendingId) await discardPendingAssistantIfEmpty(pendingId).catch(() => {});
  };

  try {
    const { threadId } = body;
    const resumeInput = resolveResumeInput(body);
    if (!resumeInput) {
      return sseFail(sse, 'Ungültige Resume-Anfrage.', { code: 'invalid_request' });
    }
    if (resumeInput.kind === 'client_tool' && resumeInput.toolName !== 'run_python') {
      return sseFail(sse, 'Dieser Tool-Typ wird noch nicht unterstützt.', {
        code: 'invalid_request',
      });
    }
    const userAnswer = resumeInput.kind === 'ask_human' ? resumeInput.answer : null;

    const user = getUser(req);
    if (!user?.id) {
      return sseFail(sse, PROGRESS_MESSAGES.unauthorized, { code: 'unauthorized' });
    }

    const stored = await pipelineStateStore.get(threadId);
    if (!stored) {
      return sseFail(sse, 'Pipeline-Status abgelaufen. Bitte sende deine Nachricht erneut.', {
        code: 'invalid_request',
      });
    }
    await pipelineStateStore.delete(threadId);

    const { classifiedState, requestContext } = stored;

    if (requestContext.userId !== user.id) {
      return sseFail(sse, PROGRESS_MESSAGES.unauthorized, { code: 'unauthorized' });
    }

    // pipelineStateStore strips the PDF bytes before writing to Redis (they are
    // already in processedMeta — storing both would double the payload). Rebuild
    // the field here so the PDF form tools still work on a resumed turn.
    classifiedState.pdfFormAttachments = requestContext.processedMeta
      .filter((m) => m.mimeType === 'application/pdf' && m.fileData != null)
      .map((m) => ({ name: m.name, data: m.fileData as string }));

    const aiWorkerPool = getAIWorkerPool(req);
    if (!aiWorkerPool) {
      return sseFail(sse, PROGRESS_MESSAGES.aiUnavailable, {
        code: 'provider_unavailable',
        retryable: true,
      });
    }

    log.info(
      `[ChatGraph:Resume] Thread ${threadId}, ${
        resumeInput.kind === 'ask_human'
          ? `answer: "${(userAnswer ?? '').slice(0, 80)}"`
          : `client tool: ${resumeInput.toolName}`
      }`
    );

    classifiedState.needsClarification = false;
    classifiedState.clarificationQuestion = null;
    classifiedState.clarificationOptions = null;

    if (resumeInput.kind === 'ask_human') {
      classifiedState.searchQuery = userAnswer;
    } else {
      // run_python result: validate the browser-computed payload and seed it as
      // ground truth for respondNode (formatComputedResultContext). The
      // `compute` SSE event drives the inline "Berechnung" card.
      const parsed = computePayloadSchema.safeParse(resumeInput.result);
      // Asset URLs are SERVER-minted only (they render as <img>/<a> in the
      // card) — strip anything the client sent, then move the capped base64
      // figures/exports to uploads/compute-assets so the message metadata
      // carries small authenticated URLs instead of megabytes of base64.
      let payload: ComputePayload | null = null;
      if (parsed.success) {
        const { figureUrls: _cfu, fileAssets: _cfa, ...clientSafe } = parsed.data;
        payload = await persistComputeAssets(user.id, clientSafe);
      }
      const hasNanValues = payload != null && hasBrokenComputeValues(payload);

      const seedComputedResult = (data: (typeof classifiedState)['computedResult']) => {
        classifiedState.computedResult = data;
        classifiedState.computedResultFresh = true;
        if (data) sse.send('compute', { compute: data });
      };

      // Correction round (OpenWebUI-style, bounded to 1 retry total): give the
      // codegen model the failed code + a failure/plausibility hint and pause
      // the turn again — the client executes the corrected code and resumes.
      // Returns true when the turn was re-interrupted (caller must return).
      const tryCorrectionRound = async (errorText: string): Promise<boolean> => {
        const retries = classifiedState.pandasComputeRetries ?? 0;
        if (retries >= 1) return false;
        classifiedState.aiWorkerPool = aiWorkerPool;
        const { pythonCode, computeFailed } = await pandasComputeNode(classifiedState, {
          ...(classifiedState.pandasLastCode != null && {
            previousCode: classifiedState.pandasLastCode,
          }),
          ...(classifiedState.pandasComputeMode != null && {
            mode: classifiedState.pandasComputeMode,
          }),
          previousError: errorText,
        });
        // This is the path where the user's Python run ALREADY failed once. If
        // the correction codegen also fails, the turn falls through to respond
        // — and without this note the model answers the numeric question from
        // the truncated table text, which is the hallucination this node exists
        // to prevent.
        if (computeFailed) {
          sendChatWarning(sse, 'compute_failed');
          classifiedState.degradationNotes = [
            ...(classifiedState.degradationNotes ?? []),
            {
              code: 'compute_failed',
              modelHint:
                'Die Berechnung auf der Tabelle ist fehlgeschlagen. Rechne NICHT selbst und nenne keine Zahlen aus der Tabelle — sag ehrlich, dass die Auswertung gerade nicht möglich war.',
            },
          ];
        }
        if (!pythonCode) return false;

        classifiedState.pandasComputeRetries = retries + 1;
        classifiedState.pandasLastCode = pythonCode;
        log.info(`[ChatGraph:Resume] run_python correction round (${pythonCode.length} chars)`);

        // State FIRST, then the interrupt: if Redis fails here the client has
        // not been promised a resume it can never complete.
        await pipelineStateStore.store(threadId, { classifiedState, requestContext });
        sse.sendRaw('thinking_step', {
          stepId: `run_python_retry_${Date.now()}`,
          toolName: 'run_python',
          title: 'Korrigiere Berechnung…',
          status: 'in_progress',
          args: { code: pythonCode },
        });
        sse.send('interrupt', {
          interruptType: 'client_tool',
          toolName: 'run_python',
          args: { code: pythonCode },
          threadId,
        });
        sse.send('done', {
          threadId,
          citations: [],
          interrupted: true,
          metadata: {
            intent: classifiedState.intent,
            searchCount: 0,
            totalTimeMs: Date.now() - (classifiedState.startTime || Date.now()),
            searchTimeMs: 0,
          },
        });
        sse.end();
        return true;
      };

      if (payload && !hasNanValues) {
        // Plausibility check (fail-open, once per turn, shares the correction
        // budget): catches code that RAN fine but answered the wrong question
        // — beta: doubled totals, wrong column for "höchster Gewinn". Skipped
        // for fill runs: they answer no question, they produce a file, and the
        // verifier's "does this number fit?" framing has nothing to judge.
        if (
          classifiedState.pandasComputeMode !== 'fill' &&
          (classifiedState.pandasComputeRetries ?? 0) < 1 &&
          classifiedState.pandasLastCode
        ) {
          classifiedState.aiWorkerPool = aiWorkerPool;
          const verdict = await computeVerifierNode(classifiedState, payload);
          if (!verdict.plausible) {
            const hint =
              verdict.hint ?? 'Das Ergebnis passt nicht zur Frage — prüfe Spaltenwahl/Gruppierung.';
            // Stash the SUCCESSFUL result: the verifier is fallible, and if the
            // corrected code then fails we fall back to this instead of losing
            // a working computation entirely.
            classifiedState.pandasComputeFallback = payload;
            if (await tryCorrectionRound(`Plausibilitätsprüfung fehlgeschlagen: ${hint}`)) {
              return { status: 200 as const, body: undefined };
            }
          }
        }
        seedComputedResult(payload);
      } else {
        const errorText = payload
          ? `Der Code lief durch, aber das Ergebnis enthält nan/leere Werte — vermutlich falsche Spaltenwahl oder fehlendes dropna(). Ausgabe: ${payload.summary.slice(0, 300)}`
          : resumeInput.result != null &&
              typeof resumeInput.result === 'object' &&
              'error' in resumeInput.result
            ? String((resumeInput.result as { error: unknown }).error)
            : 'invalid payload';
        log.warn(`[ChatGraph:Resume] run_python failed client-side: ${errorText.slice(0, 200)}`);

        if (await tryCorrectionRound(errorText)) {
          return { status: 200 as const, body: undefined };
        }
        // Correction budget spent or codegen declined: hand the model the best
        // available result — the valid-but-nan payload, or the stashed result
        // a fallible verifier sent into a correction round that then failed.
        if (payload) {
          seedComputedResult(payload);
        } else if (classifiedState.pandasComputeFallback) {
          log.info('[ChatGraph:Resume] correction failed — falling back to the original result');
          seedComputedResult(classifiedState.pandasComputeFallback);
        }
      }
    }

    const startTime = Date.now();

    // === "Sharepic, KI-Bild oder Diagramm?" — the answer names the ARTIFACT ===
    // Unlike every other ask_human answer, this one is not a search topic: it
    // decides which generator runs. Re-classify the combined text so the answer
    // routes itself ("Sharepic" licenses the sharepic path, "Diagramm" the
    // chart path) and let it fall through to the branches below. Without this
    // the generic path further down rewrites `direct`/`image` to `search` and
    // the user gets a web search instead of the graphic they just chose.
    if (classifiedState.clarificationKind === 'graphic_kind' && userAnswer) {
      const prevUserMsg = [...classifiedState.messages].reverse().find((m) => m.role === 'user');
      const prevText = prevUserMsg ? extractTextContent(prevUserMsg.content) : '';
      // REPLACE the ambiguous noun, don't append the answer. Appending loses:
      // "Erstelle eine Grafik zur Windkraft Diagramm" still matches the image
      // rule first (it sits above the chart rule and fires on "erstelle …
      // Grafik"), so a user who picked "Diagramm" got an AI image — the answer
      // silently overruled. Substituting makes the request unambiguous and the
      // ordinary classifier does the rest.
      const chosen = /diagramm|chart|graph/i.test(userAnswer)
        ? 'Diagramm'
        : /sharepic|spruchbild|zitatbild/i.test(userAnswer)
          ? 'Sharepic'
          : /bild|foto|motiv|ki/i.test(userAnswer)
            ? 'Bild'
            : null;
      const combined = chosen
        ? prevText.replace(/\b(grafik(en)?|kachel(n)?)\b/gi, chosen)
        : `${prevText} ${userAnswer}`.trim();
      classifiedState.messages = [...classifiedState.messages, { role: 'user', content: combined }];
      classifiedState.clarificationKind = undefined;
      Object.assign(classifiedState, await classifierNode(classifiedState));
      log.info(
        `[ChatGraph:Resume] graphic kind "${userAnswer}" → ${classifiedState.intent} (${combined.slice(0, 60)})`
      );
    }

    // === Sharepic / social_post resume: the answer is the topic — regenerate and finish ===
    if (classifiedState.intent === 'sharepic' || classifiedState.intent === 'social_post') {
      const resumedIntent = classifiedState.intent;
      // Combine the original (topic-less) request with the answer so any variant
      // hint ("zitat sharepic") survives and the answer supplies the subject.
      const prevUserMsg = [...classifiedState.messages].reverse().find((m) => m.role === 'user');
      const prevText = prevUserMsg ? extractTextContent(prevUserMsg.content) : '';
      const combined = `${prevText} ${userAnswer}`.trim();
      classifiedState.messages = [...classifiedState.messages, { role: 'user', content: combined }];

      sse.send('intent', {
        intent: resumedIntent,
        message: getIntentMessage(resumedIntent),
        reasoning: `Resumed: ${userAnswer}`,
      });

      const {
        finalState: resumedFinalState,
        sharepicVariants,
        socialPost,
      } = await executeIntentPipeline({
        classifiedState,
        sse,
        forcedTool: requestContext.forcedTool,
        ...(requestContext.enabledTools != null && { enabledTools: requestContext.enabledTools }),
        imageAttachments: requestContext.imageAttachments ?? [],
        req,
      });

      const n = sharepicVariants.length;
      const fullText =
        resumedIntent === 'social_post'
          ? socialPost != null || n > 0
            ? n > 0
              ? buildPostWithSharepicsConfirmation(n)
              : ARTIFACT_CONFIRMATION_TEXTS.postWithoutSharepic
            : ARTIFACT_CONFIRMATION_TEXTS.genericFailed
          : n > 0
            ? buildSharepicConfirmation(n)
            : ARTIFACT_CONFIRMATION_TEXTS.sharepicFailed;
      sse.send('response_start', { message: PROGRESS_MESSAGES.responseStart });
      sse.send('text_delta', { text: fullText });

      // Persist the artifacts too — without the sharepic/social_post tool
      // calls the card can't rehydrate on reload and later text edits would
      // fall through to the sharepic edit branch.
      const artifactPersist = await persistResumedResponse({
        threadId: requestContext.actualThreadId!,
        fullText,
        finalState: resumedFinalState,
        classifiedState,
        userId: requestContext.userId,
        processedMeta: requestContext.processedMeta,
        sharepicVariants,
        socialPost,
      });
      if (!artifactPersist.ok) sendChatWarning(sse, 'persist_failed');

      sse.send('done', {
        ...(requestContext.actualThreadId != null && {
          threadId: requestContext.actualThreadId,
        }),
        citations: [],
        metadata: {
          intent: resumedIntent,
          searchCount: 0,
          totalTimeMs: Date.now() - startTime,
          searchTimeMs: 0,
        },
      });
      sse.end();
      return { status: 200 as const, body: undefined };
    }

    // Intents that become a SEARCH once the user has answered a clarification:
    // the answer supplies the query the original turn was missing.
    //
    // NOT to be confused with `NON_SEARCH_INTENTS` in classifierPrompt.ts,
    // which answers a different question (which intents need no optimised
    // search query) and has 22 members. Merging the two would rewrite a
    // `create_pdf` or `wetter` turn into a search after a clarification and
    // throw its artefact/tool route away. The old name here — `nonSearchIntents`
    // — is how that trap was laid.
    if (
      resumeInput.kind === 'ask_human' &&
      CLARIFICATION_UPGRADE_INTENTS.has(classifiedState.intent)
    ) {
      classifiedState.intent = 'search';
    }

    sse.send('intent', {
      intent: classifiedState.intent,
      message: getIntentMessage(classifiedState.intent),
      reasoning: `Resumed: ${resumeInput.kind === 'ask_human' ? userAnswer : resumeInput.toolName}`,
      ...(classifiedState.searchQuery != null && { searchQuery: classifiedState.searchQuery }),
      ...(classifiedState.subQueries != null && { subQueries: classifiedState.subQueries }),
      ...(classifiedState.searchSources?.length && {
        searchSources: classifiedState.searchSources,
      }),
    });

    // === Search ===
    // Client-tool resumes (run_python) skip search entirely: the answer needs
    // only the computed result + the already-injected attachment context.
    let finalState = classifiedState;
    const { enabledTools, modelId, forcedTool } = requestContext;

    if (
      resumeInput.kind === 'ask_human' &&
      !CLARIFICATION_UPGRADE_INTENTS.has(classifiedState.intent)
    ) {
      const toolEnabled = forcedTool || enabledTools?.[classifiedState.intent] !== false;
      if (toolEnabled) {
        let searchInputState = classifiedState;
        if (classifiedState.complexity === 'complex' && classifiedState.intent === 'research') {
          const briefResult = await briefGeneratorNode(classifiedState);
          searchInputState = { ...classifiedState, ...briefResult } as ChatGraphState;
        }

        sse.send('search_start', { message: PROGRESS_MESSAGES.searchStart });
        const searchResult = await searchNode(searchInputState);
        finalState = { ...searchInputState, ...searchResult } as ChatGraphState;

        // Threshold and degraded-warning must match the normal search stage in
        // intentExecutionService — a resumed turn is the same turn.
        if (finalState.searchResults?.length > 2) {
          const rerankResult = await rerankNode(finalState);
          finalState = { ...finalState, ...rerankResult } as ChatGraphState;
          if (finalState.searchResults.length > 0) {
            finalState.citations = buildCitations(finalState.searchResults);
          }
          if (finalState.rerankFailed) sendChatWarning(sse, 'rerank_degraded');
        }

        const resultCount = finalState.searchResults?.length || 0;
        const {
          coreDegraded: searchDegraded,
          unavailableSources,
          needsReauth,
        } = partitionSearchErrors(finalState.searchErrors);
        if (searchDegraded) sendSearchDegradedWarning(sse, resultCount);
        if (unavailableSources.length > 0) {
          reportUnavailableSources(sse, finalState, unavailableSources, needsReauth);
        }
        sse.send('search_complete', {
          message:
            searchDegraded && resultCount === 0
              ? PROGRESS_MESSAGES.searchDegraded
              : PROGRESS_MESSAGES.searchComplete(resultCount),
          resultCount,
          results:
            finalState.searchResults?.slice(0, 10).map((r) => {
              const result: {
                source: string;
                title: string;
                content: string;
                url?: string;
                relevance?: number;
              } = {
                source: r.source,
                title: r.title,
                content: r.content,
              };
              if (r.url != null) result.url = r.url;
              if (r.relevance != null) result.relevance = r.relevance;
              return result;
            }) ?? [],
          ...((classifiedState.intent === 'examples' ||
            classifiedState.intent === 'pressemitteilung_examples') &&
          finalState.examplesResult
            ? { examplesResult: finalState.examplesResult }
            : {}),
        });
      }
    }

    // === Turn persistence: mint the placeholder + stream the reply into it ===
    // Only from here does the answer truly stream (streamWithFallback). The
    // sharepic fixed-text branch and the run_python correction rounds send their
    // own text and return above this point, so registering the SSE text listener
    // now keeps their output out of the placeholder. Requires a real thread row;
    // without one we degrade to the in-place insert (pendingId stays null), same
    // as the regular router path.
    const persistThreadId = requestContext.actualThreadId;
    if (persistThreadId) {
      await deleteEmptyStreamingRows(persistThreadId).catch(() => {});
      pendingId = await createPendingAssistantMessage(persistThreadId, requestContext.userId).catch(
        () => null
      );
      pendingWriter = pendingId ? createPendingAssistantWriter(pendingId) : null;
      if (pendingWriter) {
        const activeWriter = pendingWriter;
        sse.setTextListener((kind, text) => activeWriter.onText(kind, text));
      }
    }

    // === Response ===
    sse.send('response_start', { message: PROGRESS_MESSAGES.responseStart });

    const systemMessage = await buildSystemMessage(finalState);
    const resumeImageAttachments = requestContext.imageAttachments ?? [];
    const agentConfigForResolve2 = {
      provider: finalState.agentConfig.provider as string,
      model: finalState.agentConfig.model,
      ...(finalState.agentConfig.defaultModel != null && {
        defaultModel: finalState.agentConfig.defaultModel,
      }),
    };
    const resumeRequestId = `resume_contract_${Date.now()}`;
    const resolution2 = await resolveModel(agentConfigForResolve2, modelId, resumeRequestId, {
      hasImages: resumeImageAttachments.length > 0,
      intent: finalState.intent,
      agentId: finalState.agentConfig.identifier,
      ...(finalState.complexity != null && { complexity: finalState.complexity }),
    });
    if (resolution2.unknownModelId) {
      sse.send('warning', {
        code: 'unknown_model_id',
        message: `Modell "${resolution2.unknownModelId}" ist nicht verfügbar — Standardmodell wird verwendet.`,
      });
    }
    const validMessages = requestContext.validMessages;
    // Recomputed rather than carried in StoredRequestContext: that struct is
    // persisted to Redis, so entries written before this change would arrive
    // without the field for the whole 10-minute TTL window.
    const prunedValidMessages = pruneMessages(validMessages, getContextWindow(modelId));
    const messagesForAI = buildMessagesForAI(systemMessage, prunedValidMessages);
    const lastUserMsg = [...validMessages].reverse().find((m) => m.role === 'user');
    const traceInput = lastUserMsg ? extractTextContent(lastUserMsg.content) : '';

    let fullText: string | null;
    let resumeTraceId: string | undefined;
    const resumeTelemetry = buildAiTelemetry('chat-graph.resume');
    try {
      // One trace per resumed turn — propagateAttributes sets trace-level
      // user/session (AI SDK telemetry carries no metadata of its own) and the
      // traceId feeds the feedback button.
      fullText = await withLangfuseTrace(
        {
          name: 'chat-turn',
          ...(requestContext.userId && { userId: requestContext.userId }),
          ...(requestContext.actualThreadId && { sessionId: requestContext.actualThreadId }),
          metadata: { requestId: resumeRequestId, intent: finalState.intent },
        },
        async (trace) => {
          resumeTraceId = trace.traceId;
          const text = await streamWithFallback({
            primary: resolution2,
            sse,
            logPrefix: '[ChatGraph:Resume]',
            buildStream: async (r) =>
              // No output cap (OpenWebUI-style) — see chatGraphContractRouter.
              streamForResolution({
                resolution: r,
                messages: messagesForAI,
                temperature: finalState.agentConfig.params.temperature,
                sse,
                logPrefix: '[ChatGraph:Resume]',
                ...(resumeTelemetry && { telemetry: resumeTelemetry }),
              }),
          });
          // Both lanes dead → null, not a throw. Mark it, or the failed resume
          // reads as a successful turn.
          trace.update(
            text === null
              ? { input: traceInput, level: 'ERROR', statusMessage: BOTH_LANES_FAILED }
              : { input: traceInput, output: text }
          );
          return text;
        }
      );
    } finally {
      if (resolution2.releaseSlot) await resolution2.releaseSlot();
    }

    if (fullText === null) {
      await cleanupPending(true);
      return { status: 200 as const, body: undefined };
    }

    // === Persist & complete ===
    // Stop the writer BEFORE persist so its final throttle write can't race the
    // finalize UPDATE (both target the same placeholder row).
    await cleanupPending(false);
    const persistOutcome = await persistResumedResponse({
      threadId: requestContext.actualThreadId!,
      fullText,
      finalState,
      classifiedState,
      userId: requestContext.userId,
      processedMeta: requestContext.processedMeta,
      ...(resumeTraceId != null && { traceId: resumeTraceId }),
      pendingMessageId: pendingId,
    });
    if (!persistOutcome.ok) sendChatWarning(sse, 'persist_failed');

    const totalTimeMs = Date.now() - startTime;
    sse.send('done', {
      ...(requestContext.actualThreadId != null && { threadId: requestContext.actualThreadId }),
      citations: finalState.citations,
      metadata: {
        intent: finalState.intent,
        searchCount: finalState.searchCount || 0,
        totalTimeMs,
        ...(classifiedState.classificationTimeMs != null && {
          classificationTimeMs: classifiedState.classificationTimeMs,
        }),
        ...(finalState.searchTimeMs != null && { searchTimeMs: finalState.searchTimeMs }),
        ...(resumeTraceId != null && { traceId: resumeTraceId }),
      },
    });

    log.info(`[ChatGraph:Resume] Complete: ${fullText.length} chars in ${totalTimeMs}ms`);
    sse.end();
    return { status: 200 as const, body: undefined };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    log.error(`[ChatGraph:Resume] Controller error: ${errorMessage}`);
    if (errorStack) log.error(`[ChatGraph:Resume] Stack: ${errorStack}`);
    // Best-effort: stop the writer and drop the placeholder only if it stayed
    // empty; a row that already streamed partial text survives as an aborted turn.
    await cleanupPending(true).catch(() => {});
    sseInternalError(sse, error);
    return { status: 200 as const, body: undefined };
  }
}
