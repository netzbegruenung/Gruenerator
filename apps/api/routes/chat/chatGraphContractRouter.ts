/**
 * ts-rest contract router for /api/chat-graph
 *
 * Contract-driven router from @ts-rest/express; sole handler for the
 * chat-graph SSE endpoints (stream, resume).
 *
 * Because both endpoints produce Server-Sent Events (SSE), the ts-rest
 * handler performs body validation and then delegates the actual response
 * to the SSE helpers. The contract provides typed request-body validation;
 * the SSE stream itself is opaque from ts-rest's perspective.
 *
 * The handlers are kept thin:
 * - `stream` builds the request context (./services/streamContext), then runs
 *   the turn stages from ./streamStages in order. This file sequences them and
 *   owns only what spans the whole turn: the placeholder-row cleanup and the
 *   error catch. Each stage either hands its outputs to the next or reports
 *   `handled` — meaning it already wrote the whole SSE response.
 * - `resume` delegates wholesale to ./services/resumePipeline.
 *
 * Stage order is the wire contract: the SSE events they emit must not be
 * reordered or deduplicated. ./__integration__ mounts this router for real and
 * asserts exactly that.
 */

import { chatGraphContract } from '@gruenerator/contracts';
import { sanitizeMentionTokens } from '@gruenerator/shared/utils';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { createLogger } from '../../utils/logger.js';

import { extractTextContent } from './services/messageHelpers.js';
import { createPendingAssistantWriter } from './services/pendingAssistantWriter.js';
import { runChatGraphResume } from './services/resumePipeline.js';
import { createSSEStream, sseInternalError } from './services/sseHelpers.js';
import { buildStreamContext } from './services/streamContext.js';
import { discardPendingAssistantIfEmpty } from './services/threadPersistenceService.js';
import { createTurnDeadline } from './services/turnDeadline.js';
import { runActionGateStage } from './streamStages/actionGateStage.js';
import { runArtifactEmitStage } from './streamStages/artifactEmitStage.js';
import { runClarificationStage } from './streamStages/clarificationStage.js';
import { runClassifyStage } from './streamStages/classifyStage.js';
import { runComputeInterruptStage } from './streamStages/computeInterruptStage.js';
import { runCreateIntentStage } from './streamStages/createIntentStage.js';
import { runEarlyHandlerStage } from './streamStages/earlyHandlerStage.js';
import { runForcedIntentStage } from './streamStages/forcedIntentStage.js';
import { runPersistStage } from './streamStages/persistStage.js';
import { runRecallStage } from './streamStages/recallStage.js';
import { runResponseStage } from './streamStages/responseStage.js';
import { runRoutingStage } from './streamStages/routingStage.js';
import { runSharepicTopicStage } from './streamStages/sharepicTopicStage.js';
import { suspendForToolApproval } from './streamStages/toolApprovalSuspend.js';
import { type FixedTextBase, type SuspendTurnBase } from './streamStages/turnEnd.js';

import type { Application } from 'express';

const log = createLogger('chatGraphContractRouter');

const s = initServer();

