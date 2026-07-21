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
import {
  hasMentionTokens,
  parseMentionTokens,
  sanitizeMentionTokens,
} from '@gruenerator/shared/utils';
import { convertToModelMessages } from 'ai';

import { initializeChatState } from '../../../agents/langgraph/ChatGraph/index.js';
import {
  isKnownNotebook,
  isUserNotebookId,
  resolveUserNotebookDocumentIds,
} from '../../../config/notebookCollectionMap.js';
import {
  getMem0Instance,
  normalizeCategory,
  formatMemoriesByCategory,
} from '../../../services/mem0/index.js';
import { getCachedPersona } from '../../../services/mem0/personaService.js';
import { recordItemUsageSafe } from '../../../services/usage/ItemUsageService.js';
import { getAIWorkerPool } from '../../../utils/getAIWorkerPool.js';
import { NextcloudShareManager } from '../../../utils/integrations/nextcloud/shareManager.js';
import { createLogger } from '../../../utils/logger.js';
import { captureSseError } from '../../../utils/observability/captureSseError.js';
import { ThreadId, UserId } from '../../../utils/types/branded.js';
import { withTimeout } from '../../../utils/withTimeout.js';
import { getContextWindow } from '../agents/providers.js';

import { getThreadAttachments } from './attachmentPersistenceService.js';
import { isTabularAttachment, processAttachments } from './attachmentProcessingService.js';
import { enrichContext } from './contextEnrichmentService.js';
import { extractTextContent, filterEmptyAssistantMessages } from './messageHelpers.js';
import { type createSSEStream, PROGRESS_MESSAGES } from './sseHelpers.js';
import { canAccessThread } from './threadAccessService.js';
import {
  getUser,
  createThread,
  createMessage,
  deleteMessagesFrom,
  deleteTrailingAssistant,
  getThreadToolContext,
} from './threadPersistenceService.js';

import type {
  ChatGraphInput,
  ProcessedAttachment,
} from '../../../agents/langgraph/ChatGraph/types.js';
import type { ServerInferRequest } from '@ts-rest/core';
import type { ModelMessage, UIMessage } from 'ai';
import type { Request } from 'express';

const log = createLogger('chatGraphContractRouter');

// Upper bound for best-effort external context calls (Mem0, Nextcloud) that
// run before the LLM stream starts — they add to time-to-first-token, so a
// hanging service must not stall the chat. On timeout the turn proceeds
// without that context.
const EXTERNAL_CONTEXT_TIMEOUT_MS = 3_000;

// chat_threads.id is a uuid column. A client may send a local-only sentinel id
// (e.g. "__LOCALID_..." from the lazy-thread-creation runtime, or the sheet /
// deck editor sidebars) for a thread it has not persisted yet — that is not a
// UUID and must never reach canAccessThread's `WHERE id = $1`, or Postgres
// throws 22P02 and the whole turn 500s. Treat any non-UUID id as "no thread
// yet" and mint a fresh one.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type StreamBody = ServerInferRequest<typeof chatGraphContract.stream>['body'];
type SSEStream = ReturnType<typeof createSSEStream>;
type ProcessAttachmentsResult = Awaited<ReturnType<typeof processAttachments>>;

/**
 * Everything Stage 1–4 of the stream pipeline read that is computed before
 * classification. Raw request-body fields stay on `body` and are read directly.
 */
export interface StreamContext {
  requestId: string;
  userId: string;
  aiWorkerPool: ReturnType<typeof getAIWorkerPool>;
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
    customSystemPrompt: rawCustomSystemPrompt,
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
  const aiWorkerPool = getAIWorkerPool(req);

  if (!aiWorkerPool) {
    sse.send('error', {
      error: PROGRESS_MESSAGES.aiUnavailable,
      code: 'provider_unavailable',
      retryable: true,
    });
    sse.end();
    return { done: true };
  }

  if ((clientMessages as unknown[]).length === 0) {
    sse.send('error', { error: PROGRESS_MESSAGES.messagesRequired, code: 'invalid_request' });
    sse.end();
    return { done: true };
  }

