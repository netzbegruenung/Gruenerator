/**
 * ChatGraph Controller
 *
 * Route handler for the LangGraph-based agentic chat system.
 * Uses SSE (Server-Sent Events) for streaming with progress indicators.
 *
 * SSE Event Flow:
 * 1. thread_created - New thread ID (if created)
 * 2. intent - Classification result with German status message
 * 3. search_start - Search beginning (if applicable)
 * 4. search_complete - Search done with result count
 * 5. response_start - Generation beginning
 * 6. text_delta - Streaming text chunks (multiple)
 * 7. done - Final metadata with citations and timing
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
} from '../../agents/langgraph/ChatGraph/index.js';
import type { ChatGraphState } from '../../agents/langgraph/ChatGraph/types.js';
import { getModel } from './agents/providers.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { createLogger } from '../../utils/logger.js';
import {
  createSSEStream,
  getIntentMessage,
  PROGRESS_MESSAGES,
} from './services/sseHelpers.js';
import type { UserProfile } from '../../services/user/types.js';

const log = createLogger('ChatGraphController');
const router = createAuthenticatedRouter();

/**
 * Get user from request.
 */
const getUser = (req: express.Request): UserProfile | undefined =>
  (req as any).user as UserProfile | undefined;

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

  try {
    const { messages: clientMessages, agentId, threadId, enabledTools } = req.body as {
      messages: UIMessage[];
      agentId?: string;
      threadId?: string;
      enabledTools?: Record<string, boolean>;
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
      log.info('[ChatGraph] First message structure:', JSON.stringify({
        id: clientMessages[0].id,
        role: clientMessages[0].role,
        hasContent: !!clientMessages[0].content,
        contentType: typeof clientMessages[0].content,
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
      const thread = await createThread(
        userId,
        agentId || 'gruenerator-universal',
        typeof lastUserMessage.content === 'string'
          ? lastUserMessage.content.slice(0, 50) +
              (lastUserMessage.content.length > 50 ? '...' : '')
          : 'Neue Unterhaltung'
      );
      actualThreadId = thread.id;
      isNewThread = true;
      log.info(`[ChatGraph] Created new thread: ${actualThreadId}`);

      // Notify client of new thread
      sse.send('thread_created', { threadId: actualThreadId });
    }

    // Save user message
    if (actualThreadId && lastUserMessage) {
      const content =
        typeof lastUserMessage.content === 'string'
          ? lastUserMessage.content
          : JSON.stringify(lastUserMessage.content);
      await createMessage(actualThreadId, 'user', content);
    }

    // Initialize state for graph nodes
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
      },
      aiWorkerPool,
    });

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

    // === Stage 2: Search (if needed) ===
    let finalState = classifiedState;

    if (classifiedState.intent !== 'direct') {
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
        });

        log.info(`[ChatGraph] Search complete: ${resultCount} results`);
      } else {
        log.info(`[ChatGraph] Tool "${classifiedState.intent}" is disabled, skipping search`);
      }
    }

    // === Stage 3: Response generation ===
    sse.send('response_start', { message: PROGRESS_MESSAGES.responseStart });

    const systemMessage = buildSystemMessage(finalState);
    const aiModel = getModel(finalState.agentConfig.provider, finalState.agentConfig.model);

    log.info('[ChatGraph] Starting text stream...');

    const result = streamText({
      model: aiModel,
      messages: [{ role: 'system', content: systemMessage }, ...validMessages],
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
    if (actualThreadId && fullText) {
      try {
        await createMessage(actualThreadId, 'assistant', fullText, {
          intent: finalState.intent,
          searchCount: finalState.searchCount,
          citations: finalState.citations,
        });

        await touchThread(actualThreadId);

        // Update title for new threads
        if (isNewThread && fullText.length > 10) {
          const firstSentence = fullText.split(/[.!?]/)[0];
          const title =
            firstSentence.length > 50 ? firstSentence.slice(0, 50) + '...' : firstSentence;
          if (title && title.length > 5) {
            await updateThreadTitle(actualThreadId, title);
          }
        }

        log.info(`[ChatGraph] Message persisted for thread ${actualThreadId}`);
      } catch (error) {
        log.error('[ChatGraph] Error persisting message:', error);
      }
    }

    // === Stage 4: Completion ===
    const totalTimeMs = Date.now() - finalState.startTime;
    sse.send('done', {
      threadId: actualThreadId,
      citations: finalState.citations,
      metadata: {
        intent: finalState.intent,
        searchCount: finalState.searchCount || 0,
        totalTimeMs,
        classificationTimeMs: finalState.classificationTimeMs,
        searchTimeMs: finalState.searchTimeMs || 0,
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