export const chatGraphContractRouter = s.router(chatGraphContract, {
  stream: async (args) => {
    const { req } = args;
    const sse = createSSEStream(args.res);
    const requestId = `req_${Date.now()}`;
    log.info('[chatGraphContract] stream handler entered, request_id=%s', requestId);

    // Die einzige Frist über dem GANZEN Zug — hier und nicht im Loop, weil
    // Klassifikation und Suche davor liegen und je eigene, unabhängige
    // Provider-Fristen mitbringen. Siehe turnDeadline.ts.
    const turnDeadline = createTurnDeadline(requestId);

    // Turn persistence (WP-B): the placeholder assistant row + its streaming
    // writer. Declared in the handler scope (not inside the try) so the outer
    // catch can run cleanupPending too. Assigned once the context is built.
    let pendingId: string | null = null;
    let pendingWriter: ReturnType<typeof createPendingAssistantWriter> | null = null;
    // Must run on EVERY return path after the placeholder is created:
    //  - discard=false before the main persist (stop the writer so its last
    //    throttle write can't race the finalize UPDATE);
    //  - discard=true on aborts/handler-takeovers/catch (drops the row only if
    //    it stayed empty; a row with partial text survives as an aborted turn).
    const cleanupPending = async (discard: boolean): Promise<void> => {
      sse.setTextListener(undefined);
      await pendingWriter?.stop().catch(() => {});
      if (discard && pendingId) await discardPendingAssistantIfEmpty(pendingId).catch(() => {});
    };

    try {
      const ctxResult = await buildStreamContext({ req, body: args.body, sse, requestId });
      if (ctxResult.done) {
        return { status: 200 as const, body: undefined };
      }

      // Destructure the context into the same identifiers the staged pipeline
      // below was written against (requestId is already in scope from above).
      const {
        userId,
        notebookIds,
        validMessages,
        lastUserMessage,
        actualThreadId,
        isNewThread,
        classifyStepId,
        imageAttachments,
        processedMeta,
        initialState,
        memoryContext,
        memoryRetrieveTimeMs,
        memoryEnabled,
        contextWindowTokens,
        mentionTokenFields,
        lastUserTextRaw,
        promptIsPastedText,
        pendingAssistantMessageId,
        threadToolHistory,
        userMessageId,
      } = ctxResult.ctx;

      // A placeholder assistant row was minted in buildStreamContext. Its writer
      // accumulates the streamed reply so an aborted/crashed turn keeps whatever
      // streamed. The SSE text listener is registered LATER — right before the
      // main respond stage — so the many handler branches below (sharepic/reel/
      // board/… which stream their own text_delta AND persist their own rows)
      // never pollute the placeholder.
      pendingId = pendingAssistantMessageId;
      pendingWriter = pendingId ? createPendingAssistantWriter(pendingId) : null;

      const {
        agentId,
        forcedTools: bodyForcedTools,
        enabledTools,
        modelId,
        documentIds: rawDocumentIds,
        documentChatIds: rawDocumentChatIds,
        docMentionIds: rawDocMentionIds,
        boardIds: rawBoardIds,
        currentDocument: rawCurrentDocument,
        currentBoard: rawCurrentBoard,
        currentSharepic: rawCurrentSharepic,
        currentSocialPost: rawCurrentSocialPost,
        currentReel: rawCurrentReel,
        reelUpload: rawReelUpload,
      } = args.body;

      // Durable mention tokens (parsed in streamContext) are the source of
      // truth; legacy body forcedTools (older clients) union in. Regex edit
      // heuristics below need the text with tokens fully removed — labels like
      // "Bild generieren" would false-positive their noun patterns.
      const mergedForcedTools = [
        ...new Set([...(bodyForcedTools ?? []), ...mentionTokenFields.forcedTools]),
      ];
      const forcedTools = mergedForcedTools.length > 0 ? mergedForcedTools : undefined;
      const lastUserTextNoMentions = sanitizeMentionTokens(lastUserTextRaw, 'remove');

      // === Stage 1: Classify ===
      const classifiedState = await runClassifyStage({
        initialState,
        validMessages,
        lastUserTextNoMentions,
        sse,
      });

      // The turn-wide half of the two early-exit paths. `forcedTool` is NOT in
      // here: it is still being decided while these are already in scope, so
      // every suspend passes the current value at the call site.
      const suspendBase: SuspendTurnBase = {
        sse,
        classifiedState,
        cleanupPending,
        userId,
        agentId,
        enabledTools,
        modelId,
        isNewThread,
        processedMeta,
        userMessageId,
        imageAttachments,
        memoryContext,
        memoryRetrieveTimeMs,
        validMessages,
        rawDocumentIds,
        startTime: initialState.startTime,
      };
      const fixedTextBase: FixedTextBase = {
        sse,
        cleanupPending,
        actualThreadId,
        classifiedState,
        startTime: initialState.startTime,
      };

      log.info(
        `[ChatGraph] forcedTools received: ${JSON.stringify(forcedTools)}, classifier intent: ${classifiedState.intent}`
      );

      // === Mention-forced intents (plus image_edit style + rehydration) ===
      const {
        isCompound,
        forcedTool: mentionForcedTool,
        universalEditForced,
      } = await runForcedIntentStage({
        sse,
        classifiedState,
        initialState,
        notebookIds,
        agentId,
        forcedTools,
        lastUserTextNoMentions,
        lastUserMessage,
        imageAttachments,
        actualThreadId,
      });
      // Still a `let`: the sharepic-refinement branch below is the one later
      // stage that can also pin the intent.
      let forcedTool = mentionForcedTool;

      // === Early handler branches (reel / social post / sharepic edit) ===
      const early = await runEarlyHandlerStage({
        sse,
        req,
        classifiedState,
        initialState,
        cleanupPending,
        actualThreadId,
        userId,
        lastUserMessage,
        lastUserTextNoMentions,
        imageAttachments,
        universalEditForced,
        rawCurrentReel,
        rawReelUpload,
        rawCurrentSharepic,
        rawCurrentSocialPost,
      });
      if (early.handled) return early.result;
      const { sharepicRefinement } = early;
      if (early.forcedTool) forcedTool = true;

      // === Gates: may this turn make a sharepic / persist an artifact? ===
      const gate = await runActionGateStage({
        classifiedState,
        initialState,
        fixedTextBase,
        forcedTool,
        lastUserTextNoMentions,
        actualThreadId,
      });
      if (gate.handled) return gate.result;

      sse.send('progress_step', {
        stepId: classifyStepId,
        toolName: 'classify',
        title: 'Verstehe Anfrage…',
        status: 'completed',
      });

      const lastUserText = lastUserMessage ? extractTextContent(lastUserMessage.content) : '';

      // === Routing: agentic loop or single pass, and which editor variant ===
      // `plan` ist die EINE Turn-Entscheidung (siehe agenticLoop/turnPlan.ts);
      // der Intent darin ist endgültig, hier wird nichts mehr umgeschrieben.
      const { plan, pipelineAgent, pipelineOriginal } = runRoutingStage({
        sse,
        classifiedState,
        requestId,
        enabledTools,
        notebookIds,
        imageAttachments,
        lastUserText,
        lastUserTextNoMentions,
        promptIsPastedText,
        forcedTool,
        isCompound,
        sharepicRefinement,
        rawCurrentDocument,
        rawCurrentBoard,
        rawBoardIds,
        mentionBoardIds: mentionTokenFields.boardIds,
      });

      // === Recall: past-work context enrichment ===
      await runRecallStage({
        sse,
        classifiedState,
        actualThreadId,
        userId,
        lastUserMessage,
        isNewThread,
        memoryEnabled,
      });

      // === HITL: clarification, then the run-then-answer compute interrupt ===
      const clarification = await runClarificationStage({
        sse,
        classifiedState,
        initialState,
        suspendBase,
        forcedTool,
        isCompound,
        actualThreadId,
      });
      if (clarification.handled) return clarification.result;

      const computeInterrupt = await runComputeInterruptStage({
        sse,
        classifiedState,
        suspendBase,
        forcedTool,
        forcedTools,
        lastUserText,
        clientTools: args.body.clientTools,
        actualThreadId,
      });
      if (computeInterrupt.handled) return computeInterrupt.result;

      // === Artifact-creating turns, then the sharepic-topic HITL gate ===
      const created = await runCreateIntentStage({
        sse,
        req,
        classifiedState,
        cleanupPending,
        actualThreadId,
        userId,
        lastUserMessage,
        forcedTools,
        runAgentic: plan.runAgentic,
        rawDocMentionIds,
        rawDocumentChatIds,
      });
      if (created.handled) return created.result;

      const sharepicTopic = await runSharepicTopicStage({
        sse,
        classifiedState,
        suspendBase,
        forcedTool,
        actualThreadId,
        sharepicRefinement,
        lastUserTextNoMentions,
      });
      if (sharepicTopic.handled) return sharepicTopic.result;

      // === Stages 2 + 3: Response generation ===
      const response = await runResponseStage({
        sse,
        req,
        classifiedState,
        cleanupPending,
        pendingId,
        pendingWriter,
        runAgentic: plan.runAgentic,
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
        turnSignal: turnDeadline.signal,
      });
      if (response.handled) return response.result;
      const {
        finalState,
        fullText,
        generatedImage,
        sharepicVariants,
        createdDocument,
        createdBoard,
        agenticSteps,
        langfuseTraceId,
      } = response;

      // Ein Werkzeug wartet auf die Freigabe: der Zug endet hier, der Rest
      // (Artefakt-Auslöser, Persistenz) läuft erst in der Fortsetzung.
      if (response.pendingApproval && response.pendingApproval.length > 0 && actualThreadId) {
        return await suspendForToolApproval({
          sse,
          threadId: actualThreadId,
          classifiedState,
          requestContext: {
            userId,
            agentId: agentId ?? 'gruenerator-universal',
            enabledTools: enabledTools ?? {},
            ...(modelId != null && { modelId }),
            actualThreadId,
            isNewThread,
            processedMeta,
            userMessageId,
            imageAttachments,
            memoryContext,
            memoryRetrieveTimeMs,
            validMessages,
            forcedTool,
            ...(rawDocumentIds != null && { rawDocumentIds }),
          },
          pendingApproval: response.pendingApproval,
          partialText: fullText,
          priorSteps: agenticSteps ?? [],
          pendingId,
          startTime: initialState.startTime,
        });
      }

      // === Stages 3b–3d: chart / artifact / editor-surface triggers ===
      runArtifactEmitStage({
        sse,
        finalState,
        fullText,
        validMessages,
        lastUserMessage,
        compoundEdit: plan.compoundEdit,
        editTarget: plan.editTarget,
        editToolLoop: plan.editToolLoop,
        rawCurrentDocument,
        rawCurrentBoard,
      });

      // === Stage 4: Persist & complete ===
      return await runPersistStage({
        sse,
        req,
        finalState,
        classifiedState,
        cleanupPending,
        fullText,
        actualThreadId,
        userId,
        requestId,
        validMessages,
        lastUserMessage,
        processedMeta,
        isNewThread,
        memoryRetrieveTimeMs,
        generatedImage,
        sharepicVariants,
        createdDocument,
        createdBoard,
        agenticSteps,
        langfuseTraceId,
        pendingId,
        userMessageId,
        agentId,
        rawDocMentionIds,
        rawBoardIds,
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      const { agentId, threadId, modelId } = args.body;
      log.error(
        `[ChatGraph] Controller error: ${errorMessage} ` +
          `(agentId=${agentId ?? 'default'}, threadId=${threadId ?? 'new'}, modelId=${modelId ?? 'default'})`
      );
      if (errorStack) log.error(`[ChatGraph] Stack: ${errorStack}`);
      if (!(error instanceof Error))
        log.error(`[ChatGraph] Raw error: ${JSON.stringify(error)?.slice(0, 500)}`);
      // Best-effort: stop the writer and drop the placeholder only if empty. A
      // row that already streamed partial text stays 'streaming' → renders as an
      // aborted turn; discard clears just the empty one.
      await cleanupPending(true).catch(() => {});
      sseInternalError(sse, error);
      return { status: 200 as const, body: undefined };
    } finally {
      turnDeadline.clear();
    }
  },

  resume: async (args) => {
    const sse = createSSEStream(args.res);
    return runChatGraphResume({ req: args.req, body: args.body, sse });
  },
});

/**
 * Mount the ts-rest contract router onto an Express app instance.
 */
export function mountChatGraphContractRouter(app: Application): void {
  createExpressEndpoints(chatGraphContract, chatGraphContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'chatGraphContract'),
  });
}
