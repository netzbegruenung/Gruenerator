/**
 * Notebook Streaming Controller
 * Authenticated endpoint for notebook Q&A streaming.
 * Creates persistent threads and saves messages to chat_threads/chat_messages.
 * Delegates to the shared notebookStreamCore for SSE streaming logic.
 */

import {
  notebookAnswerModeSchema,
  notebookDepthSchema,
  notebookSourceTierSchema,
  notebookResolvedAnswerModeSchema,
} from '@gruenerator/contracts';
import { z } from 'zod';

import { requireAiConsent } from '../../middleware/requireAiConsent.js';
import { validateBody, type TypedRequest } from '../../middleware/validateBody.js';
import { startStreamRecorder } from '../../services/chat/resumableStreams.js';
import { extractLocaleFromRequest } from '../../services/localization/index.js';
import { memoryService } from '../../services/memory/index.js';
import { withRetry } from '../../services/search/searchRetryStrategy.js';
import { gatePandaModelId } from '../../services/user/pandaEntitlement.js';
import { createAuthenticatedRouter } from '../../utils/keycloak/index.js';
import { createLogger } from '../../utils/logger.js';
import { ThreadId, UserId } from '../../utils/types/branded.js';
import { withTimeout } from '../../utils/withTimeout.js';

import { handleNotebookStream } from './notebookStreamCore.js';
import {
  notebookGuardHistory,
  resolveNotebookAnswerMode,
} from './services/notebookAnswerModeResolver.js';
import { runNotebookPraezisionTurn } from './services/notebookPraezisionTurn.js';
import {
  createPendingAssistantWriter,
  type PendingAssistantWriter,
} from './services/pendingAssistantWriter.js';
import { createSSEStream, sendChatWarning } from './services/sseHelpers.js';
import { canWriteThread } from './services/threadAccessService.js';
import {
  getUser,
  createThread,
  createMessage,
  createPendingAssistantMessage,
  deleteEmptyStreamingRows,
  discardPendingAssistantIfEmpty,
  finalizeAssistantMessage,
  touchThread,
} from './services/threadPersistenceService.js';

import type { UserLocale } from '../../agents/langgraph/ChatGraph/types.js';
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
    /** Modus einer früheren Antwort — Kontext für den Auto-Wächter. Tolerant:
     *  ein unbekannter Wert macht den Request nicht ungültig. */
    answerMode: notebookResolvedAnswerModeSchema.nullish().catch(null),
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
  /** Quellen-Ampel; fehlt ⇒ `equal`. */
  sourceTier: notebookSourceTierSchema.optional(),
  /** Antwortmodus; fehlt ⇒ `chat` (alte Clients, Eval, Grün-O-Mat). */
  answerMode: notebookAnswerModeSchema.optional(),
  documentIds: z.array(z.string()).optional(),
  threadId: z.string().nullable().optional(),
});
type NotebookStreamRequestBody = z.infer<typeof notebookStreamRequestSchema>;

const router = createAuthenticatedRouter();
const log = createLogger('notebookStream');

const MEMORY_TIMEOUT_MS = 3_000;

/**
 * Standing instructions hold on every surface, so the notebook gets them too;
 * the profile switch and the chat's failure mode (answer without) carry over
 * from `streamContext`.
 */
async function loadStandingInstructions(userId: string, memoryEnabled: boolean): Promise<string[]> {
  if (!memoryEnabled) return [];
  try {
    const rows = await withTimeout(memoryService.list(userId), MEMORY_TIMEOUT_MS, 'memory lookup');
    return rows.filter((r) => r.kind === 'anweisung').map((r) => r.text);
  } catch (err) {
    log.warn('Memory lookup failed (continuing without):', err);
    return [];
  }
}

/**
 * POST /api/chat-service/notebook/stream
 * Stream answers to notebook questions with sources/citations.
 * Automatically creates threads and persists messages.
 */
