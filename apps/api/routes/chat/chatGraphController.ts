/**
 * ChatGraph Controller
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

import express from 'express';
import { streamText, convertToModelMessages } from 'ai';
import type { UIMessage } from 'ai';
import { createAuthenticatedRouter } from '../../utils/keycloak/index.js';
import {
  initializeChatState,
  buildSystemMessage,
  classifierNode,
  searchNode,
  imageNode,
} from '../../agents/langgraph/ChatGraph/index.js';
import type {
  ChatGraphState,
  GeneratedImageResult,
  ProcessedAttachment,
  ImageAttachment,
} from '../../agents/langgraph/ChatGraph/types.js';
import { getModel, getModelConfig } from './agents/providers.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { createLogger } from '../../utils/logger.js';
import {
  createSSEStream,
  getIntentMessage,
  PROGRESS_MESSAGES,
} from './services/sseHelpers.js';
import type { UserProfile } from '../../services/user/types.js';
import { OCRService } from '../../services/OcrService/index.js';
import {
  saveThreadAttachment,
  getThreadAttachments,
} from './services/attachmentPersistenceService.js';
import {
  trimMessagesToTokenLimit,
  getTokenStats,
} from '../../services/counters/TokenCounter.js';
import type { Message as TokenCounterMessage } from '../../services/counters/types.js';
import {
  getCompactionState,
  prepareMessagesWithCompaction,
  needsCompaction,
  generateCompactionSummary,
  getMessageCount,
  getThreadMessages,
} from './services/compactionService.js';
import { getMem0Instance } from '../../services/mem0/index.js';

const log = createLogger('ChatGraphController');
const router = createAuthenticatedRouter();

/**
 * Extract text content from a ModelMessage content field.
 * Handles both string content and AI SDK v6 parts array format.
 */
function extractTextContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    // AI SDK v6 format: [{type: 'text', text: '...'}, ...]
    return content
      .filter((part): part is { type: string; text: string } =>
        part && typeof part === 'object' && part.type === 'text' && typeof part.text === 'string'
      )
      .map((part) => part.text)
      .join('');
  }

  return '';
}

/**
 * Get user from request.
 */
const getUser = (req: express.Request): UserProfile | undefined =>
  (req as any).user as UserProfile | undefined;

/**
 * Context window configuration.
 * These values are tuned for typical Mistral/Claude context windows.
 */
const CONTEXT_CONFIG = {
  MAX_CONTEXT_TOKENS: 6000, // Token budget for conversation history
  RESPONSE_RESERVE: 1500,   // Reserved tokens for model response
};

/**
 * Convert an AI SDK ModelMessage to TokenCounter-compatible format.
 * Handles both string content and AI SDK v6 parts array format.
 */
function toTokenCounterMessage(msg: any): TokenCounterMessage {
  let content: string;

  if (typeof msg.content === 'string') {
    content = msg.content;
  } else if (Array.isArray(msg.content)) {
    // AI SDK v6 format: [{type: 'text', text: '...'}, ...]
    content = msg.content
      .filter((part: any) => part && typeof part === 'object' && part.type === 'text')
      .map((part: any) => part.text || '')
      .join('');
  } else {
    content = '';
  }

  return {
    role: msg.role,
    content,
  };
}

/**
 * OCR Service instance for document text extraction.
 */
const ocrService = new OCRService();

/**
 * Image MIME types for vision model processing.
 */
const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * Metadata for a processed attachment (used for persistence).
 */
interface ProcessedAttachmentMeta {
  name: string;
  mimeType: string;
  sizeBytes: number;
  isImage: boolean;
  extractedText: string | null;
}

/**
 * Process attachments: separate images from documents, extract text from documents.
 */
