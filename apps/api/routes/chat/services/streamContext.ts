/**
 * Stream context builder for the chat-graph `stream` endpoint.
 *
 * Owns everything that happens BEFORE Stage 1 (classify): auth + payload
 * validation, notebook resolution, wolke/connect ref filtering, message
 * conversion, thread creation, attachment processing, memory retrieval,
 * state initialization and context enrichment.
 *
 * Returns a discriminated result: `{ done: true }` when the request was
 * already terminated (an SSE error event was sent + the stream closed), or
 * `{ done: false, ctx }` with the fully-populated `StreamContext` the staged
 * pipeline consumes.
 */

import { type chatGraphContract } from '@gruenerator/contracts';
import { type UserRole, stripRoleBlock } from '@gruenerator/shared/roles';
import {
  hasMentionTokens,
  parseMentionTokens,
  sanitizeMentionTokens,
} from '@gruenerator/shared/utils';
import { convertToModelMessages } from 'ai';

import { initializeChatState } from '../../../agents/langgraph/ChatGraph/index.js';
import {
  isNotebookImplicitlySearchable,
  isNotebookResolvable,
  isUserNotebookId,
  resolveUserNotebookDocumentIds,
} from '../../../config/notebookCollectionMap.js';
import {
  loadTurnMemories,
  numberMemories,
  renderMemoryLines,
  type RenderedMemory,
} from '../../../services/memory/index.js';
import { findRole, resolveCustomSystemPrompt } from '../../../services/roles/roleSystemPrompt.js';
import { loadUserRoles } from '../../../services/roles/userRoles.js';
import { recordItemUsageSafe } from '../../../services/usage/ItemUsageService.js';
import { NextcloudShareManager } from '../../../utils/integrations/nextcloud/shareManager.js';
import { createLogger } from '../../../utils/logger.js';
import { captureSseError } from '../../../utils/observability/captureSseError.js';
import { ThreadId, UserId } from '../../../utils/types/branded.js';
import { withTimeout } from '../../../utils/withTimeout.js';
import { getPipelineAgent } from '../agents/pipelines/index.js';
import { getContextWindow } from '../agents/providers.js';

import { getThreadAttachments } from './attachmentPersistenceService.js';
import {
  extractPromotablePasteText,
  isTabularAttachment,
  processAttachments,
} from './attachmentProcessingService.js';
import { countCloudConnections } from './cloudConnectionContext.js';
import { enrichContext } from './contextEnrichmentService.js';
import { backfillEmptyUserMessages } from './historyBackfill.js';
import {
  extractTextContent,
  filterEmptyAssistantMessages,
  sanitizeUIFileParts,
} from './messageHelpers.js';
import { type createSSEStream, PROGRESS_MESSAGES } from './sseHelpers.js';
import { canAccessThread } from './threadAccessService.js';
import {
  getUser,
  getUserMessageTexts,
  createThread,
  createMessage,
  createPendingAssistantMessage,
  deleteEmptyStreamingRows,
  deleteMessagesFrom,
  deleteTrailingAssistant,
  getThreadToolContext,
  readThreadToolHistory,
  type ThreadToolHistory,
} from './threadPersistenceService.js';

import type {
  ChatGraphInput,
  ProcessedAttachment,
} from '../../../agents/langgraph/ChatGraph/types.js';
import type { ServerInferRequest } from '@ts-rest/core';
import type { ModelMessage, UIMessage } from 'ai';
import type { Request } from 'express';

const log = createLogger('chatGraphContractRouter');

// Upper bound for best-effort external context calls (memory, Nextcloud) that
// run before the LLM stream starts — they add to time-to-first-token, so a
// hanging service must not stall the chat. On timeout the turn proceeds
// without that context.
const EXTERNAL_CONTEXT_TIMEOUT_MS = 3_000;

/**
 * Long material pasted straight into the message body — not uploaded as a file —
 * is persisted as a synthetic attachment so later turns get it back through
 * `FRÜHERE DOKUMENTE IN DIESEM GESPRÄCH`.
 *
 * Measured on thread `5b184c40` (13.08.2026, 00:53–00:56): a translate → glossary
 * → mapping-table → proofread chain over one article. The first user message held
 * 10.327 chars and `chat_thread_attachments` had no row for that thread at all, so
 * nothing could be re-injected. Steps 2–4 then built the mapping table out of the
 * translation instead of the source, invented source quotes, and the model even
 * web-searched for the article it had been handed one turn earlier.
 *
 * The web composer already converts pastes ≥600 chars into a real attachment, but
 * only on its own paste path. Text that arrives as plain message content (mobile,
 * API clients, a paste the composer did not intercept) bypassed persistence.
 *
 * Threshold: the base system prompt runs ~3.000 chars, the same yardstick
 * `materialDominatesTurn` uses. Below it a message is an instruction; above it,
 * it is material the user will keep referring to.
 */
export const INLINE_MATERIAL_MIN_CHARS = 3_000;
/** Same name the composer gives an intercepted paste — one concept, one label. */
export const INLINE_MATERIAL_ATTACHMENT_NAME = 'Eingefügter Text.txt';

/**
 * The synthetic attachment for this turn's inline material, or null when there
 * is nothing to carry forward. Skipped when the turn already brought a document
 * (that one IS the material) and on regenerate (the user message is unchanged —
 * a second row would duplicate it).
 *
 * `promoted` lifts the length floor, and only that one. A promoted paste is not
 * "some short message": the composer created it because the paste passed its own
 * bar (≥600 chars, or ≥200 across three lines), and it arrived with an empty
 * textarea, so it is the turn's material by construction. Without this, the
 * paste is dropped from `effectiveAttachments` on promotion and never persisted:
 * `resolveOriginalText` picks it correctly for THIS turn, and the next turn —
 * "bitte korrigieren", no material of its own — carries the previous article
 * back in, because that is the newest row the thread has. Measured 14.08.2026: a
 * 1.339-char source text, one turn of correct behaviour, then the same wrong
 * original as before.
 */
