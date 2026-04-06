/**
 * ChatGraph Controller (Primary)
 *
 * Route handler for the LangGraph-based agentic chat system.
 * Uses SSE (Server-Sent Events) for streaming with progress indicators.
 *
 * SSE Event Flow:
 * 1. thread_created - New thread ID (if created)
 * 2. intent - Classification result with German status message
 * 3. search_start / image_start - Search or image generation beginning (if applicable)
 * 4. search_complete / image_complete - Search or image done with results
 * 5. response_start - Generation beginning
 * 6. text_delta - Streaming text chunks (multiple)
 * 7. done - Final metadata with citations, images, and timing
 */

import { convertToModelMessages } from 'ai';
import express from 'express';

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
import { createAuthenticatedRouter } from '../../utils/keycloak/index.js';
import { createLogger } from '../../utils/logger.js';

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
import {
  getUser,
  createThread,
  createMessage,
  touchThread,
} from './services/threadPersistenceService.js';

import type { ProcessedAttachmentMeta } from './services/attachmentProcessingService.js';
import type {
  ChatGraphState,
  GeneratedImageResult,
  ProcessedAttachment,
  ImageAttachment,
  SearchIntent,
} from '../../agents/langgraph/ChatGraph/types.js';
import type { UIMessage } from 'ai';

const log = createLogger('ChatGraphController');
const router = createAuthenticatedRouter();
router.use(express.json({ limit: '50mb' }));

/**
 * POST /api/chat-graph/stream
 *
 * Process a chat message using the LangGraph ChatGraph with SSE progress events.
 */
