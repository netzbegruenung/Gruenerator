/**
 * Post-Response Service
 *
 * Handles everything that happens after the AI response is generated:
 * - Persist assistant message with metadata
 * - Touch thread timestamp
 * - Trigger async thread title generation for new threads
 * - Save attachment metadata
 */

import { intentToolNames } from '@gruenerator/shared/chat-intents';

import { renumberAnswerCitations } from '../../../agents/langgraph/ChatGraph/nodes/citationUtils.js';
import { upsertThreadRecallPoint } from '../../../services/chat/threadRecallEmbeddingService.js';
import { generateThreadTags } from '../../../services/chat/threadTagService.js';
import {
  generateThreadTitle,
  threadNeedsTitle,
} from '../../../services/chat/threadTitleService.js';
import { withRetry } from '../../../services/search/searchRetryStrategy.js';
import { createLogger } from '../../../utils/logger.js';
import { reportBackgroundError } from '../../../utils/reportBackgroundError.js';

import { MAX_SOURCES } from './agenticLoop/loopGuards.js';
import {
  embedThreadAttachmentForRag,
  RAG_ATTACHMENT_THRESHOLD_CHARS,
  saveThreadAttachment,
} from './attachmentPersistenceService.js';
import { isTabularAttachment } from './attachmentProcessingService.js';
import { extractTextContent } from './messageHelpers.js';
import {
  createMessage,
  finalizeAssistantMessage,
  setThreadToolContext,
  touchThread,
} from './threadPersistenceService.js';

import type { PersistedStep } from './agenticLoop/types.js';
import type { ProcessedAttachmentMeta } from './attachmentProcessingService.js';
import type { SharepicVariant } from './sharepicVariantHelpers.js';
import type {
  ChatGraphState,
  CreatedDocument,
  GeneratedImageResult,
  ResearchToolResult,
  SearchResult,
  SearchSource,
  ThreadToolContext,
} from '../../../agents/langgraph/ChatGraph/types.js';
import type { SocialPostToolResult } from '@gruenerator/contracts';
import type { ModelMessage } from 'ai';

const log = createLogger('PostResponse');

/**
 * What each intent PERSISTS as a tool call, so a reloaded thread rehydrates
 * with the same card it streamed. Derived from the intent registry, which the
 * client's live map (`packages/chat/src/lib/toolMappings.ts`) also derives
 * from — the two cannot drift any more.
 *
 * This map is a superset of the client's on purpose: artefact intents
 * (`image`, `sharepic`, …) persist a tool call, but the live
 * client renders them from their own SSE events (`sharepic_complete`,
 * `image_complete`, …) and has no use for the mapping. The registry expresses
 * that as a `persistTool` without a `uiTool`.
 */
export const INTENT_TO_TOOL: Record<string, string> = intentToolNames().persist;

/**
 * Strips the transient crawl payload before a result goes into the database.
 *
 * A crawled web result carries the SAME full page text under both `content` and
 * `fullContent` (searchNode spreads the crawler's object, then overwrites
 * `content` with it). Two crawled pages are ~160k chars of JSON per turn in
 * `chat_messages.tool_results`, and `getRecentThreadSources` reads all of it
 * back on the next turn — while its own docstring promises the content is
 * "already snippet-sized at persist time". `fullContent` has no reader after
 * the search stage, so nothing downstream loses anything.
 */
function forPersistence(r: SearchResult): SearchResult {
  if (!('fullContent' in r)) return r;
  const { fullContent: _dropped, ...rest } = r as SearchResult & { fullContent?: unknown };
  return rest as SearchResult;
}

/**
 * Result payload shape for non-research tool calls (search, web, examples).
 * The chat UI's generic result renderers read `result.results`. The examples
 * cards (`PressemitteilungExamplesCard`, generic `ToolCallUI`) additionally
 * read `result.examples`, so we attach a kind-specific list when present.
 */
interface SearchToolCallResult {
  results: SearchResult[];
  examples?: unknown[];
}

interface ImageToolCallResult {
  url: string;
  filename: string;
  prompt: string;
  style: string | null;
  generationTimeMs: number;
}

interface SharepicToolCallResult {
  variants: SharepicVariant[];
}

/** Shape the frontend `parseScrapeResult` reads for the link-preview card. */
interface ScrapeToolCallResult {
  content: string;
}