export function inlineMaterialAttachment(
  text: string,
  opts: { regenerate: boolean; hasDocumentAttachment: boolean; promoted?: boolean }
): ProcessAttachmentsResult['processedMeta'][number] | null {
  if (opts.regenerate || opts.hasDocumentAttachment) return null;
  if (!opts.promoted && text.length < INLINE_MATERIAL_MIN_CHARS) return null;
  if (text.trim().length === 0) return null;
  return {
    name: INLINE_MATERIAL_ATTACHMENT_NAME,
    mimeType: 'text/plain',
    sizeBytes: Buffer.byteLength(text, 'utf8'),
    isImage: false,
    extractedText: text,
  };
}

// chat_threads.id is a uuid column. A client may send a local-only sentinel id
// (e.g. "__LOCALID_..." from the lazy-thread-creation runtime, or the sheet /
// deck editor sidebars) for a thread it has not persisted yet — that is not a
// UUID and must never reach canAccessThread's `WHERE id = $1`, or Postgres
// throws 22P02 and the whole turn 500s. Treat any non-UUID id as "no thread
// yet" and mint a fresh one.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type StreamBody = ServerInferRequest<typeof chatGraphContract.stream>['body'];
type SSEStream = ReturnType<typeof createSSEStream>;
type ProcessAttachmentsResult = Awaited<ReturnType<typeof processAttachments>>;

/**
 * Everything Stage 1–4 of the stream pipeline read that is computed before
 * classification. Raw request-body fields stay on `body` and are read directly.
 */
export interface StreamContext {
  requestId: string;
  userId: string;
  notebookIds: string[];
  validMessages: ChatGraphInput['messages'];
  lastUserMessage: ChatGraphInput['messages'][number] | undefined;
  actualThreadId: string | undefined;
  isNewThread: boolean;
  classifyStepId: string;
  imageAttachments: ProcessAttachmentsResult['imageAttachments'];
  processedMeta: ProcessAttachmentsResult['processedMeta'];
  initialState: Awaited<ReturnType<typeof initializeChatState>>;
  memoryContext: string | null;
  memoryRetrieveTimeMs: number;
  memoryEnabled: boolean;
  contextWindowTokens: number;
  /** Routing fields derived from durable mention tokens in the last user
   *  message ("@[Label](type:id)") — merged with the legacy body fields. */
  mentionTokenFields: MentionTokenFields;
  /** Last user message text WITH tokens (pre-sanitization) — for regex
   *  heuristics that need the remove-form. */
  lastUserTextRaw: string;
  /** True when this turn's user message IS a paste — the composer's synthetic
   *  paste attachment sent with an empty textarea, promoted above. Read by
   *  `resolveOriginalText`, which otherwise has only length to tell a short
   *  pasted source text from a typed instruction. */
  promptIsPastedText: boolean;
  /** Placeholder assistant row minted before streaming so an aborted/crashed
   *  turn still persists (WP-B). Null when no thread/user message, or when the
   *  placeholder insert failed (the turn then runs as before). */
  pendingAssistantMessageId: string | null;
  /** The thread's tool metadata, read once here for the classifier's artifact
   *  list and handed on so the agentic loop's replay and source rehydration
   *  project the same rows instead of re-reading them. Null on a new thread or
   *  when the read failed — every consumer then reads for itself, as before. */
  threadToolHistory: ThreadToolHistory | null;
  /** Persisted row for the current user turn. Attachments link here so history
   * can render them on the same message after a reload. */
  userMessageId: string | null;
}

export type BuildStreamContextResult = { done: true } | { done: false; ctx: StreamContext };