async function processAttachments(
  attachments: ProcessedAttachment[] | undefined,
  requestId: string
): Promise<{
  attachmentContext: string;
  imageAttachments: ImageAttachment[];
  processedMeta: ProcessedAttachmentMeta[];
}> {
  if (!attachments || attachments.length === 0) {
    return { attachmentContext: '', imageAttachments: [], processedMeta: [] };
  }

  const imageAttachments: ImageAttachment[] = [];
  const documentTexts: string[] = [];
  const processedMeta: ProcessedAttachmentMeta[] = [];

  for (const attachment of attachments) {
    if (IMAGE_MIME_TYPES.has(attachment.type)) {
      imageAttachments.push({
        name: attachment.name,
        type: attachment.type,
        data: attachment.data,
      });
      processedMeta.push({
        name: attachment.name,
        mimeType: attachment.type,
        sizeBytes: attachment.size,
        isImage: true,
        extractedText: null,
      });
      log.info(`[${requestId}] Added image attachment: ${attachment.name}`);
    } else {
      try {
        const result = await ocrService.extractTextFromBase64PDF(
          attachment.data,
          attachment.name
        );

        if (result.text && result.text.length > 0) {
          documentTexts.push(`### ${attachment.name}\n\n${result.text}`);
          processedMeta.push({
            name: attachment.name,
            mimeType: attachment.type,
            sizeBytes: attachment.size,
            isImage: false,
            extractedText: result.text,
          });
          log.info(`[${requestId}] Extracted ${result.text.length} chars from: ${attachment.name}`);
        }
      } catch (error) {
        log.error(`[${requestId}] Failed to extract text from ${attachment.name}:`, error);
        documentTexts.push(`### ${attachment.name}\n\n[Fehler beim Extrahieren des Textes]`);
        processedMeta.push({
          name: attachment.name,
          mimeType: attachment.type,
          sizeBytes: attachment.size,
          isImage: false,
          extractedText: null,
        });
      }
    }
  }

  return {
    attachmentContext: documentTexts.join('\n\n---\n\n'),
    imageAttachments,
    processedMeta,
  };
}

/**
 * Create a new chat thread.
 */
async function createThread(
  userId: string,
  agentId: string,
  title?: string
): Promise<{ id: string; user_id: string; agent_id: string; title: string | null }> {
  const postgres = getPostgresInstance();
  const result = (await postgres.query(
    `INSERT INTO chat_threads (user_id, agent_id, title)
     VALUES ($1, $2, $3)
     RETURNING id, user_id, agent_id, title`,
    [userId, agentId, title || null]
  )) as { id: string; user_id: string; agent_id: string; title: string | null }[];
  return result[0];
}

/**
 * Save a message to the thread.
 */
async function createMessage(
  threadId: string,
  role: string,
  content: string | null,
  metadata?: Record<string, unknown>
): Promise<void> {
  const postgres = getPostgresInstance();
  await postgres.query(
    `INSERT INTO chat_messages (thread_id, role, content, tool_results)
     VALUES ($1, $2, $3, $4)`,
    [threadId, role, content, metadata ? JSON.stringify(metadata) : null]
  );
}

/**
 * Update thread timestamp.
 */
async function touchThread(threadId: string): Promise<void> {
  const postgres = getPostgresInstance();
  await postgres.query(
    `UPDATE chat_threads SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [threadId]
  );
}

/**
 * Update thread title.
 */
async function updateThreadTitle(threadId: string, title: string): Promise<void> {
  const postgres = getPostgresInstance();
  await postgres.query(
    `UPDATE chat_threads SET title = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
    [title, threadId]
  );
}

/**
 * POST /api/chat-graph/stream
 *
 * Process a chat message using the LangGraph ChatGraph with SSE progress events.
 * Provides real-time feedback for each processing stage.
 */
