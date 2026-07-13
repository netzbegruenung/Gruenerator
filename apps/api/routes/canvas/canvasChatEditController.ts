/**
 * POST /api/canvas/chat-edit/stream
 *
 * @deprecated Legacy endpoint kept alive for old bundles only (desktop builds
 * ship the frozen web frontend against the production backend). The canvas
 * editor chat now runs through the main chat pipeline (/api/chat-service/*)
 * with the gruenerator-sharepic-editor agent; edits execute client-side via
 * POST /api/canvas/ai-suggest. Remove once no deployed client calls this.
 *
 * Streams a plain assistant answer for the canvas-editor chat, then a tail
 * canvas-AI-suggest call. Deliberately NOT the notebook QA pipeline — sharepic
 * editing must work without any notebook (no RAG stage, no collection
 * requirement); the prompt context is the sharepic itself.
 *
 * Pipeline:
 *   1. SSE init + thread creation (matches notebookStreamController shape).
 *   2. Plain LLM stream (sharepic system prompt + history + current sharepic
 *      text); emits `response_start`, `text_delta`, `completion` — the same
 *      events the notebook stream uses, minus the `search_*` stage.
 *   3. runCanvasSuggest with the answer as context hint. Emits
 *      `canvas_operations_start`, then `canvas_operations` (suggestions) or
 *      `canvas_operations_error`.
 *   4. sse.end().
 */
import { canvasAiSnapshotSchema, canvasAiCapabilitiesSchema } from '@gruenerator/contracts';
import { z } from 'zod';

import { validateBody, type TypedRequest } from '../../middleware/validateBody.js';
import { getAIWorkerPool } from '../../utils/getAIWorkerPool.js';
import { createAuthenticatedRouter } from '../../utils/keycloak/index.js';
import { createLogger } from '../../utils/logger.js';
import { isProviderConfigured } from '../chat/agents/providers.js';
import {
  resolveModel,
  streamForResolution,
  streamWithFallback,
} from '../chat/services/responseStreamingService.js';
import { createSSEStream } from '../chat/services/sseHelpers.js';
import {
  getUser,
  createThread,
  createMessage,
  touchThread,
} from '../chat/services/threadPersistenceService.js';

import { runCanvasSuggest } from './services/runCanvasSuggest.js';

import type { ModelMessage } from 'ai';

const log = createLogger('canvasChatEdit');

const DEFAULT_PROVIDER = 'mistral';
const DEFAULT_MODEL = 'mistral-medium-2604';

// Server-side fallback when the client sends no system prompt (old bundles).
const FALLBACK_SYSTEM_PROMPT = `Du bist Assistent*in für die Sharepic-Bearbeitung von Bündnis 90/Die Grünen. Der*die Nutzer*in arbeitet gerade an einem Sharepic.
- Beantworte Fragen zu Inhalt, Wirkung, Zielgruppe und politischer Einordnung.
- Schlage alternative Formulierungen oder Texte vor, wenn das hilft.
- Antworte in informellem Du-Stil und mit Genderstern (*in / *innen).`;

const canvasChatEditRequestSchema = z.object({
  messages: z.array(z.unknown()).optional(),
  model: z.string().optional(),
  mode: z.enum(['fast', 'deep']).optional(),
  threadId: z.string().nullable().optional(),
  // Canvas-edit specific:
  canvasSnapshot: canvasAiSnapshotSchema,
  canvasCapabilities: canvasAiCapabilitiesSchema,
  // Sharepic context captured by the client composer (NotebookModelAdapter).
  systemPrompt: z.string().max(8000).optional(),
  sharepicText: z.string().max(8000).optional(),
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
      model,
      threadId: existingThreadId,
      canvasSnapshot,
      canvasCapabilities,
      systemPrompt,
      sharepicText,
      prompt: explicitPrompt,
    } = req.body;
    const messages = (rawMessages ?? []) as ModelMessage[];

    const lastUserMessage = messages.filter((m) => m.role === 'user').pop();
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

    const abortController = new AbortController();
    req.on('close', () => {
      abortController.abort();
    });

    // Thread bookkeeping mirrors notebookStreamController so threads created
    // here look identical to /api/chat-service/notebook/stream threads.
    if (!threadId) {
      try {
        const thread = await createThread(
          user.id,
          'notebook-qa',
          lastUserText.slice(0, 80) || 'Sharepic-Bearbeitung',
          'notebook'
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

    // === Stage 1: Plain assistant answer (no RAG — the sharepic IS the context) ===
    const userContent = sharepicText?.trim()
      ? `${editPrompt}\n\nAktueller Sharepic-Text:\n${sharepicText.trim()}`
      : editPrompt;
    const aiMessages: ModelMessage[] = [
      { role: 'system', content: systemPrompt?.trim() || FALLBACK_SYSTEM_PROMPT },
      ...messages.slice(0, -1),
      { role: 'user', content: userContent },
    ];

    const requestId = `canvas_chat_${Date.now()}`;
    const resolution = await resolveModel(
      { provider: DEFAULT_PROVIDER, model: DEFAULT_MODEL },
      model,
      requestId
    );

    if (!isProviderConfigured(resolution.provider)) {
      if (resolution.releaseSlot) await resolution.releaseSlot();
      sse.send('error', { error: `Provider "${resolution.provider}" is not configured` });
      sse.end();
      return;
    }

    sse.send('response_start', { message: 'Generiere Antwort...' });

    let answer: string | null;
    try {
      answer = await streamWithFallback({
        primary: resolution,
        sse,
        logPrefix: '[CanvasChat]',
        buildStream: async (res_) =>
          streamForResolution({
            resolution: res_,
            messages: aiMessages,
            maxTokens: 20000,
            temperature: 0.3,
            sse,
            signal: abortController.signal,
            logPrefix: '[CanvasChat]',
          }),
      });
    } finally {
      if (resolution.releaseSlot) await resolution.releaseSlot();
    }

    if (answer === null || abortController.signal.aborted) {
      sse.end();
      return;
    }

    sse.send('completion', {
      answer,
      citations: [],
      sources: [],
      allSources: [],
      metadata: {},
    });

    if (threadId) {
      if (userMessagePromise) await userMessagePromise;
      try {
        await Promise.all([
          createMessage(
            threadId,
            'assistant',
            answer,
            { type: 'notebook', citations: [], sources: [] },
            user.id
          ),
          touchThread(threadId),
        ]);
      } catch (err) {
        log.error('Failed to persist assistant message:', err);
      }
    }

    // === Stage 2: Canvas-suggest grounded on the answer ===
    sse.send('canvas_operations_start', { message: 'Bearbeitungs­vorschlag wird erstellt...' });

    const suggestResult = await runCanvasSuggest({
      prompt: editPrompt,
      snapshot: canvasSnapshot,
      capabilities: canvasCapabilities,
      contextHints: { citations: [], prose: answer },
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