export async function buildStreamContext({
  req,
  body,
  sse,
  requestId,
}: {
  req: Request;
  body: StreamBody;
  sse: SSEStream;
  requestId: string;
}): Promise<BuildStreamContextResult> {
  const {
    messages: clientMessages,
    agentId,
    notebookIds: rawNotebookIds,
    documentChatMode,
    attachmentContext: rawClientAttachmentContext,
    computedResult: rawComputedResult,
    defaultNotebookId: rawDefaultNotebookId,
    docMentionIds: rawDocMentionIds,
    wolkeFiles: rawWolkeFiles,
    connectFiles: rawConnectFiles,
    currentDocument: rawCurrentDocument,
    currentBoard: rawCurrentBoard,
    customSystemPrompt: rawCustomSystemPrompt,
    roleRef: rawRoleRef,
    roleName: rawRoleName,
    initialAssistantMessage: rawInitialAssistantMessage,
    activeSkillMention: rawActiveSkillMention,
    enabledTools,
    modelId,
    attachments,
    documentIds: rawDocumentIds,
    textIds: rawTextIds,
    documentChatIds: rawDocumentChatIds,
    boardIds: rawBoardIds,
    sheetIds: rawSheetIds,
    threadId,
    clientTools,
    regenerate: rawRegenerate,
    replaceFromMessageId: rawReplaceFromMessageId,
    webpageUrls: rawWebpageUrls,
    platform: rawPlatform,
  } = body;

  // Durable mention tokens in the last user message are the routing source of
  // truth; legacy per-request fields (older clients) merge in by union. Ids in
  // tokens are user-typed text — every consumer below keeps its access checks.
  const mentionTokenFields = deriveMentionTokenFields(clientMessages);
  const mergedNotebookIds = unionIds(rawNotebookIds, mentionTokenFields.notebookIds);
  const mergedBoardIds = unionIds(rawBoardIds, mentionTokenFields.boardIds);
  const mergedSheetIds = unionIds(rawSheetIds, mentionTokenFields.sheetIds);
  const mergedDocMentionIds = unionIds(rawDocMentionIds, mentionTokenFields.docMentionIds);

  // === Validate ===
  const user = getUser(req);
  if (!user?.id) {
    sse.send('error', { error: PROGRESS_MESSAGES.unauthorized, code: 'unauthorized' });
    sse.end();
    return { done: true };
  }

  const userId = user.id;
  if ((clientMessages as unknown[]).length === 0) {
    sse.send('error', { error: PROGRESS_MESSAGES.messagesRequired, code: 'invalid_request' });
    sse.end();
    return { done: true };
  }

  // @notebook mentions are the turn naming a notebook out loud — the one case a
  // merely *hidden* notebook still resolves, so a link or thread shared from
  // another instance keeps working. Only `block` and `enabled: false` say no here.
  const systemNotebookIds = mergedNotebookIds.filter(isNotebookResolvable);
  const userNotebookUuids = mergedNotebookIds.filter(isUserNotebookId);
  const { documentIds: notebookDocumentIds, resolvedUserNotebookIds } =
    userNotebookUuids.length > 0
      ? await resolveUserNotebookDocumentIds(userId, userNotebookUuids)
      : { documentIds: [], resolvedUserNotebookIds: [] };
  const notebookIds = [...systemNotebookIds, ...resolvedUserNotebookIds];
  // The composer's default pick scopes every following turn without being
  // restated, so it is implicit scoping — unlike the mention above.
  const defaultNotebookId =
    rawDefaultNotebookId && isNotebookImplicitlySearchable(rawDefaultNotebookId)
      ? rawDefaultNotebookId
      : undefined;
  // An agent can bind a user-owned notebook (UUID) as its default knowledge
  // base. Resolve it to document IDs (ownership-checked) so search can scope
  // to it — mirrors the mention path, but as a default rather than explicit.
  const { documentIds: defaultNotebookDocumentIds } =
    rawDefaultNotebookId && !defaultNotebookId && isUserNotebookId(rawDefaultNotebookId)
      ? await resolveUserNotebookDocumentIds(userId, [rawDefaultNotebookId])
      : { documentIds: [] };

  // Filter wolkeFiles to refs whose shareLinkId is still owned + active for this user.
  // Stale refs (deleted/deactivated share link) are dropped so the chat still
  // works, but the client is told via a `warning` SSE event since the answer
  // will lack the requested file context. The ownership check is bounded so a
  // slow Nextcloud cannot delay time-to-first-token indefinitely.
  let wolkeFiles: typeof rawWolkeFiles = undefined;
  if (rawWolkeFiles?.length) {
    try {
      const userShareLinks = await withTimeout(
        NextcloudShareManager.getShareLinks(userId),
        EXTERNAL_CONTEXT_TIMEOUT_MS,
        'wolke share-link check'
      );
      const allowedIds = new Set(userShareLinks.filter((l) => l.is_active).map((l) => l.id));
      const filtered = rawWolkeFiles.filter((f) => allowedIds.has(f.shareLinkId));
      wolkeFiles = filtered.length > 0 ? filtered : undefined;
      if (filtered.length < rawWolkeFiles.length) {
        log.warn(
          `[ChatGraph] Dropped ${rawWolkeFiles.length - filtered.length} stale wolkeFiles ref(s) for user ${userId}`
        );
        sse.send('warning', {
          code: 'wolke_refs_dropped',
          message: `${rawWolkeFiles.length - filtered.length} Wolke-Datei(en) nicht mehr verfügbar — Antwort ohne diese Dateien.`,
        });
      }
    } catch (err) {
      log.warn(`[ChatGraph] wolkeFiles ownership check failed; ignoring refs`, err);
      wolkeFiles = undefined;
      sse.send('warning', {
        code: 'wolke_check_failed',
        message: 'Wolke-Dateien konnten nicht geprüft werden — Antwort ohne diese Dateien.',
      });
    }
  }

  // Tor für `cloud_files`: der Katalog wird synchron gebaut und kann diese Frage
  // nicht selbst stellen. Gecacht (60 s) und fehlertolerant — ein Ausfall macht
  // aus dem Zähler eine 0, und das Vokabular-Tor trägt den Turn weiter.
  const cloudConnectionCount = await countCloudConnections(userId);

  // @connect file refs need no per-ref ownership pre-check: the Nango
  // connection (resolved per-file at retrieval time via
  // ConnectionService.getConnection(userId, provider)) IS the ownership
  // boundary, and a revoked/expired token fails safe to an empty result.
  // Normalize null mimeType → omit so downstream types stay clean.
  const connectFiles = rawConnectFiles?.length
    ? rawConnectFiles.map((f) => ({
        provider: f.provider,
        fileId: f.fileId,
        name: f.name,
        ...(f.mimeType ? { mimeType: f.mimeType } : {}),
      }))
    : undefined;

  log.info(`[ChatGraph] Processing request for user ${userId}, agent ${agentId ?? 'default'}`);
  if (notebookIds.length > 0) {
    log.info(`[ChatGraph] Notebook scoping: ${notebookIds.join(', ')}`);
  }
  if (resolvedUserNotebookIds.length > 0) {
    log.info(
      `[ChatGraph] User-notebook scoping: ${resolvedUserNotebookIds.length} notebook(s) → ${notebookDocumentIds.length} document(s)`
    );
  }

  // Record usage for "favourites first" ordering (fire-and-forget). Only the
  // explicitly-selected agent is recorded — the default is coalesced later, so
  // recording it here would rank `gruenerator-universal` to the top of every
  // user's list. Both system (slug) and resolved user (UUID) notebooks count.
  if (agentId) {
    recordItemUsageSafe(userId, 'agent', agentId);
  }
  for (const notebookId of new Set([...systemNotebookIds, ...resolvedUserNotebookIds])) {
    recordItemUsageSafe(userId, 'notebook', notebookId);
  }

  // === Convert messages ===
  let modelMessages: ChatGraphInput['messages'];
  const { messages: convertibleMessages, droppedFileParts } = sanitizeUIFileParts(
    clientMessages as UIMessage[]
  );
  if (droppedFileParts > 0) {
    log.info(
      `[ChatGraph] Dropped ${droppedFileParts} url-less file part(s) before conversion — content rides in attachments`
    );
  }
  try {
    modelMessages = (await convertToModelMessages(
      convertibleMessages as UIMessage[]
    )) as ModelMessage[] as ChatGraphInput['messages'];
  } catch (convertError) {
    log.error('[ChatGraph] Error converting messages:', convertError);
    sse.send('error', { error: PROGRESS_MESSAGES.invalidRequest, code: 'invalid_request' });
    sse.end();
    return { done: true };
  }

  if (!modelMessages || !Array.isArray(modelMessages)) {
    sse.send('error', { error: PROGRESS_MESSAGES.invalidRequest, code: 'invalid_request' });
    sse.end();
    return { done: true };
  }

  let validMessages = filterEmptyAssistantMessages(
    modelMessages as ModelMessage[]
  ) as ChatGraphInput['messages'];
  log.info(
    `[ChatGraph] Converted ${(clientMessages as unknown[]).length} → ${validMessages.length} valid messages`
  );

  let lastUserMessage = validMessages.filter((m) => m.role === 'user').pop();

  // === Promote a bare paste to the prompt ===
  // The composer converts a large paste into a synthetic text attachment; sent
  // with an empty textarea, the paste IS the prompt. Left as an attachment it
  // lands in the untrusted-material channel, whose hierarchy rule forbids
  // executing instructions found there — the model then correctly answers "du
  // hast mir keine Aufgabe gestellt" (QA 08/2026). Text pasted into the
  // composer is the user's own input, so with no other prompt text it becomes
  // the user message itself (classifier, title, persistence and prompts all see
  // it); alongside typed text it stays reference material as before.
  let effectiveAttachments = attachments as ProcessedAttachment[] | undefined;
  let promptIsPastedText = false;
  if (lastUserMessage) {
    const promotion = extractPromotablePasteText(
      effectiveAttachments,
      extractTextContent(lastUserMessage.content)
    );
    if (promotion) {
      lastUserMessage.content = promotion.pasteText;
      effectiveAttachments = promotion.remaining;
      promptIsPastedText = true;
      log.info('[StreamContext] Pasted text promoted to user prompt (composer text was empty)');
    }
  }

  // === Create thread if needed ===
  // Normalize null → undefined: contract schema uses .nullish() to accept
  // both, but downstream code is typed for string | undefined.
  let actualThreadId: string | undefined = threadId ?? undefined;
  // A non-UUID id (local sentinel for an unsaved thread) can't be looked up or
  // stored — drop it so the create-thread branch below mints a real one and
  // reports it back via `thread_created`. Logged: a client that persistently
  // sends sentinels (e.g. an aui-internal "__LOCALID_..." leaking through the
  // adapter) creates a new thread on EVERY message, which looks like lost chat
  // history — this line is the observable trace of that failure mode.
  if (actualThreadId && !UUID_RE.test(actualThreadId)) {
    log.warn(`[StreamContext] Dropping non-UUID threadId "${actualThreadId}" — minting new thread`);
    actualThreadId = undefined;
  }
  let isNewThread = false;
  // Placeholder assistant row for turn persistence — minted just below, after
  // the user message is written (so ordering stays user → assistant).
  let pendingAssistantMessageId: string | null = null;
  let userMessageId: string | null = null;

  if (!actualThreadId && lastUserMessage) {
    // Titles are user-visible — never show raw mention tokens.
    const userText = sanitizeMentionTokens(extractTextContent(lastUserMessage.content), 'label');
    const thread = await createThread(
      userId,
      agentId ?? 'gruenerator-universal',
      userText.slice(0, 50) + (userText.length > 50 ? '...' : '') || 'Neue Unterhaltung'
    );
    actualThreadId = thread.id;
    isNewThread = true;
    sse.send('thread_created', { threadId: actualThreadId });
  }

  // Earlier user messages can arrive with no text at all (see historyBackfill);
  // the persisted rows still have it. Runs before this turn's own message is
  // written, so the persisted list is exactly the prior history. Only pay for the
  // query when a message is actually empty.
  if (
    actualThreadId &&
    !isNewThread &&
    validMessages.some(
      (m, i) =>
        m.role === 'user' &&
        i < validMessages.length - 1 &&
        extractTextContent(m.content).length === 0
    )
  ) {
    try {
      const filled = backfillEmptyUserMessages(
        validMessages as ModelMessage[],
        await getUserMessageTexts(actualThreadId)
      );
      log.info(`[StreamContext] Restored ${filled} empty user message(s) from the thread`);
    } catch (err) {
      // A turn without its own history is degraded, not broken.
      log.warn('[StreamContext] Could not restore empty user messages (continuing):', err);
    }
  }

  if (actualThreadId && lastUserMessage) {
    if (!isNewThread) {
      if (!(await canAccessThread(ThreadId(actualThreadId), UserId(userId)))) {
        // The client-supplied threadId is gone or not accessible — most often a
        // freshly-created empty thread reaped by the sidebar's auto-cleanup race
        // mid-send, or a stale client id. Recover gracefully by minting a new
        // thread for this user instead of hard-erroring. Safe: a foreign/deleted
        // id is never reused, we always create a fresh user-owned thread.
        //
        // The recovery is invisible to the user, so leave a breadcrumb: without
        // it we lose all signal on how often the reap race still fires (e.g. if
        // the client's 60s protection window proves too short).
        captureSseError({
          code: 'thread-reaped-recovered',
          message: 'Thread not found mid-send; minted a fresh thread to recover',
          level: 'warning',
          extras: { staleThreadId: actualThreadId, userId, agentId },
        });
        const userText = sanitizeMentionTokens(
          extractTextContent(lastUserMessage.content),
          'label'
        );
        const thread = await createThread(
          userId,
          agentId ?? 'gruenerator-universal',
          userText.slice(0, 50) + (userText.length > 50 ? '...' : '') || 'Neue Unterhaltung'
        );
        actualThreadId = thread.id;
        isNewThread = true;
        sse.send('thread_created', { threadId: actualThreadId });
      }
    }

    // Seed message (Antrag / PM / Social text) — persisted BEFORE the user
    // message so order is seed → user → assistant-reply. New threads only.
    if (
      isNewThread &&
      typeof rawInitialAssistantMessage === 'string' &&
      rawInitialAssistantMessage
    ) {
      await createMessage(
        actualThreadId,
        'assistant',
        rawInitialAssistantMessage,
        { seed: true },
        userId
      );
    }

    // Regenerate / edit-resubmit: replace the last turn instead of appending,
    // so chat_messages stays linear (no duplicate user rows / orphaned replies).
    // Never truncates a brand-new thread (nothing to replace there).
    if (!isNewThread) {
      if (rawReplaceFromMessageId) {
        // Same 22P02 trap the thread id is guarded against above, one field
        // over and unguarded until 13.08.2026: the client sent "Xa4ZTed" — a
        // slug suffix, not a row id — Postgres threw on `WHERE id = $2`, and
        // the exception took the whole turn with it ("Es ist ein interner
        // Fehler aufgetreten"), before a single token was written.
        //
        // A non-UUID id is exactly the case the fallback below already handles:
        // it names no persisted row. Route it there instead of to SQL.
        const removed = UUID_RE.test(rawReplaceFromMessageId)
          ? await deleteMessagesFrom(actualThreadId, rawReplaceFromMessageId)
          : 0;
        // In-session messages carry an AUI id that isn't a persisted row → the
        // delete matches nothing; fall back to dropping the trailing reply.
        if (removed === 0) await deleteTrailingAssistant(actualThreadId);
      } else if (rawRegenerate) {
        await deleteTrailingAssistant(actualThreadId);
      }
    }

    // Regenerate keeps the existing (unchanged) user message; re-persisting it
    // would duplicate the row. Edit-resubmit removed it above, so write it fresh.
    if (!rawRegenerate) {
      const userText = extractTextContent(lastUserMessage.content);
      userMessageId = await createMessage(
        actualThreadId,
        'user',
        userText,
        rawRoleName ? { roleName: rawRoleName } : undefined,
        userId
      );
    }

    // Turn persistence: sweep this thread's empty streaming orphans (leftovers
    // from an earlier crash; rows with partial text survive as aborted turns),
    // then mint a fresh placeholder assistant row the stream fills as it runs.
    // Best-effort — a failure here just means the turn runs like it did before.
    try {
      await deleteEmptyStreamingRows(actualThreadId);
      pendingAssistantMessageId = await createPendingAssistantMessage(actualThreadId, userId);
    } catch (err) {
      log.warn('[StreamContext] Failed to create pending assistant row (continuing):', err);
      pendingAssistantMessageId = null;
    }
  }

  // Raw (token-bearing) text is persisted above; everything downstream —
  // classifier, heuristics, memory query, LLM prompts — sees the readable
  // "@Label" form. Tokens never reach a prompt.
  const lastUserTextRaw = lastUserMessage ? extractTextContent(lastUserMessage.content) : '';
  validMessages = validMessages.map(sanitizeMessageMentions);
  lastUserMessage = validMessages.filter((m) => m.role === 'user').pop();

  // Light progress ping so the UI shows "Verstehe Anfrage…" immediately,
  // instead of looking frozen during attachment processing + memory fetch
  // + classification (collectively 1–8s on a cold path).
  const classifyStepId = `classify_${Date.now()}`;
  sse.send('progress_step', {
    stepId: classifyStepId,
    toolName: 'classify',
    title: 'Verstehe Anfrage…',
    status: 'in_progress',
  });

  // === Process attachments ===
  const {
    attachmentContext: derivedAttachmentContext,
    imageAttachments,
    processedMeta,
    pdfFormCandidates,
  } = await processAttachments(effectiveAttachments, requestId);

  // Merge any client-injected context (e.g. docs editor markdown + selection)
  // with what processAttachments derived from uploaded files.
  const clientAttachmentContext =
    (rawClientAttachmentContext as string | null | undefined)?.trim() || undefined;
  const attachmentContext =
    clientAttachmentContext && derivedAttachmentContext
      ? `${clientAttachmentContext}\n\n---\n\n${derivedAttachmentContext}`
      : clientAttachmentContext || derivedAttachmentContext;

  const inlineMaterial = inlineMaterialAttachment(
    lastUserMessage ? extractTextContent(lastUserMessage.content) : '',
    {
      regenerate: !!rawRegenerate,
      hasDocumentAttachment: processedMeta.some((m) => !m.isImage),
      // Nur für Pipeline-Agenten. Ein gewöhnlicher Chat liest die Nachricht im
      // Verlauf ohnehin wieder; er braucht die Zeile nicht — bekäme aber mit ihr
      // für jeden 200-Zeichen-Paste eine Anhang-Zeile, einen Zusammenfassungs-
      // Aufruf im Hintergrund (ab 100 Zeichen) und den eigenen Text ab dann als
      // „FRÜHERE DOKUMENTE" zurück. Die Kette dagegen misst gegen den
      // Ausgangstext und braucht ihn auch im Folge-Turn, der nichts mitbringt.
      promoted: promptIsPastedText && !!getPipelineAgent(agentId),
    }
  );
  if (inlineMaterial) {
    processedMeta.push(inlineMaterial);
    log.info(
      `[StreamContext] Carrying ${inlineMaterial.extractedText?.length ?? 0}c of inline material forward as a document`
    );
  }

  const docAttachments = effectiveAttachments?.filter((a) => !a.isImage) ?? [];

  const previousAttachments = actualThreadId ? await getThreadAttachments(actualThreadId, 5) : [];

  // Tabular files (this turn or earlier) are bridged into the in-browser pandas
  // interpreter by the composer — flag it so respondNode steers the model to
  // compute over `df` instead of doing unreliable mental math.
  const hasTabularAttachment =
    docAttachments.some((a) => isTabularAttachment(a.name, a.type)) ||
    previousAttachments.some((a) => isTabularAttachment(a.name, a.mimeType));

  // Raw bytes of this turn's FILLABLE PDFs, for the PDF form tools — built by
  // attachmentProcessing at the site of its AcroForm probe (#2835), so a
  // non-form PDF never mounts read_pdf_form/fill_pdf_form on its upload turn.
  // Deliberately NOT derived from `docAttachments` here: any pairing against a
  // second list (by name or position) is attackable via name collisions or the
  // client-sent `isImage` flag.
  const pdfFormAttachments = pdfFormCandidates;

  // Large prose attachments from earlier turns were embedded into Qdrant — route
  // their document ids through the existing document-chat retrieval fan-out so
  // follow-up questions pull the relevant chunks per query (RAG), instead of the
  // now-skipped full-text injection.
  const embeddedAttachmentDocIds = previousAttachments
    .filter((a) => a.documentId)
    .map((a) => a.documentId as string);
  const mergedDocumentChatIds = [
    ...new Set([...(rawDocumentChatIds ?? []), ...embeddedAttachmentDocIds]),
  ];

  // === Memory retrieval (explicit user memory) ===
  // Honor the profile switch (profiles.memory_enabled): off means no block in
  // the prompt and no `memory` tool in the catalog (toolCatalog.ts).
  const memoryEnabled = user.memory_enabled ?? true;
  let memoryContext: string | null = null;
  let memories: RenderedMemory[] = [];
  let memoryRetrieveTimeMs = 0;

  if (lastUserMessage && memoryEnabled) {
    try {
      const memoryStartTime = Date.now();
      const turn = await withTimeout(
        loadTurnMemories(userId, sanitizeMentionTokens(lastUserTextRaw, 'remove')),
        EXTERNAL_CONTEXT_TIMEOUT_MS,
        'memory lookup'
      );
      memories = numberMemories(turn);
      memoryContext = memories.length > 0 ? renderMemoryLines(memories) : null;
      memoryRetrieveTimeMs = Date.now() - memoryStartTime;
      if (memories.length > 0) {
        log.info(
          `[${requestId}] Memory: ${turn.anweisungen.length} Anweisungen, ${turn.fakten.length} Fakten im Prompt`
        );
      }
    } catch (memError) {
      log.warn(`[${requestId}] Memory retrieval failed (continuing without):`, memError);
    }
  }

  // === Read user profile instructions ===
  // Nur der selbst geschriebene Teil. Was der Rollen-Wizard früher in dieselbe
  // Spalte geschrieben hat — eine Liste aller verfügbaren Rollen — läuft nicht
  // mehr in jeder Anfrage mit; die Rolle wirkt allein über den Rollen-Chat.
  const userInstructions = stripRoleBlock(user.custom_prompt) || undefined;

  // === Rollen-Chat: Systemprompt server-seitig auflösen ===
  // Der Client schickt nur die Referenz. Der Auftrag zur Rolle ist parteiintern
  // und liegt in INTERN_CONTENT_DIR/rollen — er darf den Server nicht verlassen,
  // dieselbe Grenze wie bei den Rezepten. `rawCustomSystemPrompt` bleibt der
  // Weg für frei eingetippte Rollen und für Bestandsdaten, die den Text noch
  // mitschicken.
  let customSystemPrompt = rawCustomSystemPrompt ?? undefined;
  // Katalogrolle mit Baustein (statt frei getippter Persona): das Rezept-
  // Selbstladen im Loop bleibt dann AN — siehe resolveCustomSystemPrompt.
  let roleBausteinActive = false;
  // Die ganze Rollenliste, nicht nur die referenzierte: der Rezept-Katalog
  // leitet daraus die Landesverbands-Zuteilung ab, und die gilt in jedem Turn —
  // auch in einem ohne gewählte Rolle.
  //
  // Ein fehlendes Feld wird zur leeren Liste, nicht zu `null`: anders als das
  // Frontend, das vor der Hydratation ehrlich nichts weiß, hat der Server den
  // Nutzerdatensatz in der Hand. „Kein Eintrag" ist hier eine Antwort — keine
  // Rolle, also keine LV-Rezepte.
  //
  // Gelesen wird aus der Profiltabelle, NICHT aus `user`: das Sitzungsobjekt
  // führt `user_defaults` gar nicht — siehe `services/roles/userRoles.ts`.
  const userRoles: UserRole[] = await loadUserRoles(userId);
  if (rawRoleRef) {
    const role = findRole(userRoles, rawRoleRef);
    if (!role) {
      log.warn(
        `[${requestId}] roleRef ${rawRoleRef.ebene}/${rawRoleRef.rolle} findet keine ` +
          'gespeicherte Rolle — der Turn läuft mit dem Basis-Agenten.'
      );
    } else {
      const resolved = resolveCustomSystemPrompt(
        role,
        user.locale ?? 'de-DE',
        rawCustomSystemPrompt
      );
      customSystemPrompt = resolved.prompt;
      roleBausteinActive = resolved.fromBaustein;
    }
  }

  // === Resolve context window for model-aware budgets ===
  const contextWindowTokens = getContextWindow(modelId);

  // === Initialize state ===
  const initialState = await initializeChatState({
    messages: validMessages,
    threadId: actualThreadId,
    agentId: agentId ?? 'gruenerator-universal',
    userId,
    enabledTools: enabledTools ?? {
      search: true,
      web: true,
      person: true,
      examples: true,
      research: true,
      image: true,
      image_edit: true,
      memory: true,
    },
    attachmentContext: attachmentContext ?? undefined,
    imageAttachments: imageAttachments.length > 0 ? imageAttachments : undefined,
    threadAttachments: previousAttachments.length > 0 ? previousAttachments : undefined,
    hasTabularAttachment,
    ...(pdfFormAttachments.length > 0 && { pdfFormAttachments }),
    clientCanRunPython: clientTools?.includes('run_python') ?? false,
    computedResult: rawComputedResult ?? undefined,
    notebookIds: notebookIds.length > 0 ? notebookIds : undefined,
    notebookDocumentIds: notebookDocumentIds.length > 0 ? notebookDocumentIds : undefined,
    defaultNotebookId,
    defaultNotebookDocumentIds:
      defaultNotebookDocumentIds.length > 0 ? defaultNotebookDocumentIds : undefined,
    documentIds: rawDocumentIds?.length ? rawDocumentIds : undefined,
    documentChatIds: mergedDocumentChatIds.length
      ? mergedDocumentChatIds
      : docAttachments.length > 0 || documentChatMode
        ? []
        : undefined,
    boardIds: mergedBoardIds.length ? mergedBoardIds : undefined,
    sheetIds: mergedSheetIds.length ? mergedSheetIds : undefined,
    wolkeFiles,
    cloudConnectionCount,
    connectFiles,
    attachedWebpageUrls: rawWebpageUrls?.length ? rawWebpageUrls : undefined,
    // When the docs editor sends a currentDocument, also surface its id as a
    // doc-mention so the existing modify_doc / summary intent paths activate
    // (they key off `hasDocMentions`). Explicit @doc mentions always take
    // precedence — we only fall back to currentDocument.id otherwise.
    docMentionIds: mergedDocMentionIds.length
      ? mergedDocMentionIds
      : rawCurrentDocument?.id
        ? [rawCurrentDocument.id]
        : undefined,
    currentDocument: rawCurrentDocument
      ? {
          id: rawCurrentDocument.id,
          title: rawCurrentDocument.title ?? null,
          markdown: rawCurrentDocument.markdown,
          selectionText: rawCurrentDocument.selectionText ?? null,
        }
      : undefined,
    // Live board of the boards-editor sidebar. Without it the graph state has
    // no board, so the classifier's edit_current_board fast-path never fires and
    // the loop's `edit_document` tool aborts with "Es ist kein Board geöffnet" —
    // the router only ever read `currentBoard` off the raw body.
    currentBoard: rawCurrentBoard ?? undefined,
    userLocale: user.locale ?? 'de-DE',
    clientPlatform: rawPlatform ?? 'web',
    customSystemPrompt,
    roleBausteinActive,
    userRoles,
    // Token first, body second — same precedence as every other mention field:
    // the durable `skill:`-token names what THIS message ordered, the body
    // field is the store's ambient choice (and the only carrier old clients
    // have, so it stays honored).
    activeSkillMention: mentionTokenFields.skillMention ?? rawActiveSkillMention ?? undefined,
    userInstructions,
    contextWindowTokens,
  });

  const userLocale = user.locale ?? 'de-DE';
  log.info(`[ChatGraph] User ${userId} locale: ${userLocale}`);

  initialState.agentConfig.userId = userId;
  // Thread tool memory for the classifier: which tool family the previous
  // substantive turn used ("@tally" is stripped from message text on send, so
  // this is the only carrier a vague follow-up has). Non-fatal on failure.
  let threadToolHistory: ThreadToolHistory | null = null;
  if (actualThreadId && !isNewThread) {
    // The single slot and the full list, in one round trip. The list is what a
    // follow-up gets matched against when the thread holds several artifacts —
    // the slot only ever remembers the newest one.
    const [toolContext, history] = await Promise.all([
      getThreadToolContext(actualThreadId).catch(() => null),
      // Eine verlorene Artefakt-Liste heisst „Thread ohne Gedächtnis": der Turn
      // läuft mit dem heutigen Verhalten weiter, statt an einer Komfortfunktion
      // zu scheitern — dieselbe Abwägung wie in der Zeile darüber.
      // swallow-ok: best-effort Thread-Gedächtnis, Fallback ist das Ist-Verhalten
      readThreadToolHistory(actualThreadId).catch(() => null),
    ]);
    initialState.lastToolContext = toolContext;
    initialState.threadArtifacts = history?.artifacts() ?? [];
    // Weitergereicht statt verworfen: der agentische Loop las bis hierher
    // dieselben Zeilen ein zweites und drittes Mal (Tool-Replay und
    // Quellen-Rehydrierung). Bleibt es null, weil der Lesevorgang scheiterte,
    // liest der Loop selbst — der Ausfall bleibt so eng wie zuvor.
    threadToolHistory = history;
  }
  initialState.memoryEnabled = memoryEnabled;
  if (memoryContext) {
    initialState.memoryContext = memoryContext;
    initialState.memories = memories;
    initialState.memoryRetrieveTimeMs = memoryRetrieveTimeMs;

    // Event shape is frozen (shipped mobile binaries read it); `isPersona`
    // stays as a constant false, `category` now carries the memory kind.
    sse.send('memory_context', {
      memoryCount: memories.length,
      memories: memories.map((m) => ({ content: m.text, category: m.kind })),
      isPersona: false,
    });
  }

  // === Enrich context (documents, boards, mentions, vectorization) ===
  await enrichContext({
    initialState,
    userId,
    ...(rawDocumentIds != null && { rawDocumentIds }),
    ...(rawTextIds != null && { rawTextIds }),
    ...(mergedBoardIds.length > 0 && { rawBoardIds: mergedBoardIds }),
    ...(mergedSheetIds.length > 0 && { rawSheetIds: mergedSheetIds }),
    ...(mergedDocMentionIds.length > 0 && { rawDocMentionIds: mergedDocMentionIds }),
    docAttachments,
    processedMeta,
    contextWindowTokens,
    sse,
  });

  return {
    done: false,
    ctx: {
      requestId,
      userId,
      notebookIds,
      validMessages,
      lastUserMessage,
      actualThreadId,
      isNewThread,
      classifyStepId,
      imageAttachments,
      processedMeta,
      initialState,
      memoryContext,
      memoryRetrieveTimeMs,
      memoryEnabled,
      contextWindowTokens,
      mentionTokenFields,
      lastUserTextRaw,
      promptIsPastedText,
      pendingAssistantMessageId,
      threadToolHistory,
      userMessageId,
    },
  };
}

