/**
 * POST /api/canvas/chat-edit/stream
 *
 * Combines the notebook chat stream (research + citations + prose) with
 * a tail canvas-AI-suggest call so canvas operations are research-grounded.
 *
 * Pipeline:
 *   1. SSE init + thread creation (matches notebookStreamController shape).
 *   2. handleNotebookStream(..., closeStream: false) streams the assistant
 *      answer via existing search/respond pipeline; emits the existing
 *      `search_*`, `response_start`, `text_delta`, `completion` events.
 *   3. After the answer is in, build context hints { citations, prose } and
 *      call runCanvasSuggest. Emit `canvas_operations_start`, then
 *      `canvas_operations` (suggestions) or `canvas_operations_error`.
 *   4. sse.end().
 *
 * Other chat consumers (`/api/chat-service/notebook/stream`, GruenOMat,
 * notebooks) keep using `notebookStreamController` directly — unchanged.
 */
import { canvasAiSnapshotSchema, canvasAiCapabilitiesSchema } from '@gruenerator/contracts';
import { z } from 'zod';

import { validateBody, type TypedRequest } from '../../middleware/validateBody.js';
import { getAIWorkerPool } from '../../utils/getAIWorkerPool.js';
import { createAuthenticatedRouter } from '../../utils/keycloak/index.js';
import { createLogger } from '../../utils/logger.js';
import { handleNotebookStream } from '../chat/notebookStreamCore.js';
import { createSSEStream } from '../chat/services/sseHelpers.js';
import {
  getUser,
  createThread,
  createMessage,
  touchThread,
} from '../chat/services/threadPersistenceService.js';

import { runCanvasSuggest } from './services/runCanvasSuggest.js';

import type { Citation } from '../../agents/langgraph/ChatGraph/types.js';
import type { ModelMessage } from 'ai';

const log = createLogger('canvasChatEdit');

const canvasChatEditRequestSchema = z.object({
  messages: z.array(z.unknown()).optional(),
  collectionId: z.string().optional(),
  collectionIds: z.array(z.string()).optional(),
  filters: z.record(z.unknown()).optional(),
  model: z.string().optional(),
  mode: z.enum(['fast', 'deep']).optional(),
  documentIds: z.array(z.string()).optional(),
  threadId: z.string().nullable().optional(),
  // Canvas-edit specific:
  canvasSnapshot: canvasAiSnapshotSchema,
  canvasCapabilities: canvasAiCapabilitiesSchema,
  // Last user prompt (we lift it from messages, but the client may also
  // send it explicitly; messages.last() is authoritative either way).
  prompt: z.string().min(1).max(2000).optional(),
});

type CanvasChatEditRequestBody = z.infer<typeof canvasChatEditRequestSchema>;

const router = createAuthenticatedRouter();

router.post(
  '/',
  validateBody(canvasChatEditRequestSchema),
  async (req: TypedRequest<CanvasChatEditRequestBody>, res) => {
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
      canvasSnapshot,
      canvasCapabilities,
      prompt: explicitPrompt,
    } = req.body;
    const messages = rawMessages as ModelMessage[] | undefined;

    const lastUserMessage = Array.isArray(messages)
      ? messages.filter((m: { role: string }) => m.role === 'user').pop()
      : null;
    const lastUserText =
      typeof lastUserMessage?.content === 'string' ? lastUserMessage.content : '';
    const editPrompt = (explicitPrompt ?? lastUserText).trim();

    let threadId: string | null = existingThreadId ?? null;
    const sse = createSSEStream(res);

    if (!editPrompt) {
      sse.send('error', { error: 'Eine Nachricht ist erforderlich.' });
      sse.end();
      return;
    }

    if (!collectionId && (!collectionIds || collectionIds.length === 0)) {
      sse.send('error', {
        error:
          'Für den KI-Chat in der Canvas-Bearbeitung wird mindestens ein Notebook benötigt. Lege ein Notebook an, um Recherche-Kontext zu erhalten.',
      });
      sse.end();
      return;
    }

    // Thread bookkeeping mirrors notebookStreamController so threads created
    // here look identical to /api/chat-service/notebook/stream threads.
    if (!threadId) {
      try {
        const primaryCollectionId =
          collectionId || (Array.isArray(collectionIds) ? collectionIds[0] : null);
        const thread = await createThread(
          user.id,
          'notebook-qa',
          lastUserText.slice(0, 80) || 'Sharepic-Bearbeitung',
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
        log.error('Failed to create canvas-chat thread:', err);
      }
    }

    const userMessagePromise =
      threadId && lastUserText
        ? createMessage(threadId, 'user', lastUserText, undefined, user.id).catch((err) =>
            log.error('Failed to persist user message:', err)
          )
        : null;

    // === Stage 1: Research + prose stream (citations + answer) ===
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
      closeStream: false,
    });

    if (!result) {
      // Search/streaming failed; notebookStreamCore already emitted error/completion.
      sse.end();
      return;
    }

    if (threadId) {
      if (userMessagePromise) await userMessagePromise;
      try {
        await Promise.all([
          createMessage(
            threadId,
            'assistant',
            result.answer,
            { type: 'notebook', citations: result.citations, sources: result.sources },
            user.id
          ),
          touchThread(threadId),
        ]);
      } catch (err) {
        log.error('Failed to persist assistant message:', err);
      }
    }

    // === Stage 2: Canvas-suggest with research grounding ===
    sse.send('canvas_operations_start', { message: 'Bearbeitungs­vorschlag wird erstellt...' });

    const suggestResult = await runCanvasSuggest({
      prompt: editPrompt,
      snapshot: canvasSnapshot,
      capabilities: canvasCapabilities,
      contextHints: {
        citations: result.citations as Citation[],
        prose: result.answer,
      },
      aiWorkerPool: getAIWorkerPool(req),
      req,
      logTag: 'canvas_chat_edit',
    });

    if (suggestResult.ok) {
      sse.send('canvas_operations', { suggestions: suggestResult.suggestions });
    } else {
      sse.send('canvas_operations_error', {
        error: `Konnte keine Bearbeitungs­vorschläge erzeugen (${suggestResult.error})`,
      });
    }

    sse.end();
  }
);

export default router;
