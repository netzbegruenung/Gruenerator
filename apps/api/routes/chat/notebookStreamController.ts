/**
 * Notebook Streaming Controller
 * Authenticated endpoint for notebook Q&A streaming.
 * Creates persistent threads and saves messages to chat_threads/chat_messages.
 * Delegates to the shared notebookStreamCore for SSE streaming logic.
 */

import { notebookDepthSchema } from '@gruenerator/contracts';
import { z } from 'zod';

import { validateBody, type TypedRequest } from '../../middleware/validateBody.js';
import { withRetry } from '../../services/search/searchRetryStrategy.js';
import { createAuthenticatedRouter } from '../../utils/keycloak/index.js';
import { createLogger } from '../../utils/logger.js';

import { handleNotebookStream } from './notebookStreamCore.js';
import { createSSEStream, sendChatWarning } from './services/sseHelpers.js';
import {
  getUser,
  createThread,
  createMessage,
  touchThread,
} from './services/threadPersistenceService.js';

import type { ModelMessage } from 'ai';

/**
 * One conversation message on the wire. `content` tolerates both the flat
 * string every live client sends and an AI-SDK style parts array (defensive —
 * shipped mobile binaries speak this endpoint). `citations` carries the raw
 * notebook citations of an earlier assistant answer so the ultra tier can
 * merge previously cited sources into the new turn (see
 * notebookHistoryService); loose records, validated structurally there.
 */
const notebookStreamMessageSchema = z
  .object({
    role: z.string(),
    content: z.union([z.string(), z.array(z.record(z.unknown()))]),
    citations: z.array(z.record(z.unknown())).nullish(),
  })
  .passthrough();

/** Zod schema for the POST body for notebook streaming */
const notebookStreamRequestSchema = z.object({
  messages: z.array(notebookStreamMessageSchema).optional(),
  collectionId: z.string().optional(),
  collectionIds: z.array(z.string()).optional(),
  filters: z.record(z.unknown()).optional(),
  model: z.string().optional(),
  mode: notebookDepthSchema.optional(),
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
        // No thread → nothing in this conversation gets persisted. Say so
        // instead of letting the user believe it was saved.
        log.error('Failed to create notebook thread:', err);
        threadId = null;
        sendChatWarning(
          sse,
          'persist_failed',
          'Der Chat-Verlauf konnte nicht angelegt werden — diese Unterhaltung wird nicht gespeichert.'
        );
      }
    }

    // Persist user message in parallel with streaming. A failure here breaks
    // thread ordering (assistant row without its user row), so it is retried
    // and reported rather than swallowed.
    let userMessageOk = true;
    const userMessagePromise =
      threadId && userText
        ? withRetry(() => createMessage(threadId!, 'user', userText, undefined, user.id), {
            maxRetries: 1,
            delayMs: 300,
            isRecoverable: () => true,
            label: 'notebook:persistUserMessage',
          }).catch((err) => {
            log.error('Failed to persist user message:', err);
            userMessageOk = false;
          })
        : null;

    const result = await handleNotebookStream({
      req,
      res,
      messages: messages ?? [],
      ...(collectionId != null && { collectionId }),
      ...(collectionIds != null && { collectionIds }),
      ...(filters != null && { filters }),
      ...(model != null && { model }),
      ...(mode != null && { mode }),
      ...(documentIds != null && { documentIds }),
      userId: user.id,
      allowUserCollections: true,
      sse,
      // Keep the stream open past the answer so the persistence step below can
      // still report a failure — sendChatWarning no-ops once the stream ended,
      // which made that warning unreachable on this path.
      closeStream: false,
    });

    // Persist assistant message and update thread timestamp in parallel
    if (threadId && result) {
      // Ensure user message is persisted before assistant message for ordering
      if (userMessagePromise) await userMessagePromise;
      try {
        await withRetry(
          () =>
            Promise.all([
              createMessage(
                threadId!,
                'assistant',
                result.answer,
                {
                  type: 'notebook',
                  citations: result.citations,
                  sources: result.sources,
                  ...(result.traceId && { traceId: result.traceId }),
                },
                user.id
              ),
              touchThread(threadId!),
            ]),
          {
            maxRetries: 1,
            delayMs: 300,
            isRecoverable: () => true,
            label: 'notebook:persistAssistantMessage',
          }
        );
      } catch (err) {
        log.error('Failed to persist assistant message:', err);
        userMessageOk = false;
      }
      if (!userMessageOk) sendChatWarning(sse, 'persist_failed');
    }

    // The controller owns the close now (closeStream: false above).
    sse.end();
  }
);

export default router;