router.post('/stream', async (req, res) => {
  const sse = createSSEStream(res);
  const requestId = `req_${Date.now()}`;

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
      defaultNotebookId: rawDefaultNotebookId,
      boardIds: rawBoardIds,
      docMentionIds: rawDocMentionIds,
      customSystemPrompt: rawCustomSystemPrompt,
      roleName: rawRoleName,
    } = req.body as {
      messages: UIMessage[];
      agentId?: string;
      threadId?: string;
      enabledTools?: Record<string, boolean>;
      modelId?: string;
      attachments?: ProcessedAttachment[];
      notebookIds?: string[];
      forcedTools?: string[];
      documentIds?: string[];
      textIds?: string[];
      documentChatIds?: string[];
      documentChatMode?: boolean;
      defaultNotebookId?: string;
      boardIds?: string[];
      docMentionIds?: string[];
      customSystemPrompt?: string;
      roleName?: string;
    };

    // === Validate ===
    const user = getUser(req);
    if (!user?.id) {
      sse.send('error', { error: PROGRESS_MESSAGES.unauthorized });
      sse.end();
      return;
    }

    const userId = user.id;
    const aiWorkerPool = req.app.locals.aiWorkerPool;

    if (!aiWorkerPool) {
      sse.send('error', { error: PROGRESS_MESSAGES.aiUnavailable });
      sse.end();
      return;
    }

    if (!clientMessages || !Array.isArray(clientMessages) || clientMessages.length === 0) {
      sse.send('error', { error: PROGRESS_MESSAGES.messagesRequired });
      sse.end();
      return;
    }

    const notebookIds = rawNotebookIds?.filter(isKnownNotebook) || [];
    const defaultNotebookId =
      rawDefaultNotebookId && isKnownNotebook(rawDefaultNotebookId)
        ? rawDefaultNotebookId
        : undefined;

    log.info(`[ChatGraph] Processing request for user ${userId}, agent ${agentId || 'default'}`);
    if (notebookIds.length > 0) {
      log.info(`[ChatGraph] Notebook scoping: ${notebookIds.join(', ')}`);
    }

    // === Convert messages ===
    let modelMessages;
    try {
      modelMessages = await convertToModelMessages(clientMessages);
    } catch (convertError) {
      log.error('[ChatGraph] Error converting messages:', convertError);
      sse.send('error', { error: 'Failed to process messages' });
      sse.end();
      return;
    }

    if (!modelMessages || !Array.isArray(modelMessages)) {
      sse.send('error', { error: 'Failed to process messages' });
      sse.end();
      return;
    }

    const validMessages = filterEmptyAssistantMessages(modelMessages);
    log.info(
      `[ChatGraph] Converted ${clientMessages.length} → ${validMessages.length} valid messages`
    );

    const lastUserMessage = validMessages.filter((m) => m.role === 'user').pop();

    // === Create thread if needed ===
    let actualThreadId = threadId;
    let isNewThread = false;

    if (!actualThreadId && lastUserMessage) {
      const userText = extractTextContent(lastUserMessage.content);
      const thread = await createThread(
        userId,
        agentId || 'gruenerator-universal',
        userText.slice(0, 50) + (userText.length > 50 ? '...' : '') || 'Neue Unterhaltung'
      );
      actualThreadId = thread.id;
      isNewThread = true;
      sse.send('thread_created', { threadId: actualThreadId });
    }

    if (actualThreadId && lastUserMessage) {
      if (!isNewThread) {
        if (!(await canAccessThread(actualThreadId, userId))) {
          sse.send('error', { error: 'Thread not found' });
          res.end();
          return;
        }
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
    const { attachmentContext, imageAttachments, processedMeta } = await processAttachments(
      attachments,
      requestId
    );

    const docAttachments = attachments?.filter((a) => !a.isImage) ?? [];

    const previousAttachments = actualThreadId ? await getThreadAttachments(actualThreadId, 5) : [];

    // === Memory retrieval (mem0) ===
    // Strategy: try compiled persona first (coherent summary), fall back to individual memories
    let memoryContext: string | null = null;
    let memoryRetrieveTimeMs = 0;
    let memoriesUsed: Array<{ content: string; category: string | null }> = [];

    const mem0 = getMem0Instance();
    if (mem0 && lastUserMessage) {
      try {
        const memoryStartTime = Date.now();

        // Try compiled persona first (pre-cached, no LLM call)
        const persona = await getCachedPersona(userId);
        if (persona) {
          memoryContext = persona;
          memoriesUsed = [{ content: '[Persona]', category: null }];
          log.info(`[${requestId}] Using cached persona for memory context`);
        } else {
          // Fall back to individual memory search
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
      agentId: agentId || 'gruenerator-universal',
      enabledTools: enabledTools || {
        search: true,
        web: true,
        person: true,
        examples: true,
        research: true,
        image: true,
        image_edit: true,
      },
      aiWorkerPool,
      attachmentContext: attachmentContext || undefined,
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
      userLocale: user.locale || 'de-DE',
      customSystemPrompt: rawCustomSystemPrompt,
      userInstructions,
      contextWindowTokens,
    });

    const userLocale = user.locale || 'de-DE';
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
      rawDocumentIds,
      rawTextIds,
      rawBoardIds,
      rawDocMentionIds,
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

    let forcedTool = false;
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
          : (['sharepic', 'image', 'image_edit', 'summary', 'research', 'web', 'search'] as const);

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
      searchQuery: classifiedState.searchQuery ?? undefined,
      subQueries: classifiedState.subQueries ?? undefined,
      searchSources: classifiedState.searchSources?.length
        ? classifiedState.searchSources
        : undefined,
      secondaryIntent: classifiedState.secondaryIntent || undefined,
      compound: isCompound || undefined,
    });

    // === Chat history context enrichment ===
    if (classifiedState.searchSources?.includes('chat_history') && classifiedState.searchQuery) {
      try {
        const chatResults = await searchChatHistory(userId, classifiedState.searchQuery, {
          excludeThreadId: actualThreadId || undefined,
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
        options: classifiedState.clarificationOptions || undefined,
        threadId: actualThreadId,
      });

      await pipelineStateStore.store(actualThreadId!, {
        classifiedState,
        requestContext: {
          userId,
          agentId: agentId || 'gruenerator-universal',
          enabledTools: enabledTools || {},
          modelId,
          actualThreadId,
          isNewThread,
          processedMeta,
          imageAttachments,
          memoryContext,
          memoryRetrieveTimeMs,
          validMessages,
          forcedTool,
          rawDocumentIds,
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
      return;
    }

    // === Handle @board-erstellen tool ===
    if (forcedTools?.includes('board-erstellen')) {
      const created = await handleBoardCreation({
        sse,
        classifiedState,
        lastUserMessage,
        aiWorkerPool,
        req,
        actualThreadId,
        userId,
      });
      if (created) return;
    }

    // === Handle @dokument-erstellen tool ===
    if (forcedTools?.includes('dokument-erstellen')) {
      const lastUserText = lastUserMessage ? extractTextContent(lastUserMessage.content) : '';
      const created = await generateAndCreateDocument({
        sse,
        classifiedState,
        aiWorkerPool,
        req,
        actualThreadId,
        userId,
        userContent: lastUserText,
        intent: 'direct',
      });
      if (created) return;
    }

    // === Handle save_as_doc intent ===
    if (classifiedState.intent === 'save_as_doc') {
      const lastUserText = lastUserMessage ? extractTextContent(lastUserMessage.content) : '';
      const conversationContext = validMessages
        .slice(-6)
        .map((m) => `${m.role}: ${extractTextContent(m.content)}`)
        .join('\n');

      const created = await generateAndCreateDocument({
        sse,
        classifiedState,
        aiWorkerPool,
        req,
        actualThreadId,
        userId,
        userContent: lastUserText,
        subtypeOverride: classifiedState.documentSubtype,
        conversationContext,
        intent: 'save_as_doc',
      });
      if (created) return;
    }

    // === Handle share_doc intent ===
    if (classifiedState.intent === 'share_doc' && actualThreadId) {
      const handled = await handleShareDoc({
        sse,
        classifiedState,
        actualThreadId,
        userId,
        lastUserMessage,
        rawDocMentionIds,
        rawDocumentChatIds: rawDocumentChatIds,
      });
      if (handled) return;
    }

    // === Stage 2: Search or Image Generation ===
    const { finalState, generatedImage } = await executeIntentPipeline({
      classifiedState,
      sse,
      forcedTool,
      enabledTools,
      imageAttachments,
      req,
    });

    // === Stage 3: Response generation ===
    sse.send('response_start', { message: PROGRESS_MESSAGES.responseStart });

    const systemMessage = await buildSystemMessage(finalState);
    const { model: aiModel } = resolveModel(finalState.agentConfig, modelId, {
      hasImages: imageAttachments.length > 0,
    });

    const prunedValidMessages = pruneMessages(validMessages);
    const finalSystemMessage = actualThreadId
      ? await applyCompaction(
          actualThreadId,
          prunedValidMessages,
          systemMessage,
          contextWindowTokens
        )
      : systemMessage;

    let messagesForAI = buildMessagesForAI(finalSystemMessage, prunedValidMessages);
    messagesForAI = injectImageAttachments(messagesForAI, imageAttachments, requestId);

    const fullText = await streamAndAccumulate({
      model: aiModel,
      messages: messagesForAI,
      maxTokens: finalState.agentConfig.params.max_tokens,
      temperature: finalState.agentConfig.params.temperature,
      sse,
    });

    if (fullText === null) return; // stream errored, SSE already closed

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
      lastUserMessage,
      processedMeta,
      aiWorkerPool,
      requestId,
    });

    // === Stage 4b: Emit confirm_action for intents that need user approval ===
    if (actualThreadId) {
      await emitConfirmAction({
        sse,
        actualThreadId,
        userId,
        fullText,
        finalState,
        classifiedState,
        rawDocMentionIds,
        rawBoardIds,
      });
    }

    // === Stage 4c: Handle save_as_doc as secondary intent ===
    if (
      classifiedState.secondaryIntent === 'save_as_doc' &&
      classifiedState.intent !== 'save_as_doc' &&
      fullText
    ) {
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
        actualThreadId,
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
      threadId: actualThreadId,
      citations: finalState.citations,
      generatedImage,
      metadata: {
        intent: finalState.intent,
        searchCount: finalState.searchCount || 0,
        totalTimeMs,
        classificationTimeMs: finalState.classificationTimeMs,
        searchTimeMs: finalState.searchTimeMs || 0,
        imageTimeMs: finalState.imageTimeMs || undefined,
        summaryTimeMs: finalState.summaryTimeMs || undefined,
        memoryRetrieveTimeMs: memoryRetrieveTimeMs > 0 ? memoryRetrieveTimeMs : undefined,
      },
    });

    log.info(`[ChatGraph] Complete: ${fullText.length} chars in ${totalTimeMs}ms`);
    sse.end();
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
  }
});