router.post('/stream', async (req, res) => {
  const sse = createSSEStream(res);
  const requestId = `req_${Date.now()}`;

  try {
    const { messages: clientMessages, agentId, threadId, enabledTools, modelId, attachments } = req.body as {
      messages: UIMessage[];
      agentId?: string;
      threadId?: string;
      enabledTools?: Record<string, boolean>;
      modelId?: string;
      attachments?: ProcessedAttachment[];
    };

    const user = getUser(req);
    if (!user?.id) {
      sse.send('error', { error: PROGRESS_MESSAGES.unauthorized });
      sse.end();
      return;
    }

    const userId = user.id;
    const aiWorkerPool = req.app.locals.aiWorkerPool;

    if (!aiWorkerPool) {
      log.error('[ChatGraph] AI Worker Pool not available');
      sse.send('error', { error: PROGRESS_MESSAGES.aiUnavailable });
      sse.end();
      return;
    }

    if (!clientMessages || !Array.isArray(clientMessages) || clientMessages.length === 0) {
      sse.send('error', { error: PROGRESS_MESSAGES.messagesRequired });
      sse.end();
      return;
    }

    log.info(`[ChatGraph] Processing request for user ${userId}, agent ${agentId || 'default'}`);
    log.info(`[ChatGraph] Received ${clientMessages?.length || 0} messages`);

    // Debug: log message structure
    if (clientMessages?.length > 0) {
      const firstMsg = clientMessages[0] as any;
      log.info('[ChatGraph] First message structure:', JSON.stringify({
        id: firstMsg.id,
        role: firstMsg.role,
        hasContent: !!firstMsg.content,
        hasParts: !!firstMsg.parts,
        partsLength: firstMsg.parts?.length,
      }));
    }

    // Convert client messages to ModelMessage format for AI SDK v6
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
      log.error('[ChatGraph] convertToModelMessages returned invalid result:', modelMessages);
      sse.send('error', { error: 'Failed to process messages' });
      sse.end();
      return;
    }

    // Filter out any assistant messages with empty content
    const validMessages = modelMessages.filter((msg) => {
      if (msg.role === 'assistant') {
        if (Array.isArray(msg.content)) {
          return msg.content.length > 0;
        }
        return msg.content && String(msg.content).length > 0;
      }
      return true;
    });

    log.info(
      `[ChatGraph] Converted ${clientMessages.length} messages to ${validMessages.length} valid model messages`
    );

    // Get last user message for thread creation
    const lastUserMessage = validMessages.filter((m) => m.role === 'user').pop();

    // Create thread if needed
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
      log.info(`[ChatGraph] Created new thread: ${actualThreadId}`);

      // Notify client of new thread
      sse.send('thread_created', { threadId: actualThreadId });
    }

    // Save user message
    if (actualThreadId && lastUserMessage) {
      const userText = extractTextContent(lastUserMessage.content);
      await createMessage(actualThreadId, 'user', userText);
    }

    // Process attachments (extract text from documents, separate images)
    let attachmentContext = '';
    let imageAttachments: ImageAttachment[] = [];
    let processedMeta: ProcessedAttachmentMeta[] = [];

    if (attachments && attachments.length > 0) {
      log.info(`[${requestId}] Processing ${attachments.length} attachments...`);
      const processed = await processAttachments(attachments, requestId);
      attachmentContext = processed.attachmentContext;
      imageAttachments = processed.imageAttachments;
      processedMeta = processed.processedMeta;
      log.info(`[${requestId}] Processed: ${imageAttachments.length} images, ${attachmentContext.length} chars of document text`);
    }

    // Load previous thread attachments for context
    const previousAttachments = actualThreadId
      ? await getThreadAttachments(actualThreadId, 5)
      : [];

    if (previousAttachments.length > 0) {
      log.info(`[${requestId}] Loaded ${previousAttachments.length} previous attachments for thread context`);
    }

    // === Memory Retrieval (mem0) ===
    // Retrieve relevant memories from cross-thread storage before graph execution
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

    // Initialize state for graph nodes
    // Pass userId through agentConfig for rate limiting in imageNode
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
      },
      aiWorkerPool,
      attachmentContext: attachmentContext || undefined,
      imageAttachments: imageAttachments.length > 0 ? imageAttachments : undefined,
      threadAttachments: previousAttachments.length > 0 ? previousAttachments : undefined,
    });

    // Inject userId into agentConfig for imageNode rate limiting
    (initialState.agentConfig as any).userId = userId;

    // Inject memory context from mem0 retrieval
    if (memoryContext) {
      initialState.memoryContext = memoryContext;
      initialState.memoryRetrieveTimeMs = memoryRetrieveTimeMs;
    }

    // === Stage 1: Classification ===
    log.info('[ChatGraph] Running classifier...');
    const classifiedState = {
      ...initialState,
      ...(await classifierNode(initialState)),
    } as ChatGraphState;

    // Send intent event with German message
    sse.send('intent', {
      intent: classifiedState.intent,
      message: getIntentMessage(classifiedState.intent),
      reasoning: classifiedState.reasoning,
    });

    log.info(`[ChatGraph] Classified as "${classifiedState.intent}": ${classifiedState.reasoning}`);

    // === Stage 2: Search or Image Generation (if needed) ===
    let finalState = classifiedState;
    let generatedImage: GeneratedImageResult | null = null;

    if (classifiedState.intent === 'image') {
      // Handle image generation intent
      const imageToolEnabled = enabledTools?.['image'] !== false;

      if (imageToolEnabled) {
        sse.send('image_start', { message: PROGRESS_MESSAGES.imageStart });

        log.info('[ChatGraph] Running image generation...');
        const imageResult = await imageNode(classifiedState);
        finalState = {
          ...classifiedState,
          ...imageResult,
        } as ChatGraphState;

        if (finalState.generatedImage) {
          generatedImage = finalState.generatedImage;
          sse.send('image_complete', {
            message: PROGRESS_MESSAGES.imageComplete,
            image: generatedImage,
          });
          log.info(`[ChatGraph] Image generated: ${generatedImage.filename}`);
        } else if (finalState.error) {
          sse.send('image_complete', {
            message: PROGRESS_MESSAGES.imageError(finalState.error),
            error: finalState.error,
          });
          log.warn(`[ChatGraph] Image generation failed: ${finalState.error}`);
        }
      } else {
        log.info('[ChatGraph] Image tool is disabled, skipping image generation');
      }
    } else if (classifiedState.intent !== 'direct') {
      // Handle search intents
      const toolEnabled = enabledTools?.[classifiedState.intent] !== false;

      if (toolEnabled) {
        sse.send('search_start', { message: PROGRESS_MESSAGES.searchStart });

        log.info('[ChatGraph] Running search...');
        const searchResult = await searchNode(classifiedState);
        finalState = {
          ...classifiedState,
          ...searchResult,
        } as ChatGraphState;

        const resultCount = finalState.searchResults?.length || 0;
        sse.send('search_complete', {
          message: PROGRESS_MESSAGES.searchComplete(resultCount),
          resultCount,
          results: finalState.searchResults?.slice(0, 10) || [],
        });

        log.info(`[ChatGraph] Search complete: ${resultCount} results`);
      } else {
        log.info(`[ChatGraph] Tool "${classifiedState.intent}" is disabled, skipping search`);
      }
    }

    // === Stage 3: Response generation ===
    sse.send('response_start', { message: PROGRESS_MESSAGES.responseStart });

    const systemMessage = buildSystemMessage(finalState);

    // Determine which model to use: user selection overrides agent default
    let modelProvider = finalState.agentConfig.provider;
    let modelName = finalState.agentConfig.model;

    if (modelId) {
      const userModelConfig = getModelConfig(modelId);
      if (userModelConfig) {
        modelProvider = userModelConfig.provider;
        modelName = userModelConfig.model;
        log.info(`[ChatGraph] Using user-selected model: ${modelId} → ${modelProvider}/${modelName}`);
      } else {
        log.warn(`[ChatGraph] Unknown model ID "${modelId}", using agent default`);
      }
    }

    const aiModel = getModel(modelProvider, modelName);

    log.info('[ChatGraph] Starting text stream...');

    // === Context Pruning: Prevent token explosion for long conversations ===
    // Convert to TokenCounter format for analysis
    const messagesForTokenCount = validMessages.map(toTokenCounterMessage);
    const preStats = getTokenStats(messagesForTokenCount);

    // Apply token limit pruning
    const prunedMessages = trimMessagesToTokenLimit(
      messagesForTokenCount,
      CONTEXT_CONFIG.MAX_CONTEXT_TOKENS
    );

    // Map back to original format (preserve original message structure)
    // We keep the same number of recent messages as the pruning result
    const keepCount = prunedMessages.filter(m => m.role !== 'system').length;
    const conversationMessages = validMessages.filter((m: any) => m.role !== 'system');
    const prunedValidMessages = conversationMessages.slice(-keepCount);

    if (prunedValidMessages.length < conversationMessages.length) {
      log.info(`[Context] Pruned ${conversationMessages.length} → ${prunedValidMessages.length} messages (${preStats.totalTokens} → ~${getTokenStats(prunedMessages).totalTokens} tokens)`);
    }

    // === Compaction: Apply summary for very long threads ===
    let finalSystemMessage = systemMessage;
    let contextMessages = prunedValidMessages;

    if (actualThreadId) {
      try {
        const messageCount = await getMessageCount(actualThreadId);
        const compactionState = await getCompactionState(actualThreadId);

        // If thread is long and no summary exists, trigger async compaction
        if (needsCompaction(messageCount, compactionState.summary)) {
          log.info(`[Context] Thread ${actualThreadId} has ${messageCount} messages, triggering background compaction`);
          const threadMessages = await getThreadMessages(actualThreadId);
          generateCompactionSummary(actualThreadId, threadMessages).catch(err =>
            log.error('[Compaction] Background compaction failed:', err)
          );
        }

        // Use compaction when preparing messages (if summary exists)
        if (compactionState.summary) {
          const compacted = prepareMessagesWithCompaction(
            prunedMessages,
            compactionState,
            systemMessage
          );
          finalSystemMessage = compacted.systemMessage;
          // Note: contextMessages stays as prunedValidMessages (original format)
          // The compaction summary is injected into the system message
          log.info(`[Context] Applied compaction summary (${compactionState.summary.length} chars) to system message`);
        }
      } catch (compactionError) {
        log.warn('[Context] Failed to apply compaction, using pruned messages:', compactionError);
      }
    }

    // Build messages array, potentially with image parts for vision models
    let messagesForAI: any[] = [{ role: 'system', content: finalSystemMessage }, ...contextMessages];

    // Add image attachments to the last user message if present
    if (imageAttachments.length > 0) {
      log.info(`[${requestId}] Adding ${imageAttachments.length} images to message for vision model`);

      // Find the last user message and add images to it
      let lastUserIdx = -1;
      for (let i = messagesForAI.length - 1; i >= 0; i--) {
        if ((messagesForAI[i] as any).role === 'user') {
          lastUserIdx = i;
          break;
        }
      }
      if (lastUserIdx >= 0) {
        const lastUserMsg = messagesForAI[lastUserIdx];
        const textContent = typeof lastUserMsg.content === 'string'
          ? lastUserMsg.content
          : Array.isArray(lastUserMsg.content)
            ? lastUserMsg.content.filter((p: any) => p.type === 'text').map((p: any) => p.text).join('')
            : '';

        // Create multimodal content with text and images
        const multimodalContent: any[] = [{ type: 'text', text: textContent }];

        for (const img of imageAttachments) {
          multimodalContent.push({
            type: 'image',
            image: `data:${img.type};base64,${img.data}`,
          });
        }

        messagesForAI[lastUserIdx] = {
          role: 'user',
          content: multimodalContent,
        };
      }
    }

    const result = streamText({
      model: aiModel,
      messages: messagesForAI,
      maxOutputTokens: finalState.agentConfig.params.max_tokens,
      temperature: finalState.agentConfig.params.temperature,
    });

    // Stream text chunks
    let fullText = '';

    try {
      for await (const chunk of result.textStream) {
        fullText += chunk;
        sse.send('text_delta', { text: chunk });
      }
    } catch (streamError: unknown) {
      const errorMessage = streamError instanceof Error ? streamError.message : 'Unknown error';
      log.error('[ChatGraph] Stream error:', errorMessage);
      sse.send('error', { error: PROGRESS_MESSAGES.streamInterrupted });
      sse.end();
      return;
    }

    // Persist assistant message
    if (actualThreadId && (fullText || generatedImage)) {
      try {
        await createMessage(actualThreadId, 'assistant', fullText || null, {
          intent: finalState.intent,
          searchCount: finalState.searchCount,
          citations: finalState.citations,
          searchResults: finalState.searchResults?.slice(0, 10) || [],
          generatedImage: generatedImage ? {
            url: generatedImage.url,
            filename: generatedImage.filename,
            prompt: generatedImage.prompt,
            style: generatedImage.style,
            generationTimeMs: generatedImage.generationTimeMs,
          } : undefined,
        });

        await touchThread(actualThreadId);

        // Update title for new threads
        if (isNewThread) {
          let title: string | null = null;
          if (fullText && fullText.length > 10) {
            const firstSentence = fullText.split(/[.!?]/)[0];
            title = firstSentence.length > 50 ? firstSentence.slice(0, 50) + '...' : firstSentence;
          } else if (generatedImage) {
            title = 'Generiertes Bild';
          }
          if (title && title.length > 3) {
            await updateThreadTitle(actualThreadId, title);
          }
        }

        log.info(`[ChatGraph] Message persisted for thread ${actualThreadId}`);

        // Save attachments for future context in this thread
        if (processedMeta.length > 0) {
          for (const meta of processedMeta) {
            try {
              await saveThreadAttachment({
                threadId: actualThreadId,
                messageId: null,
                userId,
                name: meta.name,
                mimeType: meta.mimeType,
                sizeBytes: meta.sizeBytes,
                isImage: meta.isImage,
                extractedText: meta.extractedText,
              });
            } catch (attachError) {
              log.error(`[ChatGraph] Failed to save attachment ${meta.name}:`, attachError);
            }
          }
          log.info(`[ChatGraph] Saved ${processedMeta.length} attachments for thread ${actualThreadId}`);
        }

        // === Memory Saving (mem0) ===
        // Async save conversation to user memory (non-blocking)
        if (mem0 && lastUserMessage && fullText) {
          const userText = extractTextContent(lastUserMessage.content);
          mem0.addMemories(
            [
              { role: 'user', content: userText },
              { role: 'assistant', content: fullText },
            ],
            userId,
            { threadId: actualThreadId }
          ).catch((memError) => {
            log.warn(`[${requestId}] Async memory save failed:`, memError);
          });
        }
      } catch (error) {
        log.error('[ChatGraph] Error persisting message:', error);
      }
    }

    // === Stage 4: Completion ===
    const totalTimeMs = Date.now() - finalState.startTime;
    sse.send('done', {
      threadId: actualThreadId,
      citations: finalState.citations,
      generatedImage: generatedImage,
      metadata: {
        intent: finalState.intent,
        searchCount: finalState.searchCount || 0,
        totalTimeMs,
        classificationTimeMs: finalState.classificationTimeMs,
        searchTimeMs: finalState.searchTimeMs || 0,
        imageTimeMs: finalState.imageTimeMs || undefined,
        memoryRetrieveTimeMs: memoryRetrieveTimeMs > 0 ? memoryRetrieveTimeMs : undefined,
      },
    });

    log.info(`[ChatGraph] Complete: ${fullText.length} chars in ${totalTimeMs}ms`);
    sse.end();
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error('[ChatGraph] Controller error:', errorMessage);
    if (!sse.isEnded()) {
      sse.send('error', { error: PROGRESS_MESSAGES.internalError });
      sse.end();
    }
  }
});

export default router;
