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
  imageNode,
  imageEditNode,
  summarizeNode,
  buildCitations,
} from '../../agents/langgraph/ChatGraph/index.js';
import { truncateDocument } from '../../agents/langgraph/ChatGraph/nodes/respondNode.js';
import { isKnownNotebook } from '../../config/notebookCollectionMap.js';
import { getMem0Instance } from '../../services/mem0/index.js';
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
import { pruneMessages, applyCompaction } from './services/contextPruningService.js';
import { fetchDocumentContext, fetchTextContext } from './services/documentContextService.js';
import { extractTextContent, filterEmptyAssistantMessages } from './services/messageHelpers.js';
import { pendingActionStore } from './services/pendingActionStore.js';
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
  threadExists,
} from './services/threadPersistenceService.js';

import type { ProcessedAttachmentMeta } from './services/attachmentProcessingService.js';
import type {
  ChatGraphState,
  GeneratedImageResult,
  ProcessedAttachment,
  ImageAttachment,
  PendingAction,
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
      // Validate thread access before inserting (prevents FK violation + enforces sharing permissions)
      if (!isNewThread) {
        if (!(await canAccessThread(actualThreadId, userId))) {
          sse.send('error', { error: 'Thread not found' });
          res.end();
          return;
        }
      }
      const userText = extractTextContent(lastUserMessage.content);
      await createMessage(actualThreadId, 'user', userText, undefined, userId);
    }

    // === Process attachments ===
    const { attachmentContext, imageAttachments, processedMeta } = await processAttachments(
      attachments,
      requestId
    );

    const docAttachments = attachments?.filter((a) => !a.isImage) ?? [];

    const previousAttachments = actualThreadId ? await getThreadAttachments(actualThreadId, 5) : [];

    // === Memory retrieval (mem0) ===
    let memoryContext: string | null = null;
    let memoryRetrieveTimeMs = 0;

    const mem0 = getMem0Instance();
    if (mem0 && lastUserMessage) {
      try {
        const memoryStartTime = Date.now();
        const userQuery = extractTextContent(lastUserMessage.content);
        const memories = await mem0.searchMemories(userQuery, userId, 5);
        if (memories.length > 0) {
          memoryContext = memories.map((m) => `- ${m.memory}`).join('\n');
          log.info(`[${requestId}] Retrieved ${memories.length} memories for context`);
        }
        memoryRetrieveTimeMs = Date.now() - memoryStartTime;
      } catch (memError) {
        log.warn(`[${requestId}] Memory retrieval failed (continuing without):`, memError);
      }
    }

    // === Read user profile instructions ===
    const userInstructions = (user as any).custom_prompt?.trim() || undefined;

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
      userLocale: (user as any)?.locale || 'de-DE',
      customSystemPrompt: rawCustomSystemPrompt,
      userInstructions,
      contextWindowTokens,
    });

    const userLocale = (user as any)?.locale || 'de-DE';
    log.info(`[ChatGraph] User ${userId} locale: ${userLocale}`);

    (initialState.agentConfig as any).userId = userId;
    if (memoryContext) {
      initialState.memoryContext = memoryContext;
      initialState.memoryRetrieveTimeMs = memoryRetrieveTimeMs;
    }

    // Handle @datei document and text references
    if (rawDocumentIds?.length) {
      try {
        const docResult = await fetchDocumentContext(userId, rawDocumentIds);
        if (docResult.text) {
          initialState.attachmentContext = initialState.attachmentContext
            ? `${initialState.attachmentContext}\n\n---\n\n## REFERENZIERTE DOKUMENTE\n\n${docResult.text}`
            : `## REFERENZIERTE DOKUMENTE\n\n${docResult.text}`;
        } else if (docResult.documents.length > 0) {
          initialState.documentIds = docResult.documents.map((d) => d.id);
        }
      } catch (err) {
        log.warn(
          `[ChatGraph] Document context retrieval failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    if (rawTextIds?.length) {
      try {
        const textResult = await fetchTextContext(userId, rawTextIds);
        if (textResult.text) {
          initialState.attachmentContext = initialState.attachmentContext
            ? `${initialState.attachmentContext}\n\n---\n\n## REFERENZIERTE TEXTE\n\n${textResult.text}`
            : `## REFERENZIERTE TEXTE\n\n${textResult.text}`;
          log.info(
            `[ChatGraph] Text context injected: ${textResult.totalChars} chars from ${textResult.count} text(s)`
          );
        }
      } catch (err) {
        log.warn(
          `[ChatGraph] Text context retrieval failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    // === Fetch board context (from @board mentions) ===
    if (rawBoardIds?.length) {
      try {
        const { loadBoardState, formatBoardAsContext } =
          await import('../../services/boards/BoardService.js');

        const boardStates = await Promise.all(
          rawBoardIds.map((boardId) =>
            loadBoardState(boardId, userId).catch((err) => {
              log.warn(
                `[ChatGraph] Failed to load board ${boardId}: ${err instanceof Error ? err.message : String(err)}`
              );
              return null;
            })
          )
        );

        const boardContextParts = boardStates
          .filter((s): s is NonNullable<typeof s> => s !== null)
          .map((s) => {
            log.info(
              `[ChatGraph] Board context loaded: "${s.title}" (${s.fields.length} fields, ${s.rows.length} rows)`
            );
            return formatBoardAsContext(s);
          });

        if (boardContextParts.length > 0) {
          initialState.boardContext = boardContextParts.join('\n\n');
        }
      } catch (importErr) {
        log.warn(
          `[ChatGraph] Board context services unavailable: ${importErr instanceof Error ? importErr.message : String(importErr)}`
        );
      }
    }

    // === Fetch collaborative document context (from @doc mentions) ===
    if (rawDocMentionIds?.length) {
      try {
        const { getPostgresInstance } =
          await import('../../database/services/PostgresService/PostgresService.js');
        const dbInst = getPostgresInstance();

        const docResults = await dbInst.query(
          `SELECT id, title, content FROM collaborative_documents
           WHERE id = ANY($1) AND is_deleted = false AND document_subtype != 'boards'
           AND (created_by = $2 OR permissions ? $2::text OR is_public = true
                OR id IN (SELECT gcs.content_id FROM group_content_shares gcs
                          INNER JOIN group_memberships gm ON gm.group_id = gcs.group_id AND gm.user_id = $2
                          WHERE gcs.content_type = 'collaborative_documents'))`,
          [rawDocMentionIds, userId]
        );

        if (docResults.length > 0) {
          // Per-doc budget scales with context window: 8K for 128K models, 2K for 16K models
          const perDocBudget = Math.max(
            2000,
            Math.min(8000, Math.floor(contextWindowTokens * 0.25))
          );
          const docParts = (
            docResults as Array<{ id: string; title: string; content: string | null }>
          )
            .filter((d) => d.content)
            .map((d) => {
              let plainText = d.content || '';
              let prevText: string;
              do {
                prevText = plainText;
                plainText = plainText.replace(/<[^>]+>/g, '');
              } while (plainText !== prevText);
              plainText = plainText
                .replace(/&[a-zA-Z]+;/g, ' ')
                .replace(/&#x?[0-9a-fA-F]+;/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
              const truncated = truncateDocument(plainText, perDocBudget);
              if (truncated.length < plainText.length) {
                log.info(
                  `[ChatGraph] Doc context truncated: "${d.title}" (${plainText.length} → ${truncated.length} chars, budget: ${perDocBudget})`
                );
              } else {
                log.info(
                  `[ChatGraph] Doc context loaded: "${d.title}" (${plainText.length} chars)`
                );
              }
              return `### ${d.title}\n\n${truncated}`;
            });

          if (docParts.length > 0) {
            initialState.documentMentionContext = docParts.join('\n\n---\n\n');
          }
        }
      } catch (err) {
        log.warn(
          `[ChatGraph] Doc mention context failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    // === Phase 2: Index uploaded document attachments via vector pipeline ===
    // Small docs (<4K chars extracted text) stay inline for full context.
    // Large docs are vectorized for RAG retrieval — more efficient and relevant
    // than truncating 50 pages to intro+outro.
    const SMALL_DOC_VECTORIZATION_THRESHOLD = 4000;

    const largeDocAttachments = docAttachments.filter((att) => {
      const meta = processedMeta.find((m) => m.name === att.name && !m.isImage);
      const textLength = meta?.extractedText?.length ?? 0;
      return textLength >= SMALL_DOC_VECTORIZATION_THRESHOLD;
    });

    if (largeDocAttachments.length > 0) {
      try {
        const { getPostgresDocumentService } =
          await import('../../services/document-services/PostgresDocumentService/index.js');
        const { getQdrantDocumentService } =
          await import('../../services/document-services/DocumentSearchService/index.js');
        const { processFileUpload } =
          await import('../../services/document-services/DocumentProcessingService/fileProcessing.js');

        const pgService = getPostgresDocumentService();
        const qdrantService = getQdrantDocumentService();

        for (const att of largeDocAttachments) {
          try {
            const buffer = Buffer.from(att.data, 'base64');
            const result = await processFileUpload(
              pgService,
              qdrantService,
              userId,
              {
                buffer,
                mimetype: att.type,
                originalname: att.name,
                size: buffer.length,
              },
              att.name,
              'documentchat'
            );

            initialState.documentChatIds.push(result.id);
            sse.send('document_indexed', {
              documentId: result.id,
              title: result.title,
            });
            log.info(`[ChatGraph] Indexed attachment as document: ${result.title} (${result.id})`);
          } catch (indexErr) {
            log.warn(
              `[ChatGraph] Failed to index attachment "${att.name}": ${indexErr instanceof Error ? indexErr.message : String(indexErr)}`
            );
          }
        }
      } catch (importErr) {
        log.warn(
          `[ChatGraph] Document indexing services unavailable: ${importErr instanceof Error ? importErr.message : String(importErr)}`
        );
      }
    }

    // Clear raw attachment text for vectorized docs only.
    // Small docs (<4K chars) keep their inline attachmentContext.
    if (initialState.documentChatIds && initialState.documentChatIds.length > 0) {
      if (largeDocAttachments.length === docAttachments.length) {
        // All docs were vectorized — clear all attachment context
        initialState.attachmentContext = null;
      } else {
        // Mixed: keep only small doc text in attachmentContext, large docs use RAG
        const smallDocNames = new Set(
          docAttachments.filter((att) => !largeDocAttachments.includes(att)).map((att) => att.name)
        );
        const smallDocTexts = processedMeta
          .filter((m) => !m.isImage && m.extractedText && smallDocNames.has(m.name))
          .map((m) => `### ${m.name}\n\n${m.extractedText}`);
        initialState.attachmentContext =
          smallDocTexts.length > 0 ? smallDocTexts.join('\n\n---\n\n') : null;
      }
      log.info(
        `[ChatGraph] Attachment routing: ${largeDocAttachments.length} vectorized (RAG), ${docAttachments.length - largeDocAttachments.length} inline`
      );
    }

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
    // When notebooks + non-default agent are both present, this is a compound query
    // (e.g., "@hamburg erstelle eine @pressemitteilung" = search Hamburg THEN write press release)
    const isCompound = notebookIds.length > 0 && !!agentId && agentId !== 'gruenerator-universal';
    classifiedState.isCompound = isCompound;

    if (isCompound) {
      log.info(
        `[ChatGraph] Compound query detected: notebooks=[${notebookIds.join(',')}], agent=${agentId}`
      );

      // Ensure search query is populated for compound queries with vague text
      if (!classifiedState.searchQuery) {
        const userText = lastUserMessage ? extractTextContent(lastUserMessage.content) : '';
        classifiedState.searchQuery = extractCompoundTopic(userText, notebookIds);
        log.info(`[ChatGraph] Compound topic extracted: "${classifiedState.searchQuery}"`);
      }

      // Emit compound start event for frontend multi-step progress
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
      // For compound queries with search-class forced tools, search takes precedence
      const searchClassTools = ['research', 'web', 'search'];
      const hasSearchTool = forcedTools.some((t) => searchClassTools.includes(t));

      const TOOL_PRIORITY =
        isCompound && hasSearchTool
          ? (['research', 'web', 'search', 'image', 'image_edit', 'summary'] as const)
          : (['image', 'image_edit', 'summary', 'research', 'web', 'search'] as const);

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
    // Skip clarification for compound queries — the user was explicit with mentions
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
      sse.send('response_start', { message: 'Erstelle Board...' });

      try {
        const {
          BOARD_GENERATION_PROMPT,
          createBoardDocument,
          parseBoardStructure,
          postProcessBoardStructure,
        } = await import('../../services/boards/BoardService.js');

        const lastUserText = lastUserMessage ? extractTextContent(lastUserMessage.content) : '';

        const boardGenResult = await aiWorkerPool.processRequest(
          {
            type: 'board_generation',
            systemPrompt: BOARD_GENERATION_PROMPT,
            messages: [{ role: 'user', content: lastUserText }],
            options: { temperature: 0.7, max_tokens: 2000 },
          },
          req
        );

        const boardStructure =
          boardGenResult.success && boardGenResult.content
            ? parseBoardStructure(boardGenResult.content)
            : null;

        if (boardStructure) {
          const { id: newBoardId, title: boardTitle } = await createBoardDocument(
            boardStructure.title || 'Neues Board',
            userId
          );

          const columnNames = boardStructure.statusOptions.map((c) => c.name).join(', ');
          const cardCount = boardStructure.rows.length;

          const responseText =
            `Board **"${boardTitle}"** wurde erstellt!\n\n` +
            `**Spalten:** ${columnNames}\n` +
            `**Karten:** ${cardCount} Aufgaben\n\n` +
            `[Board öffnen](/boards/${newBoardId})`;

          for (let i = 0; i < responseText.length; i += 20) {
            sse.send('text_delta', { text: responseText.slice(i, i + 20) });
          }

          const totalTimeMs = Date.now() - classifiedState.startTime;
          sse.sendRaw('done', {
            threadId: actualThreadId,
            citations: [],
            boardId: newBoardId,
            boardGeneratedStructure: postProcessBoardStructure(boardStructure, userId),
            metadata: {
              intent: 'direct',
              searchCount: 0,
              totalTimeMs,
              classificationTimeMs: classifiedState.classificationTimeMs,
              searchTimeMs: 0,
            },
          });

          if (actualThreadId) {
            await createMessage(actualThreadId, 'assistant', responseText);
            await touchThread(actualThreadId);
          }

          log.info(`[ChatGraph] Board created: "${boardTitle}" (${newBoardId})`);
          sse.end();
          return;
        }
      } catch (boardErr) {
        log.error(
          `[ChatGraph] Board creation failed: ${boardErr instanceof Error ? boardErr.message : String(boardErr)}`
        );
      }
    }

    // === Handle @dokument-erstellen tool ===
    if (forcedTools?.includes('dokument-erstellen')) {
      sse.send('response_start', { message: 'Erstelle Dokument...' });

      try {
        const { DOCUMENT_GENERATION_PROMPT, parseDocumentResponse, createDocumentWithContent } =
          await import('../../services/docs/DocGenerationService.js');

        const lastUserText = lastUserMessage ? extractTextContent(lastUserMessage.content) : '';

        const docGenResult = await aiWorkerPool.processRequest(
          {
            type: 'doc_generation',
            systemPrompt: DOCUMENT_GENERATION_PROMPT,
            messages: [{ role: 'user', content: lastUserText }],
            options: { temperature: 0.7, max_tokens: 4000 },
          },
          req
        );

        const generated =
          docGenResult.success && docGenResult.content
            ? parseDocumentResponse(docGenResult.content)
            : { title: 'Neues Dokument', subtype: 'blank', content: '' };

        const newDoc = await createDocumentWithContent(
          generated.title,
          generated.content,
          generated.subtype,
          userId
        );

        const newDocId = newDoc.id;
        const docTitle = generated.title;

        const responseText =
          `Dokument **"${docTitle}"** wurde erstellt!\n\n` +
          `**Typ:** ${generated.subtype}\n\n` +
          `[Dokument öffnen](/document/${newDocId})`;

        for (let i = 0; i < responseText.length; i += 20) {
          sse.send('text_delta', { text: responseText.slice(i, i + 20) });
        }

        const totalTimeMs = Date.now() - classifiedState.startTime;
        sse.sendRaw('done', {
          threadId: actualThreadId,
          citations: [],
          documentId: newDocId,
          metadata: {
            intent: 'direct',
            searchCount: 0,
            totalTimeMs,
            classificationTimeMs: classifiedState.classificationTimeMs,
            searchTimeMs: 0,
          },
        });

        if (actualThreadId) {
          await createMessage(actualThreadId, 'assistant', responseText);
          await touchThread(actualThreadId);
        }

        log.info(`[ChatGraph] Document created: "${docTitle}" (${newDocId})`);
        sse.end();
        return;
      } catch (docErr) {
        log.error(
          `[ChatGraph] Document creation failed: ${docErr instanceof Error ? docErr.message : String(docErr)}`
        );
      }
    }

    // === Stage 2: Search or Image Generation ===
    let finalState = classifiedState;
    let generatedImage: GeneratedImageResult | null = null;

    log.info(
      `[ChatGraph] Stage 2 — intent=${classifiedState.intent}, forcedTool=${forcedTool}, enabledTools.image=${enabledTools?.['image']}`
    );
    if (classifiedState.intent === 'image') {
      const imageToolEnabled = forcedTool || enabledTools?.['image'] !== false;
      log.info(
        `[ChatGraph] Image branch — imageToolEnabled=${imageToolEnabled}, userId=${(classifiedState.agentConfig as any).userId}, BFL_KEY_SET=${!!process.env.BFL_API_KEY}`
      );
      if (imageToolEnabled) {
        sse.send('image_start', { message: PROGRESS_MESSAGES.imageStart });
        const imageResult = await imageNode(classifiedState);
        log.info(
          `[ChatGraph] imageNode result — hasImage=${!!imageResult.generatedImage}, error=${imageResult.error || 'none'}, timeMs=${imageResult.imageTimeMs}`
        );
        finalState = { ...classifiedState, ...imageResult } as ChatGraphState;

        if (finalState.generatedImage) {
          generatedImage = finalState.generatedImage;
          sse.send('image_complete', {
            message: PROGRESS_MESSAGES.imageComplete,
            image: generatedImage,
          });
        } else if (finalState.error) {
          sse.send('image_complete', {
            message: PROGRESS_MESSAGES.imageError(finalState.error),
            error: finalState.error,
          });
        }
      }
    } else if (classifiedState.intent === 'image_edit') {
      const imageEditToolEnabled = forcedTool || enabledTools?.['image_edit'] !== false;
      if (imageEditToolEnabled) {
        if (!imageAttachments || imageAttachments.length === 0) {
          sse.send('image_complete', {
            message: PROGRESS_MESSAGES.imageEditNoAttachment,
            error: PROGRESS_MESSAGES.imageEditNoAttachment,
          });
        } else {
          sse.send('image_start', { message: PROGRESS_MESSAGES.imageEditStart });
          const imageEditResult = await imageEditNode(classifiedState);
          finalState = { ...classifiedState, ...imageEditResult } as ChatGraphState;

          if (finalState.generatedImage) {
            generatedImage = finalState.generatedImage;
            sse.send('image_complete', {
              message: PROGRESS_MESSAGES.imageEditComplete,
              image: generatedImage,
            });
          } else if (finalState.error) {
            sse.send('image_complete', {
              message: PROGRESS_MESSAGES.imageError(finalState.error),
              error: finalState.error,
            });
          }
        }
      }
    } else if (classifiedState.intent === 'summary') {
      const docCount =
        (classifiedState.documentChatIds?.length || 0) + (classifiedState.documentIds?.length || 0);
      sse.send('summary_start', {
        message: PROGRESS_MESSAGES.summaryStart,
        documentCount: docCount,
      });
      const summaryResult = await summarizeNode(classifiedState);
      finalState = { ...classifiedState, ...summaryResult } as ChatGraphState;
      const summaryLength = finalState.summaryContext?.length || 0;
      sse.send('summary_complete', {
        message: PROGRESS_MESSAGES.summaryComplete(summaryLength, finalState.summaryTimeMs || 0),
        summaryLength,
        timeMs: finalState.summaryTimeMs || 0,
      });
    } else if (classifiedState.intent !== 'direct') {
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
    const actionIntent = finalState.intent;
    if (
      actualThreadId &&
      (actionIntent === 'save_as_doc' ||
        actionIntent === 'modify_doc' ||
        actionIntent === 'modify_board')
    ) {
      const actionId = `action_${Date.now()}`;
      let pendingAction: PendingAction | null = null;

      if (actionIntent === 'save_as_doc') {
        pendingAction = {
          actionId,
          type: 'save_as_doc',
          threadId: actualThreadId,
          userId,
          title: 'Antwort als Dokument speichern',
          preview: fullText.slice(0, 200),
          payload: {
            content: fullText,
            title: classifiedState.searchQuery || 'Neues Dokument',
            subtype: 'docs',
          },
          createdAt: Date.now(),
        };
        sse.send('confirm_action', {
          actionId,
          type: 'save_as_doc',
          title: 'Dokument erstellen',
          description: 'Die Antwort wird als neues Dokument gespeichert.',
          icon: 'file-text',
          metadata: [
            { key: 'Titel', value: classifiedState.searchQuery || 'Neues Dokument' },
            { key: 'Länge', value: `${fullText.length} Zeichen` },
          ],
          confirmLabel: 'Dokument erstellen',
          cancelLabel: 'Abbrechen',
          threadId: actualThreadId,
        });
      } else if (actionIntent === 'modify_doc' && rawDocMentionIds?.length) {
        const docId = rawDocMentionIds[0];
        pendingAction = {
          actionId,
          type: 'modify_doc',
          threadId: actualThreadId,
          userId,
          title: 'Dokument aktualisieren',
          preview: fullText.slice(0, 200),
          payload: { docId, newContent: fullText },
          createdAt: Date.now(),
        };
        sse.send('confirm_action', {
          actionId,
          type: 'modify_doc',
          title: 'Dokument bearbeiten',
          description: 'Das erwähnte Dokument wird mit dem neuen Inhalt aktualisiert.',
          icon: 'pencil',
          metadata: [{ key: 'Dokument', value: docId }],
          confirmLabel: 'Aktualisieren',
          cancelLabel: 'Abbrechen',
          threadId: actualThreadId,
        });
      } else if (actionIntent === 'modify_board' && rawBoardIds?.length) {
        const boardId = rawBoardIds[0];
        pendingAction = {
          actionId,
          type: 'modify_board',
          threadId: actualThreadId,
          userId,
          title: 'Board aktualisieren',
          preview: fullText.slice(0, 200),
          payload: { boardId, rows: [], responseText: fullText },
          createdAt: Date.now(),
        };
        sse.send('confirm_action', {
          actionId,
          type: 'modify_board',
          title: 'Board bearbeiten',
          description: 'Die Aufgaben werden zum Board hinzugefügt.',
          icon: 'kanban',
          metadata: [{ key: 'Board', value: boardId }],
          confirmLabel: 'Hinzufügen',
          cancelLabel: 'Abbrechen',
          threadId: actualThreadId,
        });
      }

      if (pendingAction) {
        await pendingActionStore.store(pendingAction);
        log.info(`[ChatGraph] Confirm action stored: ${actionId} (${actionIntent})`);
      }
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

    const validMessages = requestContext.validMessages as any[];
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