/**
 * POST /api/chat-graph/resume
 *
 * Resume a previously interrupted ChatGraph pipeline after the user provides
 * a clarification answer.
 */
router.post('/resume', async (req, res) => {
  const sse = createSSEStream(res);
  const requestId = `resume_${Date.now()}`;

  try {
    const { threadId, resume: userAnswer } = req.body as {
      threadId: string;
      resume: string;
    };

    const user = getUser(req);
    if (!user?.id) {
      sse.send('error', { error: PROGRESS_MESSAGES.unauthorized });
      sse.end();
      return;
    }

    if (!threadId || !userAnswer) {
      sse.send('error', { error: 'threadId and resume answer are required' });
      sse.end();
      return;
    }

    const stored = await pipelineStateStore.get(threadId);
    if (!stored) {
      sse.send('error', {
        error: 'Pipeline-Status abgelaufen. Bitte sende deine Nachricht erneut.',
      });
      sse.end();
      return;
    }
    await pipelineStateStore.delete(threadId);

    const { classifiedState, requestContext } = stored;

    if (requestContext.userId !== user.id) {
      sse.send('error', { error: PROGRESS_MESSAGES.unauthorized });
      sse.end();
      return;
    }

    const aiWorkerPool = req.app.locals.aiWorkerPool;
    if (!aiWorkerPool) {
      sse.send('error', { error: PROGRESS_MESSAGES.aiUnavailable });
      sse.end();
      return;
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
      searchQuery: classifiedState.searchQuery ?? undefined,
      subQueries: classifiedState.subQueries ?? undefined,
      searchSources: classifiedState.searchSources?.length
        ? classifiedState.searchSources
        : undefined,
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
          results: finalState.searchResults?.slice(0, 10) || [],
        });
      }
    }

    // === Response ===
    sse.send('response_start', { message: PROGRESS_MESSAGES.responseStart });

    const systemMessage = await buildSystemMessage(finalState);
    const resumeImageAttachments = requestContext.imageAttachments || [];
    const { model: aiModel } = resolveModel(finalState.agentConfig, modelId, {
      hasImages: resumeImageAttachments.length > 0,
    });

    const validMessages = requestContext.validMessages;
    const prunedValidMessages = pruneMessages(validMessages);
    const messagesForAI = buildMessagesForAI(systemMessage, prunedValidMessages);

    const fullText = await streamAndAccumulate({
      model: aiModel,
      messages: messagesForAI,
      maxTokens: finalState.agentConfig.params.max_tokens,
      temperature: finalState.agentConfig.params.temperature,
      sse,
      logPrefix: '[ChatGraph:Resume]',
    });

    if (fullText === null) return;

    // === Persist & complete ===
    await persistResumedResponse({
      threadId: requestContext.actualThreadId!,
      fullText,
      finalState,
      classifiedState,
    });

    const totalTimeMs = Date.now() - startTime;
    sse.send('done', {
      threadId: requestContext.actualThreadId,
      citations: finalState.citations,
      metadata: {
        intent: finalState.intent,
        searchCount: finalState.searchCount || 0,
        totalTimeMs,
        classificationTimeMs: classifiedState.classificationTimeMs,
        searchTimeMs: finalState.searchTimeMs || 0,
      },
    });

    log.info(`[ChatGraph:Resume] Complete: ${fullText.length} chars in ${totalTimeMs}ms`);
    sse.end();
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    log.error(`[ChatGraph:Resume] Controller error: ${errorMessage}`);
    if (errorStack) log.error(`[ChatGraph:Resume] Stack: ${errorStack}`);
    if (!sse.isEnded()) {
      sse.send('error', { error: PROGRESS_MESSAGES.internalError });
      sse.end();
    }
  }
});

export default router;