// ── Durable mention tokens ───────────────────────────────────────────────────

export interface MentionTokenFields {
  forcedTools: string[];
  notebookIds: string[];
  boardIds: string[];
  sheetIds: string[];
  docMentionIds: string[];
  /** Rezept/Textform aus einem `skill:`-Token — letzter gewinnt. */
  skillMention: string | null;
}

function unionIds(a: string[] | null | undefined, b: string[]): string[] {
  return [...new Set([...(a ?? []), ...b])];
}

function lastUserTextFromClient(clientMessages: unknown): string {
  if (!Array.isArray(clientMessages)) return '';
  for (let i = clientMessages.length - 1; i >= 0; i--) {
    const m = clientMessages[i] as {
      role?: string;
      parts?: Array<{ type?: string; text?: string }>;
      content?: unknown;
    };
    if (m?.role !== 'user') continue;
    if (Array.isArray(m.parts)) {
      return m.parts
        .filter((part) => part?.type === 'text' && typeof part.text === 'string')
        .map((part) => part.text)
        .join(' ');
    }
    return typeof m.content === 'string' ? m.content : '';
  }
  return '';
}

/**
 * Inverse of the client-side token mapping (mentionParser.mentionTokenFor):
 * derive the routing fields from durable tokens in the last user message.
 * `agent` tokens are skipped — the effective agent still travels via the body
 * (store-selected agent must win, and agent resolution is validated elsewhere).
 * `skill` tokens carry the chosen Rezept's MENTION; deriving it here is what
 * keeps the recipe alive on edit-resubmit, where the client parser skips
 * already-tokenized text and the body field has nothing to fall back on.
 */
