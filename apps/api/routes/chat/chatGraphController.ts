/**
 * ChatGraph Controller
 *
 * Route handler for the LangGraph-based agentic chat system.
 * Uses AI SDK v6 for streaming with proper @assistant-ui/react-ai-sdk compatibility.
 *
 * Flow:
 * 1. Run ChatGraph (classify intent → search if needed)
 * 2. Stream response using AI SDK v6's streamText + toUIMessageStreamResponse
 * 3. Persist messages after streaming completes
 */

import express from 'express';
import { streamText, convertToModelMessages } from 'ai';
import type { UIMessage, ModelMessage } from 'ai';
import { createAuthenticatedRouter } from '../../utils/keycloak/index.js';
import { chatGraph, initializeChatState, buildSystemMessage } from '../../agents/langgraph/ChatGraph/index.js';
import { getModel } from './agents/providers.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { createLogger } from '../../utils/logger.js';
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
  const result = await postgres.query(
    `INSERT INTO chat_threads (user_id, agent_id, title)
     VALUES ($1, $2, $3)
     RETURNING id, user_id, agent_id, title`,
    [userId, agentId, title || null]
  ) as { id: string; user_id: string; agent_id: string; title: string | null }[];
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
 * Process a chat message using the LangGraph ChatGraph.
 * Uses AI SDK v6 for proper streaming compatible with @ai-sdk/react's useChat.
 */
router.post('/stream', async (req, res) => {
  try {
    const { messages: clientMessages, agentId, threadId, enabledTools } = req.body as {
      messages: UIMessage[];
      agentId?: string;
      threadId?: string;
      enabledTools?: Record<string, boolean>;
    };

    const user = getUser(req);
    if (!user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = user.id;
    const aiWorkerPool = req.app.locals.aiWorkerPool;

    if (!aiWorkerPool) {
      log.error('[ChatGraph] AI Worker Pool not available');
      return res.status(500).json({ error: 'AI service unavailable' });
    }

    if (!clientMessages || !Array.isArray(clientMessages) || clientMessages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    log.info(`[ChatGraph] Processing request for user ${userId}, agent ${agentId || 'default'}`);

    // Convert client messages to ModelMessage format for AI SDK v6 (async in v6)
    const modelMessages = await convertToModelMessages(clientMessages);

    // Filter out any assistant messages with empty content (can cause API errors)
    const validMessages = modelMessages.filter((msg) => {
      if (msg.role === 'assistant') {
        // Check if assistant message has content
        if (Array.isArray(msg.content)) {
          return msg.content.length > 0;
        }
        return msg.content && String(msg.content).length > 0;
      }
      return true;
    });

    log.info(`[ChatGraph] Converted ${clientMessages.length} messages to ${validMessages.length} valid model messages`);

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
    }

    // Save user message
    if (actualThreadId && lastUserMessage) {
      const content =
        typeof lastUserMessage.content === 'string'
          ? lastUserMessage.content
          : JSON.stringify(lastUserMessage.content);
      await createMessage(actualThreadId, 'user', content);
    }

    // Initialize and run the graph (classification + search)
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

    // Run the graph to get classification and search results
    const graphResult = await chatGraph.invoke(initialState);

    log.info(
      `[ChatGraph] Graph complete: intent=${graphResult.intent}, searches=${graphResult.searchCount}`
    );

    // Build the system message with search context
    const systemMessage = buildSystemMessage(graphResult);

    // Get AI model from provider
    const aiModel = getModel(graphResult.agentConfig.provider, graphResult.agentConfig.model);

    // Stream response using AI SDK v6
    const result = await streamText({
      model: aiModel,
      messages: [
        { role: 'system', content: systemMessage },
        ...validMessages,
      ],
      maxOutputTokens: graphResult.agentConfig.params.max_tokens,
      temperature: graphResult.agentConfig.params.temperature,
      onFinish: async ({ text }) => {
        // Persist assistant message after streaming completes
        if (actualThreadId && text) {
          try {
            await createMessage(actualThreadId, 'assistant', text, {
              intent: graphResult.intent,
              searchCount: graphResult.searchCount,
              citations: graphResult.citations,
            });

            await touchThread(actualThreadId);

            // Update title for new threads based on response
            if (isNewThread && text.length > 10) {
              const firstSentence = text.split(/[.!?]/)[0];
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
      },
    });

    // Debug: Log what format we're sending
    log.info('[ChatGraph] Sending data stream response');

    // Get the text stream response for useChat with streamProtocol: 'text' (AI SDK v6)
    const dataResponse = result.toTextStreamResponse({
      headers: isNewThread && actualThreadId ? { 'X-Thread-Id': actualThreadId } : undefined,
    });

    // Log headers
    const headerObj: Record<string, string> = {};
    dataResponse.headers.forEach((v: string, k: string) => { headerObj[k] = v; });
    log.info('[ChatGraph] Response headers:', headerObj);

    // Pipe to Express
    res.status(dataResponse.status);
    dataResponse.headers.forEach((value: string, key: string) => {
      res.setHeader(key, value);
    });

    if (dataResponse.body) {
      const reader = dataResponse.body.getReader();
      let firstChunkLogged = false;
      const pump = async (): Promise<void> => {
        const { done, value } = await reader.read();
        if (done) {
          res.end();
          return;
        }
        // Log first chunk to see format
        if (!firstChunkLogged) {
          const text = new TextDecoder().decode(value);
          log.info('[ChatGraph] First chunk format:', text.slice(0, 300));
          firstChunkLogged = true;
        }
        res.write(value);
        return pump();
      };
      await pump();
    } else {
      res.end();
    }
  } catch (error: any) {
    log.error('[ChatGraph] Controller error:', error);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
});

export default router;