type ToolCallResult =
  | SearchToolCallResult
  | ResearchToolResult
  | ImageToolCallResult
  | SharepicToolCallResult
  | ScrapeToolCallResult
  | SocialPostToolResult;

interface PersistedToolCall {
  toolCallId: string;
  toolName: string;
  args: { query?: string; url?: string };
  result: ToolCallResult;
}

/**
 * Build the result payload for a single tool call.
 * Research intent gets the rich `ResearchToolResult` shape that
 * `ResearchResultUI` expects (answer/citations/confidence/searchSteps).
 * Image/sharepic intents get their respective shapes so the corresponding
 * cards rehydrate on thread reload. All other intents get the generic
 * `{ results }` shape.
 */
function buildToolCallResult(
  toolName: string,
  finalState: ChatGraphState,
  generatedImage: GeneratedImageResult | null,
  sharepicVariants: SharepicVariant[]
): ToolCallResult {
  if ((toolName === 'image_generate' || toolName === 'image_edit') && generatedImage) {
    return {
      url: generatedImage.url,
      filename: generatedImage.filename,
      prompt: generatedImage.prompt,
      style: generatedImage.style,
      generationTimeMs: generatedImage.generationTimeMs,
    };
  }
  if (toolName === 'sharepic') {
    return { variants: sharepicVariants };
  }
  const base: SearchToolCallResult = {
    results: finalState.searchResults?.slice(0, 10) || [],
  };
  // Per-kind rich list for the examples cards (PressemitteilungExamplesCard
  // reads result.examples with {title, body, lv, url}; generic ToolCallUI
  // reads result.examples for social posts too).
  const ex = finalState.examplesResult;
  if (ex) {
    if (toolName === 'gruenerator_pressemitteilung_examples' && ex.press) {
      base.examples = ex.press;
    } else if (toolName === 'gruenerator_examples_search' && ex.social) {
      base.examples = ex.social;
    }
  }
  return base;
}

function buildToolCalls(
  classifiedState: ChatGraphState,
  finalState: ChatGraphState,
  generatedImage: GeneratedImageResult | null,
  sharepicVariants: SharepicVariant[]
): PersistedToolCall[] | undefined {
  const toolName = INTENT_TO_TOOL[finalState.intent];
  if (!toolName) return undefined;

  // scrape_url renders a link-preview card per crawled page. The frontend parser
  // reads `args.url` + `result.content`, so emit one tool call per result rather
  // than the generic {query}/{results} shape.
  if (toolName === 'scrape_url') {
    const crawled = (finalState.searchResults || []).filter((r) => r.url);
    if (crawled.length === 0) return undefined;
    return crawled.slice(0, 5).map((r, idx) => ({
      toolCallId: `tc_${Date.now()}_${idx}`,
      toolName: 'scrape_url',
      args: { url: r.url as string },
      result: { content: r.content || '' },
    }));
  }

  const subQueries = classifiedState.subQueries;
  const searchSources: SearchSource[] = classifiedState.searchSources || [];
  const hasMultiSearch = (subQueries && subQueries.length > 0) || searchSources.length > 1;

  if (hasMultiSearch) {
    const queries = subQueries?.length ? subQueries : [classifiedState.searchQuery || ''];
    const sources: (SearchSource | null)[] = searchSources.length > 1 ? searchSources : [null];
    const toolCalls: PersistedToolCall[] = [];
    let idx = 0;
    for (const q of queries) {
      for (const src of sources) {
        const tn =
          src === 'web' ? 'web_search' : src === 'documents' ? 'gruenerator_search' : toolName;
        toolCalls.push({
          toolCallId: `tc_${Date.now()}_${idx++}`,
          toolName: tn,
          args: { query: q },
          result: buildToolCallResult(tn, finalState, generatedImage, sharepicVariants),
        });
      }
    }
    return toolCalls;
  }

  return [
    {
      toolCallId: `tc_${Date.now()}`,
      toolName,
      args: { query: classifiedState.searchQuery || '' },
      result: buildToolCallResult(toolName, finalState, generatedImage, sharepicVariants),
    },
  ];
}

