/**
 * Resume handler for the chat-graph `resume` endpoint.
 *
 * Restores the stored pipeline state after a clarification interrupt and
 * finishes the turn — either by regenerating a sharepic (the answer is the
 * topic) or by running search + response generation for non-sharepic intents.
 */

import { type chatGraphContract } from '@gruenerator/contracts';
import { type ChatIntentId } from '@gruenerator/shared/chat-intents';

import {
  buildSystemMessage,
  briefGeneratorNode,
  wantsResearchBrief,
  classifierNode,
  searchNode,
  rerankNode,
  buildCitations,
  restoreAttachmentsDroppedWithHistory,
} from '../../../agents/langgraph/ChatGraph/index.js';
import { partitionSearchErrors } from '../../../agents/langgraph/ChatGraph/types.js';
import { promptCacheKeyForThread } from '../../../services/ai/promptCacheKey.js';
import { startStreamRecorder } from '../../../services/chat/resumableStreams.js';
import {
  BOTH_LANES_FAILED,
  buildAiTelemetry,
  withLangfuseTrace,
} from '../../../services/telemetry/langfuseTelemetry.js';
import { createLogger } from '../../../utils/logger.js';
import { getContextWindow } from '../agents/providers.js';

import { runToolApprovalResume } from './agenticLoop/approvalResume.js';
import { runClarificationLoopResume } from './agenticLoop/clarificationResume.js';
import { clientToolResumeRejection } from './agenticLoop/clientToolRegistry.js';
import { runClientToolLoopResume } from './agenticLoop/clientToolResume.js';
import { ARTIFACT_CONFIRMATION_TEXTS, buildSharepicConfirmation } from './artifactConfirmations.js';
import { injectImageAttachments } from './attachmentProcessingService.js';
import { applyCompaction, pruneMessages } from './contextPruningService.js';
import { imageVisibility } from './imageVisibility.js';
import { executeIntentPipeline, reportUnavailableSources } from './intentExecutionService.js';
import { loopClarificationStateStore } from './loopClarificationStateStore.js';
import { loopClientToolStateStore } from './loopClientToolStateStore.js';
import { extractTextContent, lastUserText } from './messageHelpers.js';
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
import { turnMaterialChars } from './turnMaterial.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';
import type { ServerInferRequest } from '@ts-rest/core';
import type { Request } from 'express';

/**
 * Intents a clarification answer upgrades to `search` (see the call site for
 * why this is NOT `NON_SEARCH_INTENTS`).
 */