router.post(
  '/',
  requireAiConsent,
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
      model: requestedModel,
      mode,
      sourceTier,
      answerMode,
      documentIds,
      threadId: existingThreadId,
    } = req.body;
    const messages = rawMessages as ModelMessage[] | undefined;
    const model = await gatePandaModelId(requestedModel, user.id);

    const lastUserMessage = Array.isArray(messages)
      ? messages.filter((m: { role: string }) => m.role === 'user').pop()
      : null;
    const userText = typeof lastUserMessage?.content === 'string' ? lastUserMessage.content : '';

    // Die id kommt vom Client: ein fremder oder gelöschter Thread wird nie
    // weiterbenutzt (der Präzisionsmodus liest über sie Werkzeugschritte und
    // Quellen) — wie in `streamContext` gibt es dann einen frischen.
    let threadId: string | null =
      existingThreadId && (await canWriteThread(ThreadId(existingThreadId), UserId(user.id)))
        ? existingThreadId
        : null;
    if (existingThreadId && !threadId) {
      log.warn(`[notebookStream] thread ${existingThreadId} not writable — starting a new one`);
    }
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

    // Resumable turn: a placeholder row after the user row (its id is the
    // stream id), the stream teed into Redis, and an answer that outlives the
    // connection — once recorded, only the stop button (cancel) ends it early.
    // Until then, and for a turn that can't be recorded, a disconnect still
    // aborts it. The placeholder is minted while the answer mode resolves.
    const cancel = new AbortController();
    let resumable = false;
    res.on('close', () => {
      if (!resumable && !res.writableEnded) cancel.abort();
    });
    const turnThreadId = threadId;
    const placeholderPromise: Promise<string | null> = turnThreadId
      ? Promise.resolve(userMessagePromise)
          .then(() => deleteEmptyStreamingRows(turnThreadId))
          .then(() => createPendingAssistantMessage(turnThreadId, user.id))
          .catch((err: unknown) => {
            // Same degradation as the chat path: no placeholder, the turn runs
            // as before (not resumable, answer inserted at the end).
            log.warn('[notebookStream] Failed to create pending assistant row:', err);
            return null;
          })
      : Promise.resolve(null);

    const standingInstructions = await loadStandingInstructions(
      user.id,
      user.memory_enabled ?? true
    );

    const userLocale: UserLocale = extractLocaleFromRequest(req) === 'de-AT' ? 'de-AT' : 'de-DE';
    const pageCollectionIds = collectionIds?.length
      ? collectionIds
      : collectionId
        ? [collectionId]
        : [];
    const answerModeStart = Date.now();
    const { decision, warning } = await resolveNotebookAnswerMode({
      requested: answerMode ?? null,
      collectionIds: pageCollectionIds,
      userLocale,
      question: userText,
      history: notebookGuardHistory(rawMessages ?? []),
    });
    log.info(
      `[NotebookAnswerMode] requested=${decision.requested ?? '-'} resolved=${decision.resolved} reason=${decision.reason} ms=${Date.now() - answerModeStart}`
    );
    if (warning) sendChatWarning(sse, warning);
    sse.send('answer_mode', decision);

    const pendingId = await placeholderPromise;
    let pendingWriter: PendingAssistantWriter | null = null;
    if (pendingId) {
      const writer = createPendingAssistantWriter(pendingId);
      pendingWriter = writer;
      sse.setTextListener((kind, text) => writer.onText(kind, text));
    }
    const recorder =
      pendingId && !cancel.signal.aborted
        ? await startStreamRecorder(pendingId, { onCancelled: () => cancel.abort() })
        : null;
    if (recorder && pendingId) {
      sse.attachRecorder(recorder, pendingId);
      resumable = true;
    } else {
      sse.disableRecording();
    }

    const result =
      decision.resolved === 'praezision'
        ? await runNotebookPraezisionTurn({
            req,
            res,
            sse,
            messages: messages ?? [],
            collectionIds: pageCollectionIds,
            userId: user.id,
            userLocale,
            threadId,
            ...(standingInstructions.length > 0 && { standingInstructions }),
            answerModeReason: decision.reason,
            abortSignal: cancel.signal,
          })
        : await handleNotebookStream({
            req,
            res,
            messages: messages ?? [],
            ...(collectionId != null && { collectionId }),
            ...(collectionIds != null && { collectionIds }),
            ...(filters != null && { filters }),
            ...(model != null && { model }),
            ...(mode != null && { mode }),
            ...(sourceTier != null && { sourceTier }),
            ...(documentIds != null && { documentIds }),
            userId: user.id,
            allowUserCollections: true,
            ...(standingInstructions.length > 0 && { standingInstructions }),
            sse,
            // Keep the stream open past the answer so the persistence step below can
            // still report a failure — sendChatWarning no-ops once the stream ended,
            // which made that warning unreachable on this path.
            closeStream: false,
            completionMetadata: {
              answerMode: decision.resolved,
              answerModeReason: decision.reason,
            },
            abortSignal: cancel.signal,
          });

    sse.setTextListener(undefined);
    // swallow-ok: the writer logs its own flush failures; the final persist follows
    await pendingWriter?.stop().catch(() => {});
    // No answer: drop the placeholder if it stayed empty; partial text survives
    // as an interrupted turn, like on the chat path.
    // swallow-ok: best-effort cleanup — a leftover empty row is swept on the next turn
    if (pendingId && !result) await discardPendingAssistantIfEmpty(pendingId).catch(() => {});

    // Persist assistant message and update thread timestamp in parallel
    if (threadId && result) {
      // Ensure user message is persisted before assistant message for ordering
      if (userMessagePromise) await userMessagePromise;
      const metadata = {
        type: 'notebook',
        citations: result.citations,
        sources: result.sources,
        ...(result.traceId && { traceId: result.traceId }),
        answerMode: decision.resolved,
        answerModeReason: decision.reason,
        ...('steps' in result &&
          Array.isArray(result.steps) &&
          result.steps.length > 0 && { toolCalls: result.steps }),
      };
      // Fill the placeholder. A placeholder that vanished meanwhile was removed
      // on purpose (regenerate, a newer turn's sweep) — re-inserting the answer
      // would land it after a newer question, so it is dropped like on the
      // chat path.
      const persistAnswer = async (): Promise<void> => {
        if (!pendingId) {
          await createMessage(threadId!, 'assistant', result.answer, metadata, user.id);
        } else if (!(await finalizeAssistantMessage(pendingId, result.answer, metadata))) {
          log.warn(`[notebookStream] placeholder ${pendingId} is gone — answer not persisted`);
        }
      };
      try {
        await withRetry(() => Promise.all([persistAnswer(), touchThread(threadId!)]), {
          maxRetries: 1,
          delayMs: 300,
          isRecoverable: () => true,
          label: 'notebook:persistAssistantMessage',
        });
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