export interface PersistParams {
  threadId: string;
  userId: string;
  fullText: string;
  finalState: ChatGraphState;
  classifiedState: ChatGraphState;
  generatedImage: GeneratedImageResult | null;
  sharepicVariants: SharepicVariant[];
  /** Presentation/sheet created by a compound loop turn — persisted as message
   *  metadata so the document card rehydrates on reload. */
  createdDocument?: CreatedDocument | null;
  isNewThread: boolean;
  lastUserMessage: ModelMessage;
  processedMeta: ProcessedAttachmentMeta[];
  requestId: string;
  /** Whether the user has the memory beta feature enabled (profiles.memory_enabled). */
  /** Effective agent that produced this response; persisted so the agent
   *  avatar/badge rehydrates on thread reload. Null/omitted for the default
   *  universal chat (no badge). */
  agentId?: string | null;
  /** Real tool steps from the agentic loop. When present they are persisted
   *  as-is (they already carry the per-tool result shapes the UI cards read),
   *  replacing the intent-fabricated tool calls. */
  agenticSteps?: PersistedStep[];
  /** Langfuse trace id for this turn; persisted so the thumbs feedback button
   *  still targets the right trace after a reload. */
  traceId?: string;
  /** Placeholder assistant row minted before streaming (WP-B). When present the
   *  final content+metadata are written by flipping THIS row to 'complete'
   *  instead of inserting a new one. Null/omitted → insert as before. */
  pendingMessageId?: string | null;
  /** Current persisted user row; links this turn's attachments to its bubble. */
  userMessageId?: string | null;
}

/**
 * Which tool family this turn actually used (see ThreadToolContext). Artefacts
 * take precedence over intents (a compound research turn that produced a sheet
 * is a "sheet" turn). Returns null for plain turns — the caller then leaves the
 * previous thread context untouched.
 */
function deriveToolContext(p: {
  finalState: ChatGraphState;
  classifiedState: ChatGraphState;
  generatedImage: GeneratedImageResult | null;
  sharepicVariants: SharepicVariant[];
  createdDocument: CreatedDocument | null;
  agenticSteps?: PersistedStep[] | undefined;
}): ThreadToolContext | null {
  if (p.generatedImage) return { kind: 'image' };
  if (p.sharepicVariants.length > 0) return { kind: 'sharepic' };
  if (p.createdDocument) {
    const sub = p.createdDocument.subtype;
    // 'pdf' must be matched BEFORE the 'document' default. Without it a created
    // PDF was stored as {kind:'document', ref:'<uuid>.pdf'}, and the classifier's
    // Tier-2.7 doc-edit gate then emitted modify_doc carrying an asset FILE NAME
    // where a collaborative-document UUID was expected.
    const kind = sub.startsWith('presentation')
      ? 'presentation'
      : sub.startsWith('sheet')
        ? 'sheet'
        : sub.startsWith('pdf')
          ? 'pdf'
          : 'document';
    return { kind, ref: p.createdDocument.documentId, label: p.createdDocument.title };
  }
  const mcpStep = p.agenticSteps?.find((s) => s.serverName);
  if (p.finalState.intent === 'mcp' || mcpStep) {
    return {
      kind: 'mcp',
      ref: p.finalState.mcpServerScope ?? null,
      label: mcpStep?.serverName ?? null,
    };
  }
  if (p.finalState.intent === 'bundestag' || p.finalState.intent === 'abgeordnetenwatch') {
    return { kind: p.finalState.intent };
  }
  if (p.classifiedState.isCompound) return { kind: 'notebook' };
  return null;
}

/**
 * Persist the assistant response and handle all post-response side effects.
 */
/**
 * Outcome of a persistence attempt. `ok: false` means the user's turn is NOT
 * in the database — the caller must tell the user (the answer looked fine
 * live, but it is gone on reload).
 *
 * `discarded: true` is a distinct, expected case within `ok: true`: the
 * pending row was deleted by a concurrent regenerate/edit before this turn's
 * generation finished, so it's intentionally not persisted (re-inserting
 * would resurrect a turn the user already discarded) — but the caller still
 * needs to tell the client, or a fully-generated turn leaves the UI stuck on
 * a loading state with no explanation.
 */
export interface PersistOutcome {
  ok: boolean;
  discarded?: boolean;
}

/**
 * Retry a message write once. DB writes fail transiently (connection reset,
 * failover, brief pool exhaustion) far more often than they fail permanently,
 * and the cost of a duplicate attempt is far lower than losing the turn.
 * `isRecoverable: () => true` because Postgres errors don't carry the
 * HTTP-ish markers `isRecoverableError` classifies on.
 */
