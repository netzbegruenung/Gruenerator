/**
 * Notebook Streaming Controller
 * Authenticated endpoint for notebook Q&A streaming.
 * Creates persistent threads and saves messages to chat_threads/chat_messages.
 * Delegates to the shared notebookStreamCore for SSE streaming logic.
 */

import { createAuthenticatedRouter } from '../../utils/keycloak/index.js';
import { createLogger } from '../../utils/logger.js';

import { handleNotebookStream, sendSSE } from './notebookStreamCore.js';
import { SSEWriter } from './services/sseHelpers.js';
import { createThread, createMessage, touchThread } from './services/threadPersistenceService.js';

import type { UserProfile } from '../../services/user/types.js';
import type express from 'express';

const router = createAuthenticatedRouter();
const log = createLogger('notebookStream');

const getUser = (req: express.Request): UserProfile | undefined =>
  (req as any).user as UserProfile | undefined;

/**
 * POST /api/chat-service/notebook/stream
 * Stream answers to notebook questions with sources/citations.
 * Automatically creates threads and persists messages.
 */
router.post('/', async (req, res) => {
  const user = getUser(req);
  if (!user?.id) {
    SSEWriter.initHeaders(res);
    sendSSE(res, 'error', { error: 'Unauthorized' });
    res.end();
    return;
  }

  const {
    messages,
    collectionId,
    collectionIds,
    filters,
    provider,
    model,
    mode,
    documentIds,
    threadId: existingThreadId,
  } = req.body;

  const lastUserMessage = Array.isArray(messages)
    ? messages.filter((m: { role: string }) => m.role === 'user').pop()
    : null;
  const userText = typeof lastUserMessage?.content === 'string' ? lastUserMessage.content : '';

  let threadId = existingThreadId as string | null;

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

      SSEWriter.initHeaders(res);
      sendSSE(res, 'thread_created', { threadId });
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
    messages,
    collectionId,
    collectionIds,
    filters,
    provider,
    model,
    mode,
    documentIds,
    userId: user.id,
    allowUserCollections: true,
  });

  // Persist assistant message and update thread timestamp in parallel
  if (threadId && result) {
    // Ensure user message is persisted before assistant message for ordering
    await userMessagePromise;
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
});

export default router;