const CLARIFICATION_UPGRADE_INTENTS: ReadonlySet<ChatIntentId> = new Set([
  'produktion',
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
  // the truly streaming stage — the sharepic fixed-text branch returns earlier
  // and must not stream into the placeholder.
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
    // Werkzeug-Freigabe: eigener Zustand, eigene Fortsetzung. Steht VOR allem
    // anderen, weil dieser Zweig weder den Klärungs-Zustand noch die
    // Einzeldurchlauf-Pipeline berührt.
    if (resumeInput.kind === 'tool_approval') {
      const approvalUser = getUser(req);
      if (!approvalUser?.id) {
        return sseFail(sse, PROGRESS_MESSAGES.unauthorized, { code: 'unauthorized' });
      }
      const result = await runToolApprovalResume({
        req,
        sse,
        threadId,
        userId: approvalUser.id,
        ...(resumeInput.approvalTurnId != null && { approvalTurnId: resumeInput.approvalTurnId }),
        decisions: resumeInput.decisions,
        fail: (message, code) => ({
          handled: true as const,
          ...sseFail(sse, message, { code }),
        }),
      });
      return { status: result.status, body: result.body };
    }
    // Browser-Werkzeug eines Loop-Zuges (`LOOP_CLIENT_TOOLS`, z. B.
    // `check_sharepic` → `render_sharepic`, `tabelle_auswerten` → `run_python`):
    // eigener Zustand, eigene agentische Fortsetzung — wie die Loop-Rückfrage.
    // Entschieden am gespeicherten Loop-Zustand. Eine Pre-Loop-Pause für
    // Browser-Werkzeuge gibt es nicht mehr; ein `run_python` ohne Loop-Zustand
    // ist abgelaufen.
    if (resumeInput.kind === 'client_tool') {
      const storedLoop = (await loopClientToolStateStore.get(threadId)) ?? null;
      const rejection = clientToolResumeRejection(resumeInput.toolName, storedLoop);
      if (rejection) return sseFail(sse, rejection.message, { code: rejection.code });
      const clientToolUser = getUser(req);
      if (!clientToolUser?.id) {
        return sseFail(sse, PROGRESS_MESSAGES.unauthorized, { code: 'unauthorized' });
      }
      const result = await runClientToolLoopResume({
        req,
        sse,
        threadId,
        userId: clientToolUser.id,
        result: resumeInput.result,
        fail: (message, code) => ({
          handled: true as const,
          ...sseFail(sse, message, { code }),
        }),
      });
      return { status: result.status, body: result.body };
    }
    const userAnswer = resumeInput.answer;

    const user = getUser(req);
    if (!user?.id) {
      return sseFail(sse, PROGRESS_MESSAGES.unauthorized, { code: 'unauthorized' });
    }

    // Eine ask_human-Antwort hat zwei mögliche Absender-Zustände: die
    // Pre-Loop-Klärung (pipelineStateStore, Single-Pass-Fortsetzung unten) und
    // die Loop-Rückfrage (#3220, eigener Zustand + agentische Fortsetzung).
    // Der Wire-Body ist identisch — entschieden wird am gespeicherten Zustand.
    // Liegen BEIDE vor (Stale-Shadowing: 24 h gegen 10 min TTL), gewinnt der
    // jüngere.
    const loopState = await loopClarificationStateStore.get(threadId);
    if (loopState) {
      const pipelineState = await pipelineStateStore.get(threadId);
      if (!pipelineState || loopState.createdAt >= pipelineState.createdAt) {
        const result = await runClarificationLoopResume({
          req,
          sse,
          threadId,
          userId: user.id,
          answer: resumeInput.answer,
          fail: (message, code) => ({
            handled: true as const,
            ...sseFail(sse, message, { code }),
          }),
        });
        return { status: result.status, body: result.body };
      }
      // Der jüngere Pre-Loop-Zustand gewinnt — dann ist der ältere
      // Loop-Zustand überholt und muss WEG: sonst überlebt er (24 h TTL)
      // den 10-Minuten-Zustand und eine spätere ask_human-Antwort liefe
      // gegen die falsche, längst überholte Frage.
      await loopClarificationStateStore.delete(threadId);
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
    // `fileData` presence IS the fillability verdict here (only fillable PDFs
    // get bytes persisted) — with one known gap: a fillable PDF over
    // MAX_PDF_BYTES_PERSISTED has no bytes anywhere after the original request
    // ended, so the "oversized form stays usable on its upload turn" guarantee
    // (#2835) does not survive a resume. Nothing to rebuild it from.
    classifiedState.pdfFormAttachments = requestContext.processedMeta
      .filter((m) => m.mimeType === 'application/pdf' && m.fileData != null)
      .map((m) => ({ name: m.name, data: m.fileData as string }));

    log.info(`[ChatGraph:Resume] Thread ${threadId}, answer: "${userAnswer.slice(0, 80)}"`);

    classifiedState.needsClarification = false;
    classifiedState.clarificationQuestion = null;
    classifiedState.clarificationOptions = null;

    classifiedState.searchQuery = userAnswer;

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

    // === Sharepic resume: the answer is the topic — regenerate and finish ===
    if (classifiedState.intent === 'sharepic') {
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

      const { finalState: resumedFinalState, sharepicVariants } = await executeIntentPipeline({
        classifiedState,
        sse,
        forcedTool: requestContext.forcedTool,
        ...(requestContext.enabledTools != null && { enabledTools: requestContext.enabledTools }),
        imageAttachments: requestContext.imageAttachments ?? [],
      });

      const fullText =
        sharepicVariants.length > 0
          ? buildSharepicConfirmation(sharepicVariants)
          : ARTIFACT_CONFIRMATION_TEXTS.sharepicFailed;
      sse.send('response_start', { message: PROGRESS_MESSAGES.responseStart });
      sse.send('text_delta', { text: fullText });

      // Persist the artifacts too — without the sharepic tool call the card
      // can't rehydrate on reload.
      const artifactPersist = await persistResumedResponse({
        threadId: requestContext.actualThreadId!,
        fullText,
        finalState: resumedFinalState,
        classifiedState,
        userId: requestContext.userId,
        processedMeta: requestContext.processedMeta,
        userMessageId: requestContext.userMessageId ?? null,
        userText: lastUserText(requestContext.validMessages),
        sharepicVariants,
      });
      if (artifactPersist.discarded) sendChatWarning(sse, 'turn_discarded');
      else if (!artifactPersist.ok) sendChatWarning(sse, 'persist_failed');

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
    // NOT to be confused with `NON_SEARCH_INTENTS` in classifierSignals.ts,
    // which answers a different question (which intents need no optimised
    // search query) and has 22 members. Merging the two would rewrite a
    // `create_pdf` or `wetter` turn into a search after a clarification and
    // throw its artefact/tool route away. The old name here — `nonSearchIntents`
    // — is how that trap was laid.
    if (CLARIFICATION_UPGRADE_INTENTS.has(classifiedState.intent)) {
      classifiedState.intent = 'search';
    }

    sse.send('intent', {
      intent: classifiedState.intent,
      message: getIntentMessage(classifiedState.intent),
      reasoning: `Resumed: ${userAnswer}`,
      ...(classifiedState.searchQuery != null && { searchQuery: classifiedState.searchQuery }),
      ...(classifiedState.subQueries != null && { subQueries: classifiedState.subQueries }),
      ...(classifiedState.searchSources?.length && {
        searchSources: classifiedState.searchSources,
      }),
    });

    // === Search ===
    // Only pre-loop clarification answers reach this point: approval and
    // client-tool resumes returned above.
    let finalState = classifiedState;
    const { enabledTools, modelId, forcedTool } = requestContext;

    if (!CLARIFICATION_UPGRADE_INTENTS.has(classifiedState.intent)) {
      const toolEnabled = forcedTool || enabledTools?.[classifiedState.intent] !== false;
      if (toolEnabled) {
        let searchInputState = classifiedState;
        // Dieselbe Bedingung wie beim ersten Anlauf (`searchBranch`). Sie stand
        // hier enger (`complex` statt `complex|moderate`), also blieb ein
        // wiederaufgenommener `moderate`-Recherche-Turn ohne den Brief, den
        // derselbe Turn ohne Unterbrechung bekommen hätte.
        if (wantsResearchBrief(classifiedState)) {
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
    // sharepic fixed-text branch sends its own text and returns above this
    // point, so registering the SSE text listener now keeps its output out of
    // the placeholder. Requires a real thread row;
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
      // Resumable from here on. This path has no turn signal, so a cancel only
      // stops the recording — the answer still runs to completion.
      const recorder = pendingId ? await startStreamRecorder(pendingId) : null;
      if (recorder && pendingId) sse.attachRecorder(recorder, pendingId);
      else sse.disableRecording();
    } else {
      sse.disableRecording();
    }

    // === Response ===
    sse.send('response_start', { message: PROGRESS_MESSAGES.responseStart });

    const systemMessage = await buildSystemMessage(finalState);
    const resumeImageAttachments = requestContext.imageAttachments ?? [];
    // Dieselbe Frage wie im Einzeldurchlauf, dieselbe Antwort: sieht das Modell
    // die Bilder? Dieser Pfad baute die Nachrichtenliste bisher OHNE sie und
    // ließ den Systemprompt trotzdem „sind in der Nachricht sichtbar“ sagen
    // (#3313) — die Bauanleitung für eine erfundene Bildbeschreibung.
    const resumeImagesVisible = imageVisibility(finalState) === 'visible';
    const agentConfigForResolve2 = {
      provider: finalState.agentConfig.provider as string,
      model: finalState.agentConfig.model,
      ...(finalState.agentConfig.defaultModel != null && {
        defaultModel: finalState.agentConfig.defaultModel,
      }),
    };
    const resumeRequestId = `resume_contract_${Date.now()}`;
    const resolution2 = await resolveModel(agentConfigForResolve2, modelId, resumeRequestId, {
      hasImages: resumeImagesVisible,
      intent: finalState.intent,
      agentId: finalState.agentConfig.identifier,
      ...(finalState.complexity != null && { complexity: finalState.complexity }),
      ...(finalState.taskShape != null && { taskShape: finalState.taskShape }),
      materialChars: turnMaterialChars(finalState),
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
    // without the field for the whole 10-minute TTL window. Against the
    // RESOLVED lane's window, as on the single-pass path: for `auto`,
    // getContextWindow(modelId) is the 32k default, which cut a resumed turn's
    // history to ~20k tokens on a 128k or 262k lane.
    const resumeWindow = resolution2.contextWindow ?? getContextWindow(modelId);
    // A resumed turn reads the same summary as the turn it continues — without
    // it, a thread past its first compaction resumed on the raw history.
    const { systemMessage: compactedSystemMessage, messages: resumeHistory } =
      requestContext.actualThreadId
        ? await applyCompaction(
            requestContext.actualThreadId,
            pruneMessages(validMessages, resumeWindow, systemMessage),
            systemMessage,
            resumeWindow
          )
        : { systemMessage, messages: validMessages };
    const resumeSystemMessage = restoreAttachmentsDroppedWithHistory(
      finalState,
      systemMessage,
      compactedSystemMessage,
      resumeHistory
    );
    const assembleMessages = (contextWindow: number) => {
      const built = buildMessagesForAI(
        resumeSystemMessage,
        pruneMessages(resumeHistory, contextWindow, resumeSystemMessage)
      );
      return resumeImagesVisible
        ? injectImageAttachments(
            built as Parameters<typeof injectImageAttachments>[0],
            resumeImageAttachments,
            resumeRequestId
          )
        : built;
    };
    const messagesForAI = assembleMessages(resumeWindow);
    const userText = lastUserText(validMessages);
    const traceInput = userText ?? '';

    let resumeTraceId: string | undefined;
    const resumeTelemetry = buildAiTelemetry('chat-graph.resume');
    // One trace per resumed turn — propagateAttributes sets trace-level
    // user/session (AI SDK telemetry carries no metadata of its own) and the
    // traceId feeds the feedback button.
    const fullText: string | null = await withLangfuseTrace(
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
          messages: { primary: messagesForAI, window: resumeWindow, rebuild: assembleMessages },
          buildStream: async (r, messages) =>
            // No output cap (OpenWebUI-style) — see chatGraphContractRouter.
            streamForResolution({
              resolution: r,
              messages,
              temperature: finalState.agentConfig.params.temperature,
              sse,
              logPrefix: '[ChatGraph:Resume]',
              ...(resumeTelemetry && { telemetry: resumeTelemetry }),
              promptCacheKey: promptCacheKeyForThread(requestContext.actualThreadId ?? null),
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
      userMessageId: requestContext.userMessageId ?? null,
      userText,
      ...(resumeTraceId != null && { traceId: resumeTraceId }),
      pendingMessageId: pendingId,
    });
    if (persistOutcome.discarded) sendChatWarning(sse, 'turn_discarded');
    else if (!persistOutcome.ok) sendChatWarning(sse, 'persist_failed');

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