function deriveMentionTokenFields(clientMessages: unknown): MentionTokenFields {
  const fields: MentionTokenFields = {
    forcedTools: [],
    notebookIds: [],
    boardIds: [],
    sheetIds: [],
    docMentionIds: [],
    skillMention: null,
  };
  for (const token of parseMentionTokens(lastUserTextFromClient(clientMessages))) {
    switch (token.type) {
      case 'tool':
        fields.forcedTools.push(token.id);
        break;
      case 'mcp':
        fields.forcedTools.push(`mcp:${token.id}`);
        break;
      case 'notebook':
        fields.notebookIds.push(token.id);
        break;
      case 'board':
        fields.boardIds.push(token.id);
        break;
      case 'sheet':
        fields.sheetIds.push(token.id);
        break;
      case 'doc':
        fields.docMentionIds.push(token.id);
        break;
      case 'agent':
        // Deliberately not derived — the body agentId stays authoritative.
        break;
      case 'skill':
        fields.skillMention = token.id;
        break;
      default: {
        const unhandled: never = token.type;
        void unhandled;
      }
    }
  }
  return fields;
}

/** Token → "@Label" on every text part; non-text parts stay untouched. */
function sanitizeMessageMentions<T extends { role: string; content: unknown }>(message: T): T {
  const { content } = message;
  // Token-free messages (the overwhelming majority) pass through by reference —
  // no per-request reallocation of the whole history.
  if (typeof content === 'string') {
    return hasMentionTokens(content)
      ? { ...message, content: sanitizeMentionTokens(content, 'label') }
      : message;
  }
  if (Array.isArray(content)) {
    const parts = content as Array<Record<string, unknown>>;
    const needsSanitize = parts.some(
      (part) =>
        part && part.type === 'text' && typeof part.text === 'string' && hasMentionTokens(part.text)
    );
    if (!needsSanitize) return message;
    return {
      ...message,
      content: parts.map((part) =>
        part && part.type === 'text' && typeof part.text === 'string'
          ? { ...part, text: sanitizeMentionTokens(part.text, 'label') }
          : part
      ),
    };
  }
  return message;
}