async function withMessageWriteRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  return withRetry(fn, {
    maxRetries: 1,
    delayMs: 300,
    isRecoverable: () => true,
    label: `persist:${label}`,
  });
}

export async function persistAssistantResponse(params: PersistParams): Promise<PersistOutcome> {
  const {
    threadId,
    userId,
    fullText,
    finalState,
    classifiedState,
    generatedImage,
    sharepicVariants,
    createdDocument,
    isNewThread,
    lastUserMessage,
    processedMeta,
    agentId,
    agenticSteps,
    traceId,
    pendingMessageId,
    userMessageId,
  } = params;

  if (
    !threadId ||
    (!fullText && !generatedImage && sharepicVariants.length === 0 && !createdDocument)
  )
    return { ok: true };

  // Gapless citation numbers on the persisted turn. The prompt hands the model
  // 1..N and it cites a subset, so the stored text and chips kept whatever holes
  // the answer left (observed: 1, 2, 4 against four sources). The notebook path
  // has done this since #2137; this is the web path's half.
  const { text: persistedText, citations: persistedCitations } = renumberAnswerCitations(
    fullText,
    finalState.citations ?? []
  );

  try {
    // Agentic loop: persist the real executed steps (already in the
    // {toolCallId, toolName, args, result} shape the cards rehydrate from)
    // instead of fabricating tool calls from the intent.
    const toolCalls =
      agenticSteps && agenticSteps.length > 0
        ? agenticSteps
        : buildToolCalls(classifiedState, finalState, generatedImage, sharepicVariants);
    const metadata: Record<string, unknown> = {
      intent: finalState.intent,
      searchCount: finalState.searchCount,
      // Persisted so the thumbs feedback button survives a reload (it targets
      // this trace id).
      ...(traceId && { traceId }),
      // Only stamp a real agent — the universal default carries no badge, so
      // reload matches the live stream (which sets agentInfo only for agents).
      ...(agentId && agentId !== 'gruenerator-universal' ? { agentId } : {}),
      citations: persistedCitations,
      searchResults: finalState.searchResults?.slice(0, MAX_SOURCES).map(forPersistence) || [],
      // Image hits, so a reloaded turn still shows what it found. Stored BARE —
      // the `proxyUrl` handle is deliberately NOT persisted: it is a signed 24h
      // capability and a database row outlives it. The load path mints a fresh
      // one (messagesController), which also keeps the "signed at the moment of
      // handing out" rule true on reload.
      ...(finalState.webImageResults?.length ? { searchImages: finalState.webImageResults } : {}),
      generatedImage: generatedImage
        ? {
            url: generatedImage.url,
            filename: generatedImage.filename,
            prompt: generatedImage.prompt,
            style: generatedImage.style,
            generationTimeMs: generatedImage.generationTimeMs,
          }
        : undefined,
      // Presentation/sheet from a compound loop turn — same metadata shape the
      // single-pass handlers persist, so the document card rehydrates on reload.
      ...(createdDocument && { createdDocument }),
      // The spec a `create_pdf` tool call rendered from. PDF_SPEC persists the
      // same key on the single-pass path; both doors must store it, or a later
      // "ändere das PDF" finds nothing to build on (see loadLastPdfSpec).
      ...(finalState.createdPdfSpec != null && { pdfSpec: finalState.createdPdfSpec }),
      // Deterministic calculation (computeNode / run_python) incl. base64
      // figures/files (capped) so the Berechnung card survives reloads. Gated
      // on computedResultFresh: clients forward the LAST result with every
      // follow-up request, and without the gate every later message in the
      // thread would persist a stale copy of the card.
      ...(finalState.computedResult != null &&
        finalState.computedResultFresh && { computeData: finalState.computedResult }),
      // Rezept-Attribution, damit die dezente Ausweisung („Rezept: PM Hessen")
      // einen Reload überlebt — gleiche Daten wie auf dem `done`-Event.
      ...(finalState.usedRecipes?.length && { recipesUsed: finalState.usedRecipes }),
      toolCalls,
    };

    if (pendingMessageId) {
      // Finalize the placeholder row minted before streaming. A miss means the
      // row is gone (e.g. a regenerate from another tab deleted it) — do NOT
      // re-insert (that would resurrect a turn the user discarded); tell the
      // caller via `discarded` so it can signal the client instead of leaving
      // it waiting on a turn that will never arrive.
      const matched = await withMessageWriteRetry(
        () => finalizeAssistantMessage(pendingMessageId, persistedText || null, metadata),
        'finalizeAssistantMessage'
      );
      if (!matched) {
        log.warn(
          `[ChatGraph] Pending assistant row ${pendingMessageId} vanished before finalize — response discarded (thread ${threadId})`
        );
        return { ok: true, discarded: true };
      }
    } else {
      await withMessageWriteRetry(
        () => createMessage(threadId, 'assistant', persistedText || null, metadata),
        'createMessage'
      );
    }

    if (toolCalls) {
      log.debug(
        `[ChatGraph] Persisted ${toolCalls.length} toolCall(s): ${toolCalls.map((tc) => tc.toolName).join(', ')}, results=${finalState.searchResults?.length ?? 0}`
      );
    }

    // Thread tool memory: remember which tool family this turn used so a vague
    // follow-up (mentions are stripped from message text) can route back to it.
    // Only written when a tool was actually used — plain turns keep the prior
    // context (sticky semantics, like last_mcp_server_id).
    const toolContext = deriveToolContext({
      finalState,
      classifiedState,
      generatedImage,
      sharepicVariants,
      createdDocument: createdDocument ?? null,
      agenticSteps,
    });
    if (toolContext) {
      void setThreadToolContext(threadId, toolContext).catch((err) =>
        log.warn('[ChatGraph] Failed to persist thread tool context:', err)
      );
    }

    await touchThread(threadId);

    // `isNewThread` alone is the wrong gate: it is only true when the client
    // sent NO threadId, and the web client creates the thread up front via
    // `initialize()` (POST /threads, title NULL) — so for every browser chat it
    // is false and this whole block used to be dead. The title then hung
    // entirely on the client's own generate-title call, which silently does not
    // happen when the first message carries no text of its own (pasted text
    // travels as an attachment). Ask the row instead: an unnamed thread gets a
    // title here, on every turn, no matter which client wrote it.
    // A failed lookup must not take the turn down with it: the message is
    // already persisted at this point, and a missing title is a cosmetic loss.
    const needsSeeding =
      isNewThread ||
      (await threadNeedsTitle(threadId).catch((err) => {
        log.warn('[ChatGraph] Title-needed lookup failed, falling back to isNewThread:', err);
        return false;
      }));
    log.info(
      `[ChatGraph] Title generation check: isNewThread=${isNewThread}, needsSeeding=${needsSeeding}, hasLastUserMessage=${!!lastUserMessage}, threadId=${threadId}`
    );
    if (needsSeeding && lastUserMessage) {
      const userText = extractTextContent(lastUserMessage.content);
      log.info(`[ChatGraph] Triggering title generation for ${threadId}`, {
        userTextLen: userText?.length ?? 0,
        userTextPreview: userText?.slice(0, 100),
        fullTextLen: fullText?.length ?? 0,
        fullTextPreview: fullText?.slice(0, 100),
        imageGenerated: !!generatedImage,
      });
      const titlePromise = generateThreadTitle(threadId, userText, fullText, {
        imageGenerated: !!generatedImage,
      }).catch((err) => log.warn('[ChatGraph] Thread title generation failed:', err));
      // Auto-tag from the same first exchange. Triggered here (not only via the
      // client generate-title endpoint) so every flow — web, mobile, resumed —
      // gets tags; saveTagsIfEmpty keeps it idempotent and non-clobbering.
      const tagsPromise = generateThreadTags(threadId, userText, fullText).catch((err) =>
        log.warn('[ChatGraph] Thread tag generation failed:', err)
      );
      // Embed the thread for semantic recall AFTER title + tags land, so the
      // recall point carries them. Fire-and-forget: recall is best-effort.
      Promise.allSettled([titlePromise, tagsPromise])
        .then(() => upsertThreadRecallPoint(threadId))
        .catch((err) => log.warn('[ChatGraph] Thread recall embedding failed:', err));
    } else if (!needsSeeding) {
      log.info(`[ChatGraph] Skipping title generation — already named (threadId=${threadId})`);
    } else if (!lastUserMessage) {
      log.warn(`[ChatGraph] Skipping title generation — no lastUserMessage (threadId=${threadId})`);
    }

    log.info(`[ChatGraph] Message persisted for thread ${threadId}`);

    const attachmentsOk = await saveThreadAttachmentsFromMeta(
      threadId,
      userId,
      processedMeta,
      userMessageId ?? null
    );

    return { ok: attachmentsOk };
  } catch (error) {
    // The turn is NOT in the database. Report it so the caller can tell the
    // user before the stream closes — a silently lost turn looks perfect live
    // and is gone on reload.
    log.error('[ChatGraph] Error persisting message:', error);
    return { ok: false };
  }
}

