/**
 * Notebook Streaming Controller
 * Authenticated endpoint for notebook Q&A streaming.
 * Creates persistent threads and saves messages to chat_threads/chat_messages.
 * Delegates to the shared notebookStreamCore for SSE streaming logic.
 */

import { z } from 'zod';

import { validateBody, type TypedRequest } from '../../middleware/validateBody.js';
import { createAuthenticatedRouter } from '../../utils/keycloak/index.js';
import { createLogger } from '../../utils/logger.js';

import { handleNotebookStream } from './notebookStreamCore.js';
import { createSSEStream } from './services/sseHelpers.js';
import {
  getUser,
  createThread,
  createMessage,
  touchThread,
} from './services/threadPersistenceService.js';

import type { ModelMessage } from 'ai';

/** Zod schema for the POST body for notebook streaming */
const notebookStreamRequestSchema = z.object({
  messages: z.array(z.unknown()).optional(),
  collectionId: z.string().optional(),
  collectionIds: z.array(z.string()).optional(),
  filters: z.record(z.unknown()).optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
  mode: z.enum(['fast', 'deep']).optional(),
  documentIds: z.array(z.string()).optional(),
  threadId: z.string().nullable().optional(),
});
type NotebookStreamRequestBody = z.infer<typeof notebookStreamRequestSchema>;

const router = createAuthenticatedRouter();
const log = createLogger('notebookStream');

/**
 * POST /api/chat-service/notebook/stream
 * Stream answers to notebook questions with sources/citations.
 * Automatically creates threads and persists messages.
 */
router.post(
  '/',
  validateBody(notebookStreamRequestSchema),
  async (req: TypedRequest<NotebookStreamRequestBody>, res) => {
    const user = getUser(req);
    if (!user?.id) {
      const sse = createSSEStream(res);
      sse.send('error', { error: 'Unauthorized' });
      sse.end();
      return;
    }

    const {
      messages: rawMessages,
      collectionId,
      collectionIds,
      filters,
      provider,
      model,
      mode,
      documentIds,
      threadId: existingThreadId,
    } = req.body;
    const messages = rawMessages as ModelMessage[] | undefined;

    const lastUserMessage = Array.isArray(messages)
      ? messages.filter((m: { role: string }) => m.role === 'user').pop()
      : null;
    const userText = typeof lastUserMessage?.content === 'string' ? lastUserMessage.content : '';

    let threadId: string | null = existingThreadId ?? null;
    const sse = createSSEStream(res);

    // Create thread on first message
    if (!threadId && userText) {
      try {
        const primaryCollectionId =
          collectionId || (Array.isArray(collectionIds) ? collectionIds[0] : null);
        const thread = await createThread(
          user.id,
          'notebook-qa',
          userText.slice(0, 80) || 'Notebook-Recherche',
          'notebook',
          {
            notebookCollectionId: primaryCollectionId || '',
            notebookCollectionIds: Array.isArray(collectionIds)
              ? collectionIds
              : collectionId
                ? [collectionId]
                : [],
          }
        );
        threadId = thread.id;
        sse.send('thread_created', { threadId });
      } catch (err) {
        log.error('Failed to create notebook thread:', err);
      }
    }

    // Persist user message in parallel with streaming (fire-and-forget)
    const userMessagePromise =
      threadId && userText
        ? createMessage(threadId, 'user', userText, undefined, user.id).catch((err) =>
            log.error('Failed to persist user message:', err)
          )
        : null;

    const result = await handleNotebookStream({
      req,
      res,
      messages: messages ?? [],
      ...(collectionId != null && { collectionId }),
      ...(collectionIds != null && { collectionIds }),
      ...(filters != null && { filters }),
      ...(provider != null && { provider }),
      ...(model != null && { model }),
      ...(mode != null && { mode }),
      ...(documentIds != null && { documentIds }),
      userId: user.id,
      allowUserCollections: true,
      sse,
    });

    // Persist assistant message and update thread timestamp in parallel
    if (threadId && result) {
      // Ensure user message is persisted before assistant message for ordering
      if (userMessagePromise) await userMessagePromise;
      try {
        await Promise.all([
          createMessage(
            threadId,
            'assistant',
            result.answer,
            {
              type: 'notebook',
              citations: result.citations,
              sources: result.sources,
            },
            user.id
          ),
          touchThread(threadId),
        ]);
      } catch (err) {
        log.error('Failed to persist assistant message:', err);
      }
    }
  }
);

export default router;