  const systemNotebookIds = mergedNotebookIds.filter(isKnownNotebook);
  const userNotebookUuids = mergedNotebookIds.filter(isUserNotebookId);
  const { documentIds: notebookDocumentIds, resolvedUserNotebookIds } =
    userNotebookUuids.length > 0
      ? await resolveUserNotebookDocumentIds(userId, userNotebookUuids)
      : { documentIds: [], resolvedUserNotebookIds: [] };
  const notebookIds = [...systemNotebookIds, ...resolvedUserNotebookIds];
  const defaultNotebookId =
    rawDefaultNotebookId && isKnownNotebook(rawDefaultNotebookId)
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
  try {
    modelMessages = (await convertToModelMessages(
      clientMessages as UIMessage[]
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
        const removed = await deleteMessagesFrom(actualThreadId, rawReplaceFromMessageId);
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
      await createMessage(
        actualThreadId,
        'user',
        userText,
        rawRoleName ? { roleName: rawRoleName } : undefined,
        userId
      );
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
  } = await processAttachments(attachments as ProcessedAttachment[] | undefined, requestId);

  // Merge any client-injected context (e.g. docs editor markdown + selection)
  // with what processAttachments derived from uploaded files.
  const clientAttachmentContext =
    (rawClientAttachmentContext as string | null | undefined)?.trim() || undefined;
  const attachmentContext =
    clientAttachmentContext && derivedAttachmentContext
      ? `${clientAttachmentContext}\n\n---\n\n${derivedAttachmentContext}`
      : clientAttachmentContext || derivedAttachmentContext;

  const docAttachments =
    (attachments as ProcessedAttachment[] | undefined)?.filter((a) => !a.isImage) ?? [];

  const previousAttachments = actualThreadId ? await getThreadAttachments(actualThreadId, 5) : [];

  // Tabular files (this turn or earlier) are bridged into the in-browser pandas
  // interpreter by the composer — flag it so respondNode steers the model to
  // compute over `df` instead of doing unreliable mental math.
  const hasTabularAttachment =
    docAttachments.some((a) => isTabularAttachment(a.name, a.type)) ||
    previousAttachments.some((a) => isTabularAttachment(a.name, a.mimeType));

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

  // === Memory retrieval (mem0) ===
  // Honor the user's memory toggle (profiles.memory_enabled): when off, skip both
  // retrieval here and the write-back in postResponseService.
  const memoryEnabled = user.memory_enabled ?? false;
  let memoryContext: string | null = null;
  let memoryRetrieveTimeMs = 0;
  let memoriesUsed: Array<{ content: string; category: string | null }> = [];

  const mem0 = getMem0Instance();
  if (mem0 && lastUserMessage && memoryEnabled) {
    try {
      const memoryStartTime = Date.now();

      const persona = await withTimeout(
        getCachedPersona(userId),
        EXTERNAL_CONTEXT_TIMEOUT_MS,
        'mem0 persona lookup'
      );
      if (persona) {
        memoryContext = persona;
        memoriesUsed = [{ content: '[Persona]', category: null }];
        log.info(`[${requestId}] Using cached persona for memory context`);
      } else {
        const userQuery = sanitizeMentionTokens(lastUserTextRaw, 'remove');
        const memories = await withTimeout(
          mem0.searchMemories(userQuery, userId, 5),
          EXTERNAL_CONTEXT_TIMEOUT_MS,
          'mem0 memory search'
        );
        if (memories.length > 0) {
          memoriesUsed = memories.map((m) => ({
            content: m.memory,
            category: normalizeCategory(m.metadata?.memoryType) ?? null,
          }));

          memoryContext = formatMemoriesByCategory(
            memories.map((m) => ({
              memory: m.memory,
              category: normalizeCategory(m.metadata?.memoryType),
            }))
          );
          log.info(`[${requestId}] Retrieved ${memories.length} memories for context`);
        }
      }

      memoryRetrieveTimeMs = Date.now() - memoryStartTime;
    } catch (memError) {
      log.warn(`[${requestId}] Memory retrieval failed (continuing without):`, memError);
    }
  }

  // === Read user profile instructions ===
  const userInstructions = user.custom_prompt?.trim() || undefined;

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
    },
    aiWorkerPool,
    attachmentContext: attachmentContext ?? undefined,
    imageAttachments: imageAttachments.length > 0 ? imageAttachments : undefined,
    threadAttachments: previousAttachments.length > 0 ? previousAttachments : undefined,
    hasTabularAttachment,
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
    userLocale: user.locale ?? 'de-DE',
    clientPlatform: rawPlatform ?? 'web',
    customSystemPrompt: rawCustomSystemPrompt ?? undefined,
    activeSkillMention: rawActiveSkillMention ?? undefined,
    userInstructions,
    contextWindowTokens,
  });

  const userLocale = user.locale ?? 'de-DE';
  log.info(`[ChatGraph] User ${userId} locale: ${userLocale}`);

  initialState.agentConfig.userId = userId;
  // Thread tool memory for the classifier: which tool family the previous
  // substantive turn used ("@tally" is stripped from message text on send, so
  // this is the only carrier a vague follow-up has). Non-fatal on failure.
  if (actualThreadId && !isNewThread) {
    initialState.lastToolContext = await getThreadToolContext(actualThreadId).catch(() => null);
  }
  if (memoryContext) {
    initialState.memoryContext = memoryContext;
    initialState.memoryRetrieveTimeMs = memoryRetrieveTimeMs;

    const isPersona = memoriesUsed.length === 1 && memoriesUsed[0].content === '[Persona]';
    sse.send('memory_context', {
      memoryCount: isPersona ? 1 : memoriesUsed.length,
      memories: isPersona ? [] : memoriesUsed,
      isPersona,
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
      aiWorkerPool,
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
 */
function deriveMentionTokenFields(clientMessages: unknown): MentionTokenFields {
  const fields: MentionTokenFields = {
    forcedTools: [],
    notebookIds: [],
    boardIds: [],
    sheetIds: [],
    docMentionIds: [],
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