/**
 * Save this turn's uploaded files as thread attachments (+ background RAG embed
 * for large prose docs). Shared by the normal completion path AND the resume
 * path: an interrupted turn (ask_human / run_python) returns before
 * persistAssistantResponse runs, so without the resume-side call the uploaded
 * file was never persisted — follow-up turns then lost hasTabularAttachment
 * and the re-injected file context entirely.
 */
async function saveThreadAttachmentsFromMeta(
  threadId: string,
  userId: string,
  processedMeta: ProcessedAttachmentMeta[],
  messageId: string | null
): Promise<boolean> {
  if (processedMeta.length === 0) return true;
  let saved = 0;
  for (const meta of processedMeta) {
    try {
      const attachmentId = await withMessageWriteRetry(
        () =>
          saveThreadAttachment({
            threadId,
            messageId,
            userId,
            name: meta.name,
            mimeType: meta.mimeType,
            sizeBytes: meta.sizeBytes,
            isImage: meta.isImage,
            extractedText: meta.extractedText,
            ...(meta.pageCount != null && { pageCount: meta.pageCount }),
            ...(meta.imageData != null && { imageData: meta.imageData }),
            ...(meta.fileData != null && { fileData: meta.fileData }),
            ...(meta.documentId != null && { documentId: meta.documentId }),
          }),
        `saveThreadAttachment:${meta.name}`
      );
      saved++;

      // Large prose documents (not images, not tabular) get chunked+embedded
      // in the background so follow-up turns retrieve them via RAG instead of
      // re-injecting truncated full text. Small docs stay full-context.
      //
      // Unless `enrichContext` already did it this turn: then the id is on the
      // meta, it went into the row above, and embedding again would only mint a
      // second Qdrant id for bytes that are already there. That was the state
      // until 13.08.2026 — two writers, no handshake, one new document id each
      // per turn. Retrieval then split its budget across the copies and
      // `getThreadAttachments` handed the model the same file five times.
      //
      // This branch stays as the FALLBACK for the paths enrichContext doesn't
      // cover (notably the resume path, which persists after an interrupt).
      // Its threshold is deliberately not the same number as
      // SMALL_DOC_VECTORIZATION_THRESHOLD (12k, and load-bearing for a
      // different question — see the comment there); between 12k and 20k a
      // resumed turn therefore keeps full-text re-injection where a normal turn
      // moves to RAG. Known, narrow, and not worth a behaviour change here.
      const isTabular = isTabularAttachment(meta.name, meta.mimeType);
      if (
        meta.documentId == null &&
        !meta.isImage &&
        !isTabular &&
        meta.extractedText &&
        meta.extractedText.length > RAG_ATTACHMENT_THRESHOLD_CHARS
      ) {
        embedThreadAttachmentForRag({
          attachmentId,
          userId,
          name: meta.name,
          extractedText: meta.extractedText,
        }).catch((err) => {
          reportBackgroundError(err, { job: 'attachment-rag-embed', attachmentId });
        });
      }
    } catch (attachError) {
      log.error(`[ChatGraph] Failed to save attachment ${meta.name}:`, attachError);
    }
  }
  // Count successes, not inputs: the old log claimed "Saved N" even when every
  // single attachment had failed.
  log.info(`[ChatGraph] Saved ${saved}/${processedMeta.length} attachments for thread ${threadId}`);
  return saved === processedMeta.length;
}

