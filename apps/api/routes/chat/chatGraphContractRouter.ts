/**
 * ts-rest contract router for /api/chat-graph
 *
 * Wraps the SSE endpoints in chatGraphController.ts using a
 * contract-driven router from @ts-rest/express.
 *
 * Because both endpoints produce Server-Sent Events (SSE), the ts-rest
 * handler performs body validation and then delegates the actual response
 * to the same SSE helpers used by the legacy controller. The contract
 * provides typed request-body validation; the SSE stream itself is opaque
 * from ts-rest's perspective.
 *
 * Mount this BEFORE the legacy router in routes.ts so ts-rest matches
 * its own routes first; unmatched paths fall through to the legacy router.
 */

import { chatGraphContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';
import { convertToModelMessages } from 'ai';

import {
  initializeChatState,
  buildSystemMessage,
  classifierNode,
  briefGeneratorNode,
  searchNode,
  rerankNode,
  buildCitations,
} from '../../agents/langgraph/ChatGraph/index.js';
import { isKnownNotebook } from '../../config/notebookCollectionMap.js';
import {
  getMem0Instance,
  normalizeCategory,
  formatMemoriesByCategory,
} from '../../services/mem0/index.js';
import { getCachedPersona } from '../../services/mem0/personaService.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAIWorkerPool } from '../../utils/getAIWorkerPool.js';
import { createLogger } from '../../utils/logger.js';
import { ThreadId, UserId } from '../../utils/types/branded.js';

import { getContextWindow } from './agents/providers.js';
import { getThreadAttachments } from './services/attachmentPersistenceService.js';
import {
  processAttachments,
  injectImageAttachments,
} from './services/attachmentProcessingService.js';
import { searchChatHistory } from './services/chatSearchService.js';
import { extractCompoundTopic } from './services/compoundTopicExtractor.js';
import { extractChartFromResponse, emitConfirmAction } from './services/confirmActionService.js';
import { enrichContext } from './services/contextEnrichmentService.js';
import { pruneMessages, applyCompaction } from './services/contextPruningService.js';
import {
  handleBoardCreation,
  generateAndCreateDocument,
  handleShareDoc,
  executeIntentPipeline,
} from './services/intentExecutionService.js';
import { extractTextContent, filterEmptyAssistantMessages } from './services/messageHelpers.js';
import { pipelineStateStore } from './services/pipelineStateStore.js';
import {
  persistAssistantResponse,
  persistResumedResponse,
} from './services/postResponseService.js';
import {
  resolveModel,
  buildMessagesForAI,
  streamAndAccumulate,
} from './services/responseStreamingService.js';
import { createSSEStream, getIntentMessage, PROGRESS_MESSAGES } from './services/sseHelpers.js';
import { canAccessThread } from './services/threadAccessService.js';
import { getUser, createThread, createMessage } from './services/threadPersistenceService.js';

import type {
  ChatGraphState,
  ChatGraphInput,
  ProcessedAttachment,
} from '../../agents/langgraph/ChatGraph/types.js';
import type { ModelMessage, UIMessage } from 'ai';
import type { Application } from 'express';

const log = createLogger('chatGraphContractRouter');

const s = initServer();

export const chatGraphContractRouter = s.router(chatGraphContract, {
  stream: async (args) => {
    const { req, res } = args;
    const sse = createSSEStream(res);
    const requestId = `req_${Date.now()}`;
    log.info('[chatGraphContract] stream handler entered, request_id=%s', requestId);

    try {
      const {
        messages: clientMessages,
        agentId,
        threadId,
        enabledTools,
        modelId,
        attachments,
        notebookIds: rawNotebookIds,
        forcedTools,
        documentIds: rawDocumentIds,
        textIds: rawTextIds,
        documentChatIds: rawDocumentChatIds,
        documentChatMode,
        attachmentContext: rawClientAttachmentContext,
        defaultNotebookId: rawDefaultNotebookId,
        boardIds: rawBoardIds,
        docMentionIds: rawDocMentionIds,
        customSystemPrompt: rawCustomSystemPrompt,
        roleName: rawRoleName,
        initialAssistantMessage: rawInitialAssistantMessage,
      } = args.body;

      // === Validate ===
      const user = getUser(req);
      if (!user?.id) {
        sse.send('error', { error: PROGRESS_MESSAGES.unauthorized });
        sse.end();
        return { status: 200 as const, body: null };
      }

      const userId = user.id;
      const aiWorkerPool = getAIWorkerPool(req);

      if (!aiWorkerPool) {
        sse.send('error', { error: PROGRESS_MESSAGES.aiUnavailable });
        sse.end();
        return { status: 200 as const, body: null };
      }

      if ((clientMessages as unknown[]).length === 0) {
        sse.send('error', { error: PROGRESS_MESSAGES.messagesRequired });
        sse.end();
        return { status: 200 as const, body: null };
      }

      const notebookIds = rawNotebookIds?.filter(isKnownNotebook) ?? [];
      const defaultNotebookId =
        rawDefaultNotebookId && isKnownNotebook(rawDefaultNotebookId)
          ? rawDefaultNotebookId
          : undefined;

      log.info(`[ChatGraph] Processing request for user ${userId}, agent ${agentId ?? 'default'}`);
      if (notebookIds.length > 0) {
        log.info(`[ChatGraph] Notebook scoping: ${notebookIds.join(', ')}`);
      }

      // === Convert messages ===
      let modelMessages: ChatGraphInput['messages'];
      try {
        modelMessages = (await convertToModelMessages(
          clientMessages as UIMessage[]
        )) as ModelMessage[] as ChatGraphInput['messages'];
      } catch (convertError) {
        log.error('[ChatGraph] Error converting messages:', convertError);
        sse.send('error', { error: 'Failed to process messages' });
        sse.end();
        return { status: 200 as const, body: null };
      }

      if (!modelMessages || !Array.isArray(modelMessages)) {
        sse.send('error', { error: 'Failed to process messages' });
        sse.end();
        return { status: 200 as const, body: null };
      }

      const validMessages = filterEmptyAssistantMessages(
        modelMessages as ModelMessage[]
      ) as ChatGraphInput['messages'];
      log.info(
        `[ChatGraph] Converted ${(clientMessages as unknown[]).length} → ${validMessages.length} valid messages`
      );

      const lastUserMessage = validMessages.filter((m) => m.role === 'user').pop();

      // === Create thread if needed ===
      // Normalize null → undefined: contract schema uses .nullish() to accept
      // both, but downstream code is typed for string | undefined.
      let actualThreadId: string | undefined = threadId ?? undefined;
      let isNewThread = false;

      if (!actualThreadId && lastUserMessage) {
        const userText = extractTextContent(lastUserMessage.content);
        const thread = await createThread(
          userId,
          agentId ?? 'gruenerator-universal',
          userText.slice(0, 50) + (userText.length > 50 ? '...' : '') || 'Neue Unterhaltung'
        );
        actualThreadId = thread.id;
        isNewThread = true;
        sse.send('thread_created', { threadId: actualThreadId });
      }

      if (actualThreadId && lastUserMessage) {
        if (!isNewThread) {
          if (!(await canAccessThread(ThreadId(actualThreadId), UserId(userId)))) {
            sse.send('error', { error: 'Thread not found' });
            res.end();
            return { status: 200 as const, body: null };
          }
        }

        // Seed message (Antrag / PM / Social text) — persisted BEFORE the user
        // message so order is seed → user → assistant-reply. New threads only.
        if (
          isNewThread &&
          typeof rawInitialAssistantMessage === 'string' &&
          rawInitialAssistantMessage
        ) {
          await createMessage(
            actualThreadId,
            'assistant',
            rawInitialAssistantMessage,
            { seed: true },
            userId
          );
        }

        const userText = extractTextContent(lastUserMessage.content);
        await createMessage(
          actualThreadId,
          'user',
          userText,
          rawRoleName ? { roleName: rawRoleName } : undefined,
          userId
        );
      }

      // === Process attachments ===
      const {
        attachmentContext: derivedAttachmentContext,
        imageAttachments,
        processedMeta,
      } = await processAttachments(attachments as ProcessedAttachment[] | undefined, requestId);

      // Merge any client-injected context (e.g. docs editor markdown + selection)
      // with what processAttachments derived from uploaded files.
      const clientAttachmentContext =
        (rawClientAttachmentContext as string | null | undefined)?.trim() || undefined;
      const attachmentContext =
        clientAttachmentContext && derivedAttachmentContext
          ? `${clientAttachmentContext}\n\n---\n\n${derivedAttachmentContext}`
          : clientAttachmentContext || derivedAttachmentContext;

      const docAttachments =
        (attachments as ProcessedAttachment[] | undefined)?.filter((a) => !a.isImage) ?? [];

      const previousAttachments = actualThreadId
        ? await getThreadAttachments(actualThreadId, 5)
        : [];

      // === Memory retrieval (mem0) ===
      let memoryContext: string | null = null;
      let memoryRetrieveTimeMs = 0;
      let memoriesUsed: Array<{ content: string; category: string | null }> = [];

      const mem0 = getMem0Instance();
      if (mem0 && lastUserMessage) {
        try {
          const memoryStartTime = Date.now();

          const persona = await getCachedPersona(userId);
          if (persona) {
            memoryContext = persona;
            memoriesUsed = [{ content: '[Persona]', category: null }];
            log.info(`[${requestId}] Using cached persona for memory context`);
          } else {
            const userQuery = extractTextContent(lastUserMessage.content);
            const memories = await mem0.searchMemories(userQuery, userId, 5);
            if (memories.length > 0) {
              memoriesUsed = memories.map((m) => ({
                content: m.memory,
                category: normalizeCategory(m.metadata?.memoryType) ?? null,
              }));

              memoryContext = formatMemoriesByCategory(
                memories.map((m) => ({
                  memory: m.memory,
                  category: normalizeCategory(m.metadata?.memoryType),
                }))
              );
              log.info(`[${requestId}] Retrieved ${memories.length} memories for context`);
            }
          }

          memoryRetrieveTimeMs = Date.now() - memoryStartTime;
        } catch (memError) {
          log.warn(`[${requestId}] Memory retrieval failed (continuing without):`, memError);
        }
      }

      // === Read user profile instructions ===
      const userInstructions = user.custom_prompt?.trim() || undefined;

      // === Resolve context window for model-aware budgets ===
      const contextWindowTokens = getContextWindow(modelId);

      // === Initialize state ===
      const initialState = await initializeChatState({
        messages: validMessages,
        threadId: actualThreadId,
        agentId: agentId ?? 'gruenerator-universal',
        enabledTools: enabledTools ?? {
          search: true,
          web: true,
          person: true,
          examples: true,
          research: true,
          image: true,
          image_edit: true,
        },
        aiWorkerPool,
        attachmentContext: attachmentContext ?? undefined,
        imageAttachments: imageAttachments.length > 0 ? imageAttachments : undefined,
        threadAttachments: previousAttachments.length > 0 ? previousAttachments : undefined,
        notebookIds: notebookIds.length > 0 ? notebookIds : undefined,
        defaultNotebookId,
        documentIds: rawDocumentIds?.length ? rawDocumentIds : undefined,
        documentChatIds: rawDocumentChatIds?.length
          ? rawDocumentChatIds
          : docAttachments.length > 0 || documentChatMode
            ? []
            : undefined,
        boardIds: rawBoardIds?.length ? rawBoardIds : undefined,
        docMentionIds: rawDocMentionIds?.length ? rawDocMentionIds : undefined,
        userLocale: user.locale ?? 'de-DE',
        customSystemPrompt: rawCustomSystemPrompt ?? undefined,
        userInstructions,
        contextWindowTokens,
      });

      const userLocale = user.locale ?? 'de-DE';
      log.info(`[ChatGraph] User ${userId} locale: ${userLocale}`);

      initialState.agentConfig.userId = userId;
      if (memoryContext) {
        initialState.memoryContext = memoryContext;
        initialState.memoryRetrieveTimeMs = memoryRetrieveTimeMs;

        const isPersona = memoriesUsed.length === 1 && memoriesUsed[0].content === '[Persona]';
        sse.send('memory_context', {
          memoryCount: isPersona ? 1 : memoriesUsed.length,
          memories: isPersona ? [] : memoriesUsed,
          isPersona,
        });
      }

      // === Enrich context (documents, boards, mentions, vectorization) ===
      await enrichContext({
        initialState,
        userId,
        ...(rawDocumentIds != null && { rawDocumentIds }),
        ...(rawTextIds != null && { rawTextIds }),
        ...(rawBoardIds != null && { rawBoardIds }),
        ...(rawDocMentionIds != null && { rawDocMentionIds }),
        docAttachments,
        processedMeta,
        contextWindowTokens,
        sse,
      });

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
        if (forced) {
          classifiedState.intent = forced;
          forcedTool = true;
          log.info(`[ChatGraph] Intent forced to "${forced}" via @tool mention`);
        }
      }

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
        return { status: 200 as const, body: null };
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
        if (created) return { status: 200 as const, body: null };
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
        if (created) return { status: 200 as const, body: null };
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
        if (handled) return { status: 200 as const, body: null };
      }

      // === Stage 2: Search or Image Generation ===
      const { finalState, generatedImage } = await executeIntentPipeline({
        classifiedState,
        sse,
        forcedTool,
        ...(enabledTools != null && { enabledTools }),
        imageAttachments,
        req,
      });

      // === Stage 3: Response generation ===
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
        }
      );
      const { model: aiModel } = resolution;

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
      messagesForAI = injectImageAttachments(
        messagesForAI as Parameters<typeof injectImageAttachments>[0],
        imageAttachments,
        requestId
      );

      let fullText: string | null;
      try {
        fullText = await streamAndAccumulate({
          model: aiModel,
          messages: messagesForAI as Parameters<typeof streamAndAccumulate>[0]['messages'],
          maxTokens: finalState.agentConfig.params.max_tokens,
          temperature: finalState.agentConfig.params.temperature,
          sse,
        });
      } finally {
        if (resolution.releaseSlot) await resolution.releaseSlot();
      }

      if (fullText === null) return { status: 200 as const, body: null };

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

      // === Stage 4: Persist & complete ===
      await persistAssistantResponse({
        threadId: actualThreadId!,
        userId,
        fullText,
        finalState,
        classifiedState,
        generatedImage,
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
      return { status: 200 as const, body: null };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      log.error(`[ChatGraph] Controller error: ${errorMessage}`);
      if (errorStack) log.error(`[ChatGraph] Stack: ${errorStack}`);
      if (!(error instanceof Error))
        log.error(`[ChatGraph] Raw error: ${JSON.stringify(error)?.slice(0, 500)}`);
      if (!sse.isEnded()) {
        sse.send('error', { error: PROGRESS_MESSAGES.internalError });
        sse.end();
      }
      return { status: 200 as const, body: null };
    }
  },

  resume: async (args) => {
    const { req } = args;
    const sse = createSSEStream(args.res);
    const _requestId = `resume_${Date.now()}`;
    log.info('[chatGraphContract] resume handler entered, request_id=%s', _requestId);

    try {
      const { threadId, resume: userAnswer } = args.body;

      const user = getUser(req);
      if (!user?.id) {
        sse.send('error', { error: PROGRESS_MESSAGES.unauthorized });
        sse.end();
        return { status: 200 as const, body: null };
      }

      const stored = await pipelineStateStore.get(threadId);
      if (!stored) {
        sse.send('error', {
          error: 'Pipeline-Status abgelaufen. Bitte sende deine Nachricht erneut.',
        });
        sse.end();
        return { status: 200 as const, body: null };
      }
      await pipelineStateStore.delete(threadId);

      const { classifiedState, requestContext } = stored;

      if (requestContext.userId !== user.id) {
        sse.send('error', { error: PROGRESS_MESSAGES.unauthorized });
        sse.end();
        return { status: 200 as const, body: null };
      }

      const aiWorkerPool = getAIWorkerPool(req);
      if (!aiWorkerPool) {
        sse.send('error', { error: PROGRESS_MESSAGES.aiUnavailable });
        sse.end();
        return { status: 200 as const, body: null };
      }

      log.info(`[ChatGraph:Resume] Thread ${threadId}, answer: "${userAnswer.slice(0, 80)}"`);

      classifiedState.needsClarification = false;
      classifiedState.searchQuery = userAnswer;
      classifiedState.clarificationQuestion = null;
      classifiedState.clarificationOptions = null;

      const nonSearchIntents = new Set(['direct', 'image', 'image_edit']);
      if (nonSearchIntents.has(classifiedState.intent)) {
        classifiedState.intent = 'search';
      }

      const startTime = Date.now();

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
      let finalState = classifiedState;
      const { enabledTools, modelId, forcedTool } = requestContext;

      if (!nonSearchIntents.has(classifiedState.intent)) {
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

          if (finalState.searchResults?.length > 3) {
            const rerankResult = await rerankNode(finalState);
            finalState = { ...finalState, ...rerankResult } as ChatGraphState;
            if (finalState.searchResults.length > 0) {
              finalState.citations = buildCitations(finalState.searchResults);
            }
          }

          const resultCount = finalState.searchResults?.length || 0;
          sse.send('search_complete', {
            message: PROGRESS_MESSAGES.searchComplete(resultCount),
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
          });
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
      });
      const { model: aiModel } = resolution2;

      const validMessages = requestContext.validMessages;
      const prunedValidMessages = pruneMessages(validMessages);
      const messagesForAI = buildMessagesForAI(systemMessage, prunedValidMessages);

      let fullText: string | null;
      try {
        fullText = await streamAndAccumulate({
          model: aiModel,
          messages: messagesForAI,
          maxTokens: finalState.agentConfig.params.max_tokens,
          temperature: finalState.agentConfig.params.temperature,
          sse,
          logPrefix: '[ChatGraph:Resume]',
        });
      } finally {
        if (resolution2.releaseSlot) await resolution2.releaseSlot();
      }

      if (fullText === null) return { status: 200 as const, body: null };

      // === Persist & complete ===
      await persistResumedResponse({
        threadId: requestContext.actualThreadId!,
        fullText,
        finalState,
        classifiedState,
      });

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
        },
      });

      log.info(`[ChatGraph:Resume] Complete: ${fullText.length} chars in ${totalTimeMs}ms`);
      sse.end();
      return { status: 200 as const, body: null };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      log.error(`[ChatGraph:Resume] Controller error: ${errorMessage}`);
      if (errorStack) log.error(`[ChatGraph:Resume] Stack: ${errorStack}`);
      if (!sse.isEnded()) {
        sse.send('error', { error: PROGRESS_MESSAGES.internalError });
        sse.end();
      }
      return { status: 200 as const, body: null };
    }
  },
});

/**
 * Mount the ts-rest contract router onto an Express app instance.
 * Call this from routes.ts BEFORE mounting the legacy chatGraphController router.
 */
export function mountChatGraphContractRouter(app: Application): void {
  createExpressEndpoints(chatGraphContract, chatGraphContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'chatGraphContract'),
  });
}
