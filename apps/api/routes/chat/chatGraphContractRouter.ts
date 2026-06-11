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
 * - `stream` builds the request context (./services/streamContext) and then
 *   runs Stages 1–4 (classify → intent → response → persist) inline.
 * - `resume` delegates wholesale to ./services/resumePipeline.
 */

import { chatGraphContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { classifierNode, buildSystemMessage } from '../../agents/langgraph/ChatGraph/index.js';
import { isRegoloReasoningModel } from '../../services/ai/regoloReasoningStream.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { createLogger } from '../../utils/logger.js';

import { injectImageAttachments } from './services/attachmentProcessingService.js';
import { searchChatHistory } from './services/chatSearchService.js';
import { extractCompoundTopic } from './services/compoundTopicExtractor.js';
import { extractChartFromResponse, emitConfirmAction } from './services/confirmActionService.js';
import { pruneMessages, applyCompaction } from './services/contextPruningService.js';
import {
  handleBoardCreation,
  generateAndCreateDocument,
  handleShareDoc,
  executeIntentPipeline,
} from './services/intentExecutionService.js';
import { extractTextContent } from './services/messageHelpers.js';
import { pipelineStateStore } from './services/pipelineStateStore.js';
import { persistAssistantResponse } from './services/postResponseService.js';
import {
  resolveModel,
  buildMessagesForAI,
  streamForResolution,
  streamWithFallback,
} from './services/responseStreamingService.js';
import { runChatGraphResume } from './services/resumePipeline.js';
import {
  handleSharepicAgenticEdit,
  isChatToolLoopEnabled,
} from './services/sharepicAgenticService.js';
import { hasSharepicEditVerb } from './services/sharepicEditHeuristics.js';
import { handleSharepicEdit, isSharepicEditInstruction } from './services/sharepicEditService.js';
import {
  getLastSharepicVariant,
  isSharepicRefinement,
  isSharepicTopicMissing,
  type PriorSharepic,
} from './services/sharepicVariantHelpers.js';
import { createSSEStream, getIntentMessage, PROGRESS_MESSAGES } from './services/sseHelpers.js';
import { buildStreamContext } from './services/streamContext.js';

import type { ChatGraphState } from '../../agents/langgraph/ChatGraph/types.js';
import type { ModelMessage } from 'ai';
import type { Application } from 'express';

const log = createLogger('chatGraphContractRouter');

const s = initServer();

export const chatGraphContractRouter = s.router(chatGraphContract, {
  stream: async (args) => {
    const { req } = args;
    const sse = createSSEStream(args.res);
    const requestId = `req_${Date.now()}`;
    log.info('[chatGraphContract] stream handler entered, request_id=%s', requestId);

    try {
      const ctxResult = await buildStreamContext({ req, body: args.body, sse, requestId });
      if (ctxResult.done) {
        return { status: 200 as const, body: undefined };
      }

      // Destructure the context into the same identifiers the staged pipeline
      // below was written against (requestId is already in scope from above).
      const {
        userId,
        aiWorkerPool,
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
        contextWindowTokens,
      } = ctxResult.ctx;

      const {
        agentId,
        forcedTools,
        enabledTools,
        modelId,
        documentIds: rawDocumentIds,
        documentChatIds: rawDocumentChatIds,
        docMentionIds: rawDocMentionIds,
        boardIds: rawBoardIds,
        currentDocument: rawCurrentDocument,
        currentBoard: rawCurrentBoard,
        currentSharepic: rawCurrentSharepic,
      } = args.body;

      // === Stage 1: Classify ===
      const classifiedState = {
        ...initialState,
        ...(await classifierNode(initialState)),
      } as ChatGraphState;

      let forcedTool: boolean = false;
      log.info(
        `[ChatGraph] forcedTools received: ${JSON.stringify(forcedTools)}, classifier intent: ${classifiedState.intent}`
      );

      // === Compound query detection ===
      const isCompound = notebookIds.length > 0 && !!agentId && agentId !== 'gruenerator-universal';
      classifiedState.isCompound = isCompound;

      if (isCompound) {
        log.info(
          `[ChatGraph] Compound query detected: notebooks=[${notebookIds.join(',')}], agent=${agentId}`
        );

        if (!classifiedState.searchQuery) {
          const userText = lastUserMessage ? extractTextContent(lastUserMessage.content) : '';
          classifiedState.searchQuery = extractCompoundTopic(userText, notebookIds);
          log.info(`[ChatGraph] Compound topic extracted: "${classifiedState.searchQuery}"`);
        }

        const gatherSources = classifiedState.gatherSources?.length
          ? classifiedState.gatherSources
          : ['notebook-search' as const];
        classifiedState.gatherSources = gatherSources;

        sse.send('compound_start', {
          stages: gatherSources,
          message: PROGRESS_MESSAGES.compoundStart(gatherSources.length),
        });
      }

      // @bildbearbeiten is an alias for image_edit intent with explicit universal
      // style — distinct identifier so @stadtbegruenen can keep its green-edit
      // branding while @bildbearbeiten signals free-form editing.
      const universalEditForced = !!forcedTools?.includes('image_edit_universal');
      if (universalEditForced) {
        classifiedState.intent = 'image_edit';
        forcedTool = true;
        log.info('[ChatGraph] Intent forced to "image_edit" via @bildbearbeiten mention');
      }

      if (forcedTools && forcedTools.length > 0) {
        const searchClassTools = ['research', 'web', 'search'];
        const hasSearchTool = forcedTools.some((t) => searchClassTools.includes(t));

        const TOOL_PRIORITY =
          isCompound && hasSearchTool
            ? (['research', 'web', 'search', 'sharepic', 'image', 'image_edit', 'summary'] as const)
            : ([
                'sharepic',
                'image',
                'image_edit',
                'summary',
                'research',
                'web',
                'search',
              ] as const);

        const forced = TOOL_PRIORITY.find((t) => forcedTools.includes(t));
        if (forced && !universalEditForced) {
          classifiedState.intent = forced;
          forcedTool = true;
          log.info(`[ChatGraph] Intent forced to "${forced}" via @tool mention`);

          // When the classifier returned a non-search intent (e.g. 'direct')
          // and the @-mention forces a search intent, the classifier never
          // populated searchQuery — the orchestrator would then run on an
          // empty question and the planner LLM hallucinates topics from
          // context. Pull the user's last message text in as the query.
          const FORCED_SEARCH_INTENTS = new Set(['research', 'web', 'search']);
          if (
            FORCED_SEARCH_INTENTS.has(forced) &&
            (!classifiedState.searchQuery || !classifiedState.searchQuery.trim()) &&
            lastUserMessage
          ) {
            const userText = extractTextContent(lastUserMessage.content).trim();
            if (userText) {
              classifiedState.searchQuery = userText;
              log.info(
                `[ChatGraph] searchQuery populated from last user message for forced ${forced}: "${userText.slice(0, 60)}"`
              );
            }
          }
        }
      }

      // Resolve which FLUX edit-prompt builder imageEditNode should use.
      // @stadtbegruenen (forcedTools includes 'image_edit') → green-urban branded;
      // @bildbearbeiten (forcedTools includes 'image_edit_universal') → universal;
      // auto-detected image_edit from heuristics → universal.
      if (classifiedState.intent === 'image_edit') {
        const greenEditMentionForced =
          !!forcedTools?.includes('image_edit') && !universalEditForced;
        classifiedState.imageEditStyle = greenEditMentionForced ? 'green-edit' : 'universal';
        log.info(
          `[ChatGraph] image_edit style resolved to "${classifiedState.imageEditStyle}" (greenEditForced=${greenEditMentionForced}, universalForced=${universalEditForced})`
        );
      }

      // === Sharepic edit: full NL editing of an existing chat sharepic ===
      // "Zeile 2 kürzer", "Balken nach oben", "anderes Hintergrundbild" on a
      // sharepic the thread already produced. Applies structured operations to
      // the (lazily minted) canvas document and updates the card in place —
      // see sharepicEditService. Falls through to the legacy text-regeneration
      // refinement below when no editable target exists.
      if (
        actualThreadId &&
        lastUserMessage &&
        imageAttachments.length === 0 &&
        classifiedState.intent !== 'image_edit' &&
        !universalEditForced
      ) {
        const editText = ((extractTextContent(lastUserMessage.content) as string) || '')
          .replace(/@sharepic\b/gi, ' ')
          .trim();
        // With an explicitly activated sharepic (Sharepic-Modus) AND the tool
        // loop on, an edit verb alone is enough — the loop can answer with
        // plain text when the message turns out not to be sharepic-related,
        // so over-triggering is cheap. The strict verb+noun check stays the
        // bar for the tool-forced single-call path.
        const sharepicModeRelaxed =
          isChatToolLoopEnabled() &&
          rawCurrentSharepic != null &&
          !!editText &&
          hasSharepicEditVerb(editText);
        if (
          editText &&
          (isSharepicEditInstruction(editText) ||
            isSharepicRefinement(editText) ||
            sharepicModeRelaxed)
        ) {
          // CHAT_TOOL_LOOP swaps the executor, not the routing: same entry
          // condition and fallthrough semantics, but the edit runs as a small
          // agentic tool loop instead of one structured call.
          const editHandler = isChatToolLoopEnabled()
            ? handleSharepicAgenticEdit
            : handleSharepicEdit;
          const handled = await editHandler({
            sse,
            req,
            threadId: actualThreadId,
            userId,
            instruction: editText,
            currentSharepic: rawCurrentSharepic ?? null,
            aiWorkerPool,
            startTime: initialState.startTime,
            ...(classifiedState.classificationTimeMs != null && {
              classificationTimeMs: classifiedState.classificationTimeMs,
            }),
          });
          if (handled) return { status: 200 as const, body: undefined };
        }
      }

      // === Sharepic refinement: a follow-up edit right after a sharepic ===
      // "verlängern" / "kürzer" / "anderes Bild" after a sharepic means "adjust
      // the one you just made" — regenerate seeded with the previous sharepic's
      // text, not a fresh sharepic about the word "verlängern". Overrides whatever
      // intent the classifier picked (the edit verb alone rarely classifies as
      // sharepic). Skipped when an image is attached (that's image_edit territory).
      // Reached only when handleSharepicEdit above declined (no target variant
      // or non-editable template).
      let sharepicRefinement: { instruction: string; prior: PriorSharepic } | undefined;
      if (
        actualThreadId &&
        lastUserMessage &&
        imageAttachments.length === 0 &&
        classifiedState.intent !== 'image_edit' &&
        !universalEditForced
      ) {
        const followText = (extractTextContent(lastUserMessage.content) as string) || '';
        if (isSharepicRefinement(followText)) {
          const prior = await getLastSharepicVariant(actualThreadId);
          if (prior) {
            sharepicRefinement = {
              instruction: followText.replace(/@sharepic\b/gi, '').trim(),
              prior,
            };
            classifiedState.intent = 'sharepic';
            forcedTool = true;
            log.info(
              `[ChatGraph] Sharepic refinement: "${sharepicRefinement.instruction}" on ${prior.canvasType}`
            );
          }
        }
      }

      sse.send('progress_step', {
        stepId: classifyStepId,
        toolName: 'classify',
        title: 'Verstehe Anfrage…',
        status: 'completed',
      });

      sse.send('intent', {
        intent: classifiedState.intent,
        message: getIntentMessage(classifiedState.intent),
        reasoning: classifiedState.reasoning,
        ...(classifiedState.searchQuery != null && { searchQuery: classifiedState.searchQuery }),
        ...(classifiedState.subQueries != null && { subQueries: classifiedState.subQueries }),
        ...(classifiedState.searchSources?.length && {
          searchSources: classifiedState.searchSources,
        }),
        ...(classifiedState.secondaryIntent != null && {
          secondaryIntent: classifiedState.secondaryIntent,
        }),
        ...(isCompound && { compound: true }),
      });

      // === Chat history context enrichment ===
      if (classifiedState.searchSources?.includes('chat_history') && classifiedState.searchQuery) {
        try {
          const chatResults = await searchChatHistory(userId, classifiedState.searchQuery, {
            ...(actualThreadId != null && { excludeThreadId: actualThreadId }),
            limit: 3,
          });
          if (chatResults.length > 0) {
            const chatContext = chatResults
              .map(
                (r) =>
                  `### ${r.threadTitle || 'Untitled'} (${new Date(r.threadUpdatedAt).toLocaleDateString('de-DE')})\n${r.snippet}`
              )
              .join('\n\n');
            classifiedState.chatHistoryContext = `## RELEVANTE VERGANGENE GESPRÄCHE\n\n${chatContext}`;
            log.info(
              `[ChatGraph] Injected ${chatResults.length} chat history results for "${classifiedState.searchQuery}"`
            );
          }
        } catch (err) {
          log.warn(`[ChatGraph] Chat history search failed: ${err}`);
        }
      }

      // === HITL: Check if clarification is needed ===
      if (
        classifiedState.needsClarification &&
        !forcedTool &&
        !isCompound &&
        !initialState.attachmentContext &&
        !initialState.boardContext &&
        !initialState.documentMentionContext
      ) {
        log.info(`[ChatGraph] Clarification needed: "${classifiedState.clarificationQuestion}"`);

        const stepId = `clarify_${Date.now()}`;
        sse.sendRaw('thinking_step', {
          stepId,
          toolName: 'ask_human',
          title: 'Stelle Klärungsfrage...',
          status: 'in_progress',
          args: {
            question: classifiedState.clarificationQuestion,
            options: classifiedState.clarificationOptions,
          },
        });

        sse.send('interrupt', {
          interruptType: 'clarification',
          question: classifiedState.clarificationQuestion!,
          ...(classifiedState.clarificationOptions != null && {
            options: classifiedState.clarificationOptions,
          }),
          ...(actualThreadId != null && { threadId: actualThreadId }),
        });

        await pipelineStateStore.store(actualThreadId!, {
          classifiedState,
          requestContext: {
            userId,
            agentId: agentId ?? 'gruenerator-universal',
            enabledTools: enabledTools ?? {},
            ...(modelId != null && { modelId }),
            ...(actualThreadId != null && { actualThreadId }),
            isNewThread,
            processedMeta,
            imageAttachments,
            memoryContext,
            memoryRetrieveTimeMs,
            validMessages,
            forcedTool,
            ...(rawDocumentIds != null && { rawDocumentIds }),
          },
        });

        sse.send('done', {
          ...(actualThreadId != null && { threadId: actualThreadId }),
          citations: [],
          interrupted: true,
          metadata: {
            intent: classifiedState.intent,
            searchCount: 0,
            totalTimeMs: Date.now() - initialState.startTime,
            classificationTimeMs: classifiedState.classificationTimeMs,
            searchTimeMs: 0,
          },
        });
        sse.end();
        return { status: 200 as const, body: undefined };
      }

      // === Handle @board-erstellen tool ===
      if (forcedTools?.includes('board-erstellen')) {
        const created = await handleBoardCreation({
          sse,
          classifiedState,
          lastUserMessage,
          aiWorkerPool,
          req,
          ...(actualThreadId != null && { actualThreadId }),
          userId,
        });
        if (created) return { status: 200 as const, body: undefined };
      }

      // === Handle @dokument-erstellen tool ===
      if (forcedTools?.includes('dokument-erstellen')) {
        const lastUserText = lastUserMessage ? extractTextContent(lastUserMessage.content) : '';
        const created = await generateAndCreateDocument({
          sse,
          classifiedState,
          aiWorkerPool,
          req,
          ...(actualThreadId != null && { actualThreadId }),
          userId,
          userContent: lastUserText as string,
          intent: 'direct',
        });
        if (created) return { status: 200 as const, body: undefined };
      }

      // === Handle share_doc intent ===
      if (classifiedState.intent === 'share_doc' && actualThreadId) {
        const handled = await handleShareDoc({
          sse,
          classifiedState,
          actualThreadId,
          userId,
          ...(lastUserMessage != null && { lastUserMessage }),
          ...(rawDocMentionIds != null && { rawDocMentionIds }),
          ...(rawDocumentChatIds != null && { rawDocumentChatIds }),
        });
        if (handled) return { status: 200 as const, body: undefined };
      }

      // === HITL: Sharepic without a topic → ask before generating ===
      // Unlike the generic clarification above this fires even for forced @sharepic,
      // because a bare "@sharepic" / "zitat sharepic" has the intent but no subject.
      if (classifiedState.intent === 'sharepic' && actualThreadId && !sharepicRefinement) {
        const sharepicText = lastUserMessage ? extractTextContent(lastUserMessage.content) : '';
        if (isSharepicTopicMissing(sharepicText as string)) {
          log.info('[ChatGraph] Sharepic topic missing — asking user for the topic');

          const stepId = `clarify_${Date.now()}`;
          const question = 'Zu welchem Thema soll ich das Sharepic erstellen?';
          const options = ['Klimaschutz', 'Soziale Gerechtigkeit', 'Verkehrswende', 'Artenschutz'];

          sse.sendRaw('thinking_step', {
            stepId,
            toolName: 'ask_human',
            title: 'Stelle Klärungsfrage...',
            status: 'in_progress',
            args: { question, options },
          });

          sse.send('interrupt', {
            interruptType: 'clarification',
            question,
            options,
            threadId: actualThreadId,
          });

          await pipelineStateStore.store(actualThreadId, {
            classifiedState,
            requestContext: {
              userId,
              agentId: agentId ?? 'gruenerator-universal',
              enabledTools: enabledTools ?? {},
              ...(modelId != null && { modelId }),
              actualThreadId,
              isNewThread,
              processedMeta,
              imageAttachments,
              memoryContext,
              memoryRetrieveTimeMs,
              validMessages,
              forcedTool,
              ...(rawDocumentIds != null && { rawDocumentIds }),
            },
          });

          sse.send('done', {
            threadId: actualThreadId,
            citations: [],
            interrupted: true,
            metadata: {
              intent: classifiedState.intent,
              searchCount: 0,
              totalTimeMs: Date.now() - initialState.startTime,
              classificationTimeMs: classifiedState.classificationTimeMs,
              searchTimeMs: 0,
            },
          });
          sse.end();
          return { status: 200 as const, body: undefined };
        }
      }

      // === Stage 2: Search or Image Generation ===
      const { finalState, generatedImage, sharepicVariants } = await executeIntentPipeline({
        classifiedState,
        sse,
        forcedTool,
        ...(enabledTools != null && { enabledTools }),
        imageAttachments,
        req,
        ...(sharepicRefinement && { sharepicRefinement }),
      });

      // === Stage 3: Response generation ===
      let fullText: string | null;
      if (finalState.intent === 'sharepic') {
        // Sharepic variants were already produced + streamed in Stage 2 (sharepic_complete).
        // Skip the LLM — with the still-vague topic it asks clarifying questions over the
        // already-finished sharepic. Emit a fixed confirmation instead so the user sees the
        // assistant knows the sharepic exists. Also covers the all-variants-failed case.
        const n = sharepicVariants.length;
        fullText =
          n > 0
            ? `Ich habe dir ${n} Sharepic-${n === 1 ? 'Variante' : 'Varianten'} erstellt. ` +
              `Wähle eine aus oder sag mir, was ich am Text oder Bild anpassen soll.`
            : `Die Sharepic-Erstellung hat leider nicht geklappt. Magst du es mit einem ` +
              `anderen Thema noch einmal versuchen?`;
        sse.send('response_start', { message: PROGRESS_MESSAGES.responseStart });
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
          }
        );
        if (resolution.unknownModelId) {
          sse.send('warning', {
            code: 'unknown_model_id',
            message: `Modell "${resolution.unknownModelId}" ist nicht verfügbar — Standardmodell wird verwendet.`,
          });
        }

        const prunedValidMessages = pruneMessages(
          validMessages as Parameters<typeof pruneMessages>[0]
        );
        const finalSystemMessage = actualThreadId
          ? await applyCompaction(
              actualThreadId,
              prunedValidMessages,
              systemMessage,
              contextWindowTokens
            )
          : systemMessage;

        let messagesForAI = buildMessagesForAI(
          finalSystemMessage,
          prunedValidMessages as Parameters<typeof buildMessagesForAI>[1]
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

        const baseMaxTokens = finalState.agentConfig.params.max_tokens;

        try {
          fullText = await streamWithFallback({
            primary: resolution,
            sse,
            logPrefix: '[ChatGraph]',
            buildStream: async (r) => {
              const isReasoning = isRegoloReasoningModel(r.provider, r.modelName);
              return streamForResolution({
                resolution: r,
                messages: messagesForAI as Parameters<typeof streamForResolution>[0]['messages'],
                maxTokens: isReasoning ? Math.max(baseMaxTokens, 9000) : baseMaxTokens,
                temperature: finalState.agentConfig.params.temperature,
                sse,
                logPrefix: '[ChatGraph]',
              });
            },
          });
        } finally {
          if (resolution.releaseSlot) await resolution.releaseSlot();
        }

        if (fullText === null) return { status: 200 as const, body: undefined };
      }

      // === Stage 3b: Extract chart data from response (if chart intent) ===
      if (finalState.intent === 'chart') {
        const chartData = extractChartFromResponse(fullText);
        if (chartData) {
          sse.send('chart_data', { chart: chartData });
          log.info(
            `[ChatGraph] Chart data extracted: ${chartData.type} with ${chartData.data.length} points`
          );
        }
      }

      // === Stage 3c: Live document edit trigger (docs editor surface only) ===
      // For edit_current_doc intent, emit a `trigger_doc_edit` SSE event with
      // the user's prompt + selection flag. The docs-editor frontend dispatches
      // this into BlockNote's AIExtension.invokeAI(), which runs the existing
      // /api/docs/ai pipeline (tool calls → applyDocumentOperations → Yjs sync).
      // ChatGraph never edits the doc itself — it just classifies and forwards.
      //
      // Reference content channel: short referential commands like "füge dies
      // ein" or "im dokument einfügen" point at the previous assistant turn
      // (the rewritten Antrag the chat produced earlier). BlockNote AI sees
      // only the document — not chat history. We forward the prior substantive
      // assistant message as a SEPARATE `referenceContent` field; it lands in
      // the docs-AI route's *system prompt* as labeled instructional context,
      // never concatenated into userPrompt (an earlier attempt did that and
      // the model inserted the wrapper text verbatim into the document).
      //
      // "Substantive" = ≥200 chars, which skips the brief edit-confirmation
      // ("Ich passe das Dokument an…") that respondNode itself just emitted
      // and lands on the earlier turn that actually contains the content.
      if (finalState.intent === 'edit_current_doc' && rawCurrentDocument?.id) {
        const lastUserText = lastUserMessage ? extractTextContent(lastUserMessage.content) : '';
        const lastUserIdx = lastUserMessage ? validMessages.indexOf(lastUserMessage) : -1;
        const priorMessages = lastUserIdx > 0 ? validMessages.slice(0, lastUserIdx) : [];
        const SUBSTANTIVE_THRESHOLD = 200;
        const prevAssistantText =
          [...priorMessages]
            .reverse()
            .map((m) => (m.role === 'assistant' ? extractTextContent(m.content) : ''))
            .find((t) => t.trim().length >= SUBSTANTIVE_THRESHOLD) ?? '';
        const cappedPrev =
          prevAssistantText.length > 8000 ? prevAssistantText.slice(0, 8000) : prevAssistantText;
        const hasSelection = !!rawCurrentDocument.selectionText;
        sse.send('trigger_doc_edit', {
          targetDocumentId: rawCurrentDocument.id,
          userPrompt: lastUserText,
          useSelection: hasSelection,
          ...(cappedPrev.trim() ? { referenceContent: cappedPrev } : {}),
        });
        log.info(
          `[ChatGraph] Emitted trigger_doc_edit for doc ${rawCurrentDocument.id} (selection: ${hasSelection}, refContentChars: ${cappedPrev.length})`
        );
      }

      // === Stage 3d: Live board edit trigger (boards editor surface only) ===
      // For edit_current_board intent, emit a `trigger_board_action` SSE event
      // with the user's prompt. The boards-editor frontend calls POST
      // /api/boards/:id/ai to plan operations, then applies them to the live
      // Yjs board. ChatGraph never edits the board itself — classify + forward.
      if (finalState.intent === 'edit_current_board' && rawCurrentBoard?.id) {
        const lastUserText = lastUserMessage ? extractTextContent(lastUserMessage.content) : '';
        const lastUserIdx = lastUserMessage ? validMessages.indexOf(lastUserMessage) : -1;
        const priorMessages = lastUserIdx > 0 ? validMessages.slice(0, lastUserIdx) : [];
        const SUBSTANTIVE_THRESHOLD = 200;
        const prevAssistantText =
          [...priorMessages]
            .reverse()
            .map((m) => (m.role === 'assistant' ? extractTextContent(m.content) : ''))
            .find((t) => t.trim().length >= SUBSTANTIVE_THRESHOLD) ?? '';
        const cappedPrev =
          prevAssistantText.length > 8000 ? prevAssistantText.slice(0, 8000) : prevAssistantText;
        sse.send('trigger_board_action', {
          targetBoardId: rawCurrentBoard.id,
          userPrompt: lastUserText,
          ...(cappedPrev.trim() ? { referenceContent: cappedPrev } : {}),
        });
        log.info(
          `[ChatGraph] Emitted trigger_board_action for board ${rawCurrentBoard.id} (refContentChars: ${cappedPrev.length})`
        );
      }

      // === Stage 4: Persist & complete ===
      // Kicked off here but awaited only after sse.end(): the client already
      // has the full response, so a slow Postgres write must not delay the
      // done event. persistAssistantResponse catches its own errors.
      const persistPromise = persistAssistantResponse({
        threadId: actualThreadId!,
        userId,
        fullText,
        finalState,
        classifiedState,
        generatedImage,
        sharepicVariants,
        isNewThread,
        lastUserMessage: lastUserMessage as ModelMessage,
        processedMeta,
        aiWorkerPool,
        requestId,
      });

      // === Stage 4b: Emit confirm_action for intents that need user approval ===
      if (actualThreadId && classifiedState.intent !== 'save_as_doc') {
        await emitConfirmAction({
          sse,
          actualThreadId,
          userId,
          fullText,
          finalState,
          classifiedState,
          ...(rawDocMentionIds != null && { rawDocMentionIds }),
          ...(rawBoardIds != null && { rawBoardIds }),
        });
      }

      // === Stage 4c: Handle save_as_doc (primary or secondary intent) ===
      const isSaveAsDoc =
        classifiedState.intent === 'save_as_doc' ||
        classifiedState.secondaryIntent === 'save_as_doc';
      if (isSaveAsDoc && fullText) {
        const lastUserText = lastUserMessage ? extractTextContent(lastUserMessage.content) : '';
        const conversationContext = [
          ...validMessages.slice(-4).map((m) => `${m.role}: ${extractTextContent(m.content)}`),
          `assistant: ${fullText.slice(0, 3000)}`,
        ].join('\n');

        await generateAndCreateDocument({
          sse,
          classifiedState,
          aiWorkerPool,
          req,
          ...(actualThreadId != null && { actualThreadId }),
          userId,
          userContent: lastUserText,
          subtypeOverride: classifiedState.documentSubtype,
          conversationContext,
          intent: 'save_as_doc',
          skipTerminate: true,
        });
      }

      const totalTimeMs = Date.now() - finalState.startTime;
      sse.send('done', {
        ...(actualThreadId != null && { threadId: actualThreadId }),
        citations: finalState.citations,
        generatedImage,
        metadata: {
          intent: finalState.intent,
          searchCount: finalState.searchCount || 0,
          totalTimeMs,
          ...(finalState.classificationTimeMs != null && {
            classificationTimeMs: finalState.classificationTimeMs,
          }),
          ...(finalState.searchTimeMs != null && { searchTimeMs: finalState.searchTimeMs }),
          ...(finalState.imageTimeMs != null && { imageTimeMs: finalState.imageTimeMs }),
          ...(finalState.summaryTimeMs != null && { summaryTimeMs: finalState.summaryTimeMs }),
          ...(memoryRetrieveTimeMs > 0 && { memoryRetrieveTimeMs }),
        },
      });

      log.info(`[ChatGraph] Complete: ${fullText.length} chars in ${totalTimeMs}ms`);
      sse.end();
      await persistPromise;
      return { status: 200 as const, body: undefined };
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
      if (!sse.isEnded()) {
        sse.send('error', { error: PROGRESS_MESSAGES.internalError });
        sse.end();
      }
      return { status: 200 as const, body: undefined };
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