/**
 * Persist a resumed response (simpler — no title gen). Attachments
 * ARE saved here when the caller passes the stored request context: the
 * original turn ended in an interrupt, so this is the first (and only) chance
 * to persist the files uploaded with it.
 */
export async function persistResumedResponse(params: {
  threadId: string;
  fullText: string;
  finalState: ChatGraphState;
  classifiedState: ChatGraphState;
  userId?: string;
  processedMeta?: ProcessedAttachmentMeta[];
  /** Sharepic variants generated on the resumed turn. */
  sharepicVariants?: SharepicVariant[];
  /** Langfuse trace id — persisted so the thumbs feedback button survives reload. */
  traceId?: string;
  /** Artifact created on the resumed turn. Without it the DocumentCreatedCard
   *  vanishes on reload and the thread's tool context stays stale — the resume
   *  path used to drop it while the normal path persisted it. */
  createdDocument?: CreatedDocument | null;
  /** Placeholder assistant row minted before the resumed stream (WP-B). When
   *  present the final content+metadata flip THIS row to 'complete' instead of
   *  inserting a new one; a vanished row is NOT re-inserted (the turn was
   *  discarded), matching persistAssistantResponse. Null/omitted → insert. */
  pendingMessageId?: string | null;
  userMessageId?: string | null;
}): Promise<PersistOutcome> {
  const {
    threadId,
    fullText,
    finalState,
    classifiedState,
    userId,
    processedMeta,
    traceId,
    pendingMessageId,
    userMessageId,
  } = params;

  if (!threadId || !fullText) return { ok: true };

  // Same gapless numbering as the non-resumed path — both write
  // `metadata.citations`, so wiring only one would reintroduce the drift.
  const { text: persistedText, citations: persistedCitations } = renumberAnswerCitations(
    fullText,
    finalState.citations ?? []
  );

  try {
    const toolCalls = buildToolCalls(
      classifiedState,
      finalState,
      null,
      params.sharepicVariants ?? []
    );
    const metadata: Record<string, unknown> = {
      intent: finalState.intent,
      searchCount: finalState.searchCount,
      ...(traceId && { traceId }),
      citations: persistedCitations,
      searchResults: finalState.searchResults?.slice(0, MAX_SOURCES).map(forPersistence) || [],
      resumed: true,
      // Same shape the non-resumed path persists, so the document card
      // rehydrates identically on reload.
      ...(params.createdDocument && { createdDocument: params.createdDocument }),
      // run_python result incl. figures/files — persists the Berechnung card
      // across reloads. Fresh-gated: a forwarded last-turn result must not
      // stamp a stale card onto an unrelated resumed message.
      ...(finalState.computedResult != null &&
        finalState.computedResultFresh && { computeData: finalState.computedResult }),
      ...(finalState.usedRecipes?.length && { recipesUsed: finalState.usedRecipes }),
      toolCalls,
    };

    if (pendingMessageId) {
      // Finalize the placeholder minted before streaming. A miss means the row
      // is gone (e.g. a regenerate from another tab deleted it) — do NOT
      // re-insert; just warn and skip the post-persist side effects.
      const matched = await withMessageWriteRetry(
        () => finalizeAssistantMessage(pendingMessageId, persistedText, metadata),
        'finalizeAssistantMessage:resume'
      );
      if (!matched) {
        log.warn(
          `[ChatGraph:Resume] Pending assistant row ${pendingMessageId} vanished before finalize — response discarded (thread ${threadId})`
        );
        return { ok: true, discarded: true };
      }
    } else {
      await withMessageWriteRetry(
        () => createMessage(threadId, 'assistant', persistedText, metadata),
        'createMessage:resume'
      );
    }
    await touchThread(threadId);

    // Same sticky pointer the non-resumed path writes — without it a resumed
    // artifact turn leaves the next turn's classifier looking at a stale one.
    const toolContext = deriveToolContext({
      finalState,
      classifiedState,
      generatedImage: null,
      sharepicVariants: params.sharepicVariants ?? [],
      createdDocument: params.createdDocument ?? null,
    });
    if (toolContext) {
      void setThreadToolContext(threadId, toolContext).catch((err) =>
        log.warn('[ChatGraph:Resume] Failed to persist thread tool context:', err)
      );
    }

    let attachmentsOk = true;
    if (userId && processedMeta?.length) {
      attachmentsOk = await saveThreadAttachmentsFromMeta(
        threadId,
        userId,
        processedMeta,
        userMessageId ?? null
      );
    }
    log.info(`[ChatGraph:Resume] Message persisted for thread ${threadId}`);
    return { ok: attachmentsOk };
  } catch (error) {
    log.error('[ChatGraph:Resume] Error persisting message:', error);
    return { ok: false };
  }
}
