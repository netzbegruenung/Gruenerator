/**
 * ts-rest contract router for /api/chat-graph
 *
 * Contract-driven router from @ts-rest/express; sole handler for the
 * chat-graph SSE endpoints (stream, resume).
 *
 * Because both endpoints produce Server-Sent Events (SSE), the ts-rest
 * handler performs body validation and then delegates the actual response
 * to the SSE helpers. The contract provides typed request-body validation;
 * the SSE stream itself is opaque from ts-rest's perspective.
 *
 * The handlers are kept thin:
 * - `stream` builds the request context (./services/streamContext) and then
 *   runs Stages 1–4 (classify → intent → response → persist) inline.
 * - `resume` delegates wholesale to ./services/resumePipeline.
 */

import { promises as fsPromises } from 'node:fs';
import nodePath from 'node:path';

import { chatGraphContract } from '@gruenerator/contracts';
import { sanitizeMentionTokens } from '@gruenerator/shared/utils';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import {
  classifierNode,
  pandasComputeNode,
  buildSystemMessage,
} from '../../agents/langgraph/ChatGraph/index.js';
import {
  isSheetFillRequest,
  isTabularComputeQuestion,
} from '../../agents/langgraph/ChatGraph/nodes/classifierHeuristics.js';
import {
  ARTIFACT_NOUN_BY_KIND,
  forbidsPersistentAction,
  hasExplicitSharepicWord,
  type ForbiddableArtifact,
} from '../../agents/langgraph/ChatGraph/nodes/fastPathGuards.js';
import {
  SYSTEM_TOOL_INTENTS,
  isSystemIntentAvailable,
} from '../../services/mcp/systemMcpServers.js';
import { buildAiTelemetry, withLangfuseTrace } from '../../services/telemetry/langfuseTelemetry.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { createLogger } from '../../utils/logger.js';
import { withTimeout } from '../../utils/withTimeout.js';

import {
  streamAgenticResponse,
  isAgenticLoopEnabled,
  AGENTIC_INTENTS,
} from './services/agenticLoop/agenticRespondService.js';
import { stripOutOfRangeCitations } from './services/agenticLoop/citationStrip.js';
import { MAX_SOURCES } from './services/agenticLoop/loopGuards.js';
import {
  compoundGenerationKind,
  looksLikeCompoundEdit,
  isEditorSurface,
  decideRunAgentic,
  resolveEditorSurfaceKind,
  decideEditToolLoop,
} from './services/agenticLoop/routing.js';
import { type PersistedStep } from './services/agenticLoop/types.js';
import {
  ARTIFACT_CONFIRMATION_TEXTS,
  buildPostWithSharepicsConfirmation,
  buildSharepicConfirmation,
  buildSharepicsWithoutPostConfirmation,
} from './services/artifactConfirmations.js';
import { extractArtifactFromResponse } from './services/artifactExtraction.js';
import { injectImageAttachments } from './services/attachmentProcessingService.js';
import { extractCompoundTopic } from './services/compoundTopicExtractor.js';
import { extractChartFromResponse, emitConfirmAction } from './services/confirmActionService.js';
import { pruneMessages, applyCompaction } from './services/contextPruningService.js';
import { buildCreateTurnContext } from './services/createTurn.js';
import {
  handleBoardCreation,
  handleSheetCreation,
  handlePresentationCreation,
  handlePdfCreation,
  handleRecurringTaskCreation,
  generateAndCreateDocument,
  handleShareDoc,
  executeIntentPipeline,
} from './services/intentExecutionService.js';
import { estimateRequestTokens, extractTextContent } from './services/messageHelpers.js';
import { stripFabricatedSystemClaims } from './services/outputSanity.js';
import {
  recallPastChats,
  recallOfficeDocuments,
  recallReels,
  rerankRecall,
  formatPastChatsBlock,
  formatOfficeDocsBlock,
  formatReelsBlock,
  getSpaceRecallScope,
} from './services/pastChatRecallService.js';
import { createPendingAssistantWriter } from './services/pendingAssistantWriter.js';
import { pipelineStateStore } from './services/pipelineStateStore.js';
import { APP_REDIRECT_TEXTS, NO_SHAREPIC_TO_EDIT_TEXT } from './services/platformGating.js';
import { persistAssistantResponse } from './services/postResponseService.js';
import { handleRecallToolLoop, isChatRecallLoopEnabled } from './services/recallToolLoopService.js';
import {
  buildReelContextBlock,
  handleReelEdit,
  hasReelEditVerb,
  isReelEditInstruction,
} from './services/reelEditService.js';
import { resolveReferentialQuery, resolveReferentialTopic } from './services/referentialTopic.js';
import {
  resolveModel,
  buildMessagesForAI,
  streamForResolution,
  streamWithFallback,
} from './services/responseStreamingService.js';
import { runChatGraphResume } from './services/resumePipeline.js';
import {
  handleSharepicAgenticEdit,
  isChatToolLoopEnabled,
} from './services/sharepicAgenticService.js';
import { hasSharepicEditVerb, isShortAffirmation } from './services/sharepicEditHeuristics.js';
import {
  handleSharepicEdit,
  isSharepicEditInstruction,
  threadHasSharepic,
} from './services/sharepicEditService.js';
import {
  getLastSharepicVariant,
  isSharepicRefinement,
  isSharepicTopicMissing,
  type PriorSharepic,
} from './services/sharepicVariantHelpers.js';
import {
  handleSocialPostTextEdit,
  isSocialTextEditInstruction,
} from './services/socialPostEditService.js';
import {
  createSSEStream,
  getIntentMessage,
  PROGRESS_MESSAGES,
  sseInternalError,
  sendChatWarning,
  type SSEEventPayloads,
} from './services/sseHelpers.js';
import { buildStreamContext } from './services/streamContext.js';
import {
  createMessage,
  discardPendingAssistantIfEmpty,
  getLastGeneratedImageUrl,
  persistSourcesOnFailure,
  touchThread,
} from './services/threadPersistenceService.js';

import type { ChatGraphState, CreatedDocument } from '../../agents/langgraph/ChatGraph/types.js';
import type { ModelMessage } from 'ai';
import type { Application } from 'express';

const log = createLogger('chatGraphContractRouter');

/** Content of the row that keeps a failed turn's sources for the retry. */
const RESEARCH_KEPT_ON_FAILURE_TEXT =
  'Die Antwort konnte nicht erzeugt werden. Die recherchierten Quellen sind gespeichert — ein erneuter Versuch nutzt sie weiter.';

/** Cap best-effort past-chat recall so it never delays the user-facing stream. */
const EXTERNAL_CONTEXT_TIMEOUT_MS = 3_000;

/** Cap on how much gathered reference material rides in a doc/board edit — keeps
 *  the docs-AI system prompt bounded. Matches the single-pass edit ref cap. */
const EDIT_REFERENCE_CHAR_CAP = 8000;

/** A prior assistant turn must be at least this long to count as the edit's
 *  reference material — skips the brief "Ich passe das Dokument an…" confirmation
 *  and lands on the earlier turn that actually holds the content. */
const EDIT_REFERENCE_SUBSTANTIVE_THRESHOLD = 200;

/** Render the loop's gathered sources into a reference block for a compound-edit
 *  turn — the material the docs/boards AI composes the insert from (title +
 *  content per source). Empty-content sources are dropped (they'd otherwise leak
 *  a bare title placeholder and waste the budget). */
function renderReferenceFromResults(results: ChatGraphState['searchResults']): string {
  const block = results
    .filter((r) => (r.content ?? '').trim())
    .map((r) => `${r.title ?? 'Quelle'}\n${(r.content ?? '').trim()}`)
    .join('\n\n---\n\n');
  return block.length > EDIT_REFERENCE_CHAR_CAP ? block.slice(0, EDIT_REFERENCE_CHAR_CAP) : block;
}

/** Reference material for a doc/board edit trigger (shared by the doc + board
 *  branches). compoundEdit uses this turn's freshly-gathered sources; a plain
 *  single-pass edit uses the prior substantive assistant turn. */
function buildEditReferenceContent(
  compoundEdit: boolean,
  searchResults: ChatGraphState['searchResults'],
  validMessages: ModelMessage[],
  lastUserMessage: ModelMessage | undefined
): string {
  if (compoundEdit) return renderReferenceFromResults(searchResults);
  const lastUserIdx = lastUserMessage ? validMessages.indexOf(lastUserMessage) : -1;
  const priorMessages = lastUserIdx > 0 ? validMessages.slice(0, lastUserIdx) : [];
  const prev =
    [...priorMessages]
      .reverse()
      .map((m) => (m.role === 'assistant' ? extractTextContent(m.content) : ''))
      .find((t) => t.trim().length >= EDIT_REFERENCE_SUBSTANTIVE_THRESHOLD) ?? '';
  return prev.length > EDIT_REFERENCE_CHAR_CAP ? prev.slice(0, EDIT_REFERENCE_CHAR_CAP) : prev;
}

const s = initServer();

export const chatGraphContractRouter = s.router(chatGraphContract, {
  stream: async (args) => {
    const { req } = args;
    const sse = createSSEStream(args.res);
    const requestId = `req_${Date.now()}`;
    log.info('[chatGraphContract] stream handler entered, request_id=%s', requestId);

    // Turn persistence (WP-B): the placeholder assistant row + its streaming
    // writer. Declared in the handler scope (not inside the try) so the outer
    // catch can run cleanupPending too. Assigned once the context is built.
    let pendingId: string | null = null;
    let pendingWriter: ReturnType<typeof createPendingAssistantWriter> | null = null;
    // Must run on EVERY return path after the placeholder is created:
    //  - discard=false before the main persist (stop the writer so its last
    //    throttle write can't race the finalize UPDATE);
    //  - discard=true on aborts/handler-takeovers/catch (drops the row only if
    //    it stayed empty; a row with partial text survives as an aborted turn).
    const cleanupPending = async (discard: boolean): Promise<void> => {
      sse.setTextListener(undefined);
      await pendingWriter?.stop().catch(() => {});
      if (discard && pendingId) await discardPendingAssistantIfEmpty(pendingId).catch(() => {});
    };

    try {
      const ctxResult = await buildStreamContext({ req, body: args.body, sse, requestId });
      if (ctxResult.done) {
        return { status: 200 as const, body: undefined };
      }

      // Destructure the context into the same identifiers the staged pipeline
      // below was written against (requestId is already in scope from above).
      const {
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
        pendingAssistantMessageId,
      } = ctxResult.ctx;

      // A placeholder assistant row was minted in buildStreamContext. Its writer
      // accumulates the streamed reply so an aborted/crashed turn keeps whatever
      // streamed. The SSE text listener is registered LATER — right before the
      // main respond stage — so the many handler branches below (sharepic/reel/
      // board/… which stream their own text_delta AND persist their own rows)
      // never pollute the placeholder.
      pendingId = pendingAssistantMessageId;
      pendingWriter = pendingId ? createPendingAssistantWriter(pendingId) : null;

      const {
        agentId,
        forcedTools: bodyForcedTools,
        enabledTools,
        modelId,
        documentIds: rawDocumentIds,
        documentChatIds: rawDocumentChatIds,
        docMentionIds: rawDocMentionIds,
        boardIds: rawBoardIds,
        currentDocument: rawCurrentDocument,
        currentBoard: rawCurrentBoard,
        currentSharepic: rawCurrentSharepic,
        currentSocialPost: rawCurrentSocialPost,
        currentReel: rawCurrentReel,
        reelUpload: rawReelUpload,
      } = args.body;

      // Durable mention tokens (parsed in streamContext) are the source of
      // truth; legacy body forcedTools (older clients) union in. Regex edit
      // heuristics below need the text with tokens fully removed — labels like
      // "Bild generieren" would false-positive their noun patterns.
      const mergedForcedTools = [
        ...new Set([...(bodyForcedTools ?? []), ...mentionTokenFields.forcedTools]),
      ];
      const forcedTools = mergedForcedTools.length > 0 ? mergedForcedTools : undefined;
      const lastUserTextNoMentions = sanitizeMentionTokens(lastUserTextRaw, 'remove');

      // === Stage 1: Classify ===
      const classifiedState = {
        ...initialState,
        ...(await classifierNode(initialState)),
      } as ChatGraphState;
      classifiedState.lastUserTextNoMentions = lastUserTextNoMentions;
      // The heuristic fallback produces a materially worse turn (no
      // multi-source search, no metadata filters) that used to look normal.
      if (classifiedState.classifierDegraded) sendChatWarning(sse, 'classifier_degraded');

      let forcedTool: boolean = false;

      /**
       * Suspend the turn: tell the client what it must do, park everything the
       * resume endpoint needs in Redis, then close cleanly.
       *
       * The 14-field requestContext has to stay in lockstep with what
       * resumePipeline reads back out. Three hand-maintained copies of it
       * guaranteed a new field would eventually land in only two.
       *
       * `threadId` is required, not optional: the store builds its Redis key by
       * string concatenation, so a missing id used to write everything into the
       * shared `pipeline_state:undefined` key — and emit an interrupt the client
       * could never resume, dead-ending the turn.
       */
      const suspendTurn = async (
        threadId: string,
        interrupt: SSEEventPayloads['interrupt']
      ): Promise<{ status: 200; body: undefined }> => {
        sse.send('interrupt', interrupt);

        await pipelineStateStore.store(threadId, {
          classifiedState,
          requestContext: {
            userId,
            agentId: agentId ?? 'gruenerator-universal',
            enabledTools: enabledTools ?? {},
            ...(modelId != null && { modelId }),
            actualThreadId: threadId,
            isNewThread,
            processedMeta,
            imageAttachments,
            memoryContext,
            memoryRetrieveTimeMs,
            validMessages,
            forcedTool,
            ...(rawDocumentIds != null && { rawDocumentIds }),
          },
        });

        sse.send('done', {
          threadId,
          citations: [],
          interrupted: true,
          metadata: {
            intent: classifiedState.intent,
            searchCount: 0,
            totalTimeMs: Date.now() - initialState.startTime,
            classificationTimeMs: classifiedState.classificationTimeMs,
            searchTimeMs: 0,
          },
        });

        // Interrupt turn — nothing streamed; drop the empty placeholder (the
        // resume path persists its own message).
        await cleanupPending(true);
        sse.end();
        return { status: 200 as const, body: undefined };
      };

      log.info(
        `[ChatGraph] forcedTools received: ${JSON.stringify(forcedTools)}, classifier intent: ${classifiedState.intent}`
      );

      /**
       * End the turn with a fixed sentence — no model call. For the cases where
       * the honest answer is known in advance (this surface can't do it; there
       * is nothing here to edit), so paying a generation to phrase it would
       * only add latency and a chance to phrase it wrongly.
       */
      const finishTurnWithFixedText = async (
        text: string,
        intent: NonNullable<ChatGraphState['intent']>
      ): Promise<{ status: 200; body: undefined }> => {
        sse.send('response_start', { message: PROGRESS_MESSAGES.responseStart });
        sse.send('text_delta', { text });
        sse.send('done', {
          threadId: actualThreadId ?? null,
          citations: [],
          metadata: {
            intent,
            searchCount: 0,
            totalTimeMs: Date.now() - initialState.startTime,
            classificationTimeMs: classifiedState.classificationTimeMs,
            searchTimeMs: 0,
          },
        });
        if (actualThreadId) {
          try {
            await createMessage(actualThreadId, 'assistant', text, { intent });
            await touchThread(actualThreadId);
          } catch (err) {
            log.error('[ChatGraph] Failed to persist fixed-text turn:', err);
          }
        }
        await cleanupPending(true);
        sse.end();
        return { status: 200 as const, body: undefined };
      };

      // === Compound query detection ===
      const isCompound = notebookIds.length > 0 && !!agentId && agentId !== 'gruenerator-universal';
      classifiedState.isCompound = isCompound;

      if (isCompound) {
        log.info(
          `[ChatGraph] Compound query detected: notebooks=[${notebookIds.join(',')}], agent=${agentId}`
        );

        if (!classifiedState.searchQuery) {
          // Remove-form: "@Label" fragments are self-referential query noise.
          classifiedState.searchQuery = extractCompoundTopic(lastUserTextNoMentions, notebookIds);
          log.info(`[ChatGraph] Compound topic extracted: "${classifiedState.searchQuery}"`);
        }

        const gatherSources = classifiedState.gatherSources?.length
          ? classifiedState.gatherSources
          : ['notebook-search' as const];
        classifiedState.gatherSources = gatherSources;

        sse.send('compound_start', {
          stages: gatherSources,
          message: PROGRESS_MESSAGES.compoundStart(gatherSources.length),
        });
      }

      // @bildbearbeiten is an alias for image_edit intent with explicit universal
      // style — distinct identifier so @stadtbegruenen can keep its green-edit
      // branding while @bildbearbeiten signals free-form editing.
      const universalEditForced = !!forcedTools?.includes('image_edit_universal');
      if (universalEditForced) {
        classifiedState.intent = 'image_edit';
        forcedTool = true;
        log.info('[ChatGraph] Intent forced to "image_edit" via @bildbearbeiten mention');
      }

      // @abgeordnetenwatch hard-pins the German MP transparency intent. It is not
      // part of TOOL_PRIORITY (that list is search/image/sharepic tools), so it's
      // resolved here. DE-only source: for de-AT users, ignore the force and keep
      // the classifier's (already downgraded) intent so we never fetch empty data.
      const abgeordnetenwatchForced = !!forcedTools?.includes('abgeordnetenwatch');
      if (abgeordnetenwatchForced && initialState.userLocale !== 'de-AT') {
        classifiedState.intent = 'abgeordnetenwatch';
        forcedTool = true;
        // The classifier may have returned a non-search intent (e.g. 'direct')
        // and left searchQuery empty — pull the user's message in as the query.
        if (
          (!classifiedState.searchQuery || !classifiedState.searchQuery.trim()) &&
          lastUserMessage
        ) {
          const userText = lastUserTextNoMentions.trim();
          if (userText) classifiedState.searchQuery = userText;
        }
        log.info('[ChatGraph] Intent forced to "abgeordnetenwatch" via @abgeordnetenwatch mention');
      }

      // @bundestag hard-pins the DIP document/speech intent — same rules as
      // @abgeordnetenwatch above (not in TOOL_PRIORITY, DE-only source).
      const bundestagForced = !!forcedTools?.includes('bundestag');
      if (bundestagForced && initialState.userLocale !== 'de-AT') {
        classifiedState.intent = 'bundestag';
        forcedTool = true;
        if (
          (!classifiedState.searchQuery || !classifiedState.searchQuery.trim()) &&
          lastUserMessage
        ) {
          const userText = lastUserTextNoMentions.trim();
          if (userText) classifiedState.searchQuery = userText;
        }
        log.info('[ChatGraph] Intent forced to "bundestag" via @bundestag mention');
      }

      // @doku hard-pins the documentation intent. Not in TOOL_PRIORITY (that
      // list is the search/image/sharepic family), so it is resolved here. Not
      // locale-gated: the docs describe the product itself and apply to DE and
      // AT alike. The searchQuery backfill matters more here than for the
      // sources above — the docs tool searches the user's text verbatim, so an
      // empty query would search nothing at all.
      if (forcedTools?.includes('hilfe')) {
        classifiedState.intent = 'hilfe';
        forcedTool = true;
        if (
          (!classifiedState.searchQuery || !classifiedState.searchQuery.trim()) &&
          lastUserMessage
        ) {
          const userText = lastUserTextNoMentions.trim();
          if (userText) classifiedState.searchQuery = userText;
        }
        log.info('[ChatGraph] Intent forced to "hilfe" via @doku mention');
      }

      // A per-server mention (@notion/@brevo) arrives as `mcp:<serverId>` and
      // scopes the tool-loop to that one server. Bare `mcp` (legacy @mcp tokens in
      // old threads; no mention emits it anymore) still runs unscoped over all
      // enabled servers for back-compat. Not in TOOL_PRIORITY, so resolved here;
      // the forced flag lets the loop run even if enabledTools.mcp is off, and
      // the agentic mcpCatalog no-ops safely when the user has no servers.
      const mcpScopedToken = forcedTools?.find((t) => t.startsWith('mcp:'));
      const mcpForced = !!forcedTools?.includes('mcp') || !!mcpScopedToken;
      if (mcpForced) {
        classifiedState.intent = 'mcp';
        classifiedState.mcpServerScope = mcpScopedToken ? mcpScopedToken.slice(4) : null;
        forcedTool = true;
        log.info('[ChatGraph] Intent forced to "mcp" via mention', {
          scope: classifiedState.mcpServerScope ?? 'all',
        });
      }

      if (forcedTools && forcedTools.length > 0) {
        const searchClassTools = ['research', 'web', 'search'];
        const hasSearchTool = forcedTools.some((t) => searchClassTools.includes(t));

        const TOOL_PRIORITY =
          isCompound && hasSearchTool
            ? (['research', 'web', 'search', 'sharepic', 'image', 'image_edit', 'summary'] as const)
            : ([
                'sharepic',
                'image',
                'image_edit',
                'summary',
                'research',
                'web',
                'search',
              ] as const);

        const forced = TOOL_PRIORITY.find((t) => forcedTools.includes(t));
        if (forced && !universalEditForced) {
          // The merged "Recherche" tool (identifier 'research', alias
          // 'websearch') forces *search-class* without pinning a depth: keep the
          // classifier's web↔research choice (auto-depth) and only fall back to
          // research when it picked a non-search intent. Document search
          // ('search') and non-search tools (image/sharepic/…) stay hard-pinned.
          if (forced === 'research' || forced === 'web') {
            if (classifiedState.intent !== 'web' && classifiedState.intent !== 'research') {
              classifiedState.intent = 'research';
            }
          } else {
            classifiedState.intent = forced;
          }
          forcedTool = true;
          log.info(
            `[ChatGraph] Intent forced via @tool mention: forced="${forced}", resolved="${classifiedState.intent}"`
          );

          // When the classifier returned a non-search intent (e.g. 'direct')
          // and the @-mention forces a search intent, the classifier never
          // populated searchQuery — the orchestrator would then run on an
          // empty question and the planner LLM hallucinates topics from
          // context. Pull the user's last message text in as the query.
          const FORCED_SEARCH_INTENTS = new Set(['research', 'web', 'search']);
          if (
            FORCED_SEARCH_INTENTS.has(classifiedState.intent) &&
            (!classifiedState.searchQuery || !classifiedState.searchQuery.trim()) &&
            lastUserMessage
          ) {
            const userText = lastUserTextNoMentions.trim();
            if (userText) {
              // A referential ask ("Ja, bitte recherchiere das jetzt im Web")
              // carries no subject: taken verbatim it BECAME the research query
              // and Linkup answered about the sentence, not the topic.
              const resolved = resolveReferentialQuery(userText, classifiedState.messages ?? []);
              classifiedState.searchQuery = resolved.query;
              classifiedState.searchQueryInherited = resolved.inherited;
              log.info(
                `[ChatGraph] searchQuery populated from last user message for forced ${forced}${
                  resolved.inherited ? ' (topic inherited from prior turn)' : ''
                }: "${resolved.query.slice(0, 60)}"`
              );
            }
          }
        }
      }

      // Resolve which FLUX edit-prompt builder imageEditNode should use.
      // @stadtbegruenen (forcedTools includes 'image_edit') → green-urban branded;
      // @bildbearbeiten (forcedTools includes 'image_edit_universal') → universal;
      // auto-detected image_edit from heuristics → universal.
      if (classifiedState.intent === 'image_edit') {
        const greenEditMentionForced =
          !!forcedTools?.includes('image_edit') && !universalEditForced;
        classifiedState.imageEditStyle = greenEditMentionForced ? 'green-edit' : 'universal';
        log.info(
          `[ChatGraph] image_edit style resolved to "${classifiedState.imageEditStyle}" (greenEditForced=${greenEditMentionForced}, universalForced=${universalEditForced})`
        );
      }

      // image_edit without an attachment: rehydrate the thread's last generated
      // image as the edit input ("mach es blauer" after a generation turn) —
      // without this the edit node errors with "Bitte hänge ein Bild an".
      // Only local flux results are eligible (strict path shape, no traversal).
      if (
        classifiedState.intent === 'image_edit' &&
        imageAttachments.length === 0 &&
        actualThreadId
      ) {
        const lastUrl = await getLastGeneratedImageUrl(actualThreadId).catch(() => null);
        const m = lastUrl?.match(/^\/uploads\/(flux\/results\/[\w.-]+\/[\w.-]+)$/);
        if (m?.[1]) {
          try {
            const filePath = nodePath.join(process.cwd(), 'uploads', m[1]);
            const data = await fsPromises.readFile(filePath);
            imageAttachments.push({
              name: nodePath.basename(filePath),
              type: 'image/jpeg',
              data: data.toString('base64'),
            });
            classifiedState.imageAttachments = imageAttachments;
            log.info('[ChatGraph] Rehydrated previous generated image for image_edit');
          } catch (err) {
            log.warn(
              `[ChatGraph] Could not rehydrate previous image (${err instanceof Error ? err.message : err})`
            );
          }
        }
      }

      // === Reel upload: composer-attached video → auto-transcription ===
      // Deliberately NOT behind the image/intent guards of the edit branch
      // below: the user explicitly attached a video for subtitling, so the
      // upload wins the turn even when the message also carries an image
      // (which is ignored for this turn) or classifies as image_edit —
      // otherwise the already-TUS-uploaded video would be dropped silently.
      if (actualThreadId && lastUserMessage && rawReelUpload != null) {
        const uploadText = (extractTextContent(lastUserMessage.content) || '').trim();
        const handled = await handleReelEdit({
          sse,
          req,
          threadId: actualThreadId,
          userId,
          instruction: uploadText,
          currentReel: rawCurrentReel ?? null,
          reelUpload: rawReelUpload,
          userLocale: initialState.userLocale || 'de-DE',
          clientPlatform: initialState.clientPlatform,
          aiWorkerPool,
          startTime: initialState.startTime,
          ...(classifiedState.classificationTimeMs != null && {
            classificationTimeMs: classifiedState.classificationTimeMs,
          }),
        });
        if (handled) {
          await cleanupPending(true);
          return { status: 200 as const, body: undefined };
        }
      }

      // === Reel edit: chat subtitle editing of subtitler projects ===
      // Two sub-flows in handleReelEdit: a reel-edit instruction without an
      // attached reel streams a project picker; with a target it runs a
      // text-only subtitle edit. Placed BEFORE the sharepic branch — its
      // noun pattern includes "text" and would otherwise capture
      // "Untertitel-Text ändern". Falls through (returns false) when no reel
      // context exists and the phrasing isn't reel-specific ("Segment 2
      // kürzen" on a sharepic thread).
      if (
        actualThreadId &&
        lastUserMessage &&
        imageAttachments.length === 0 &&
        classifiedState.intent !== 'image_edit' &&
        !universalEditForced
      ) {
        const reelText = lastUserTextNoMentions.trim();
        const reelModeRelaxed = rawCurrentReel != null && !!reelText && hasReelEditVerb(reelText);
        if (reelText && (isReelEditInstruction(reelText) || reelModeRelaxed)) {
          const handled = await handleReelEdit({
            sse,
            req,
            threadId: actualThreadId,
            userId,
            instruction: reelText,
            currentReel: rawCurrentReel ?? null,
            reelUpload: null,
            userLocale: initialState.userLocale || 'de-DE',
            clientPlatform: initialState.clientPlatform,
            aiWorkerPool,
            startTime: initialState.startTime,
            ...(classifiedState.classificationTimeMs != null && {
              classificationTimeMs: classifiedState.classificationTimeMs,
            }),
          });
          if (handled) {
            await cleanupPending(true);
            return { status: 200 as const, body: undefined };
          }
        }
      }

      // === App gate: sharepic UI is web-only ===
      // The app renders neither sharepic_complete nor the combined-post card,
      // so these turns would generate into the void. Placed before the edit/
      // refinement branches and BOTH HITL interrupts — an interrupt stored
      // with a sharepic intent would resume past this gate (resumePipeline
      // has no platform check). social_post degrades to its text-only
      // sibling intent instead of a redirect: the post text is a plain chat
      // answer the app renders fine.
      if (initialState.clientPlatform === 'app') {
        if (
          classifiedState.secondaryIntent === 'sharepic' ||
          classifiedState.secondaryIntent === 'social_post'
        ) {
          classifiedState.secondaryIntent = null;
        }
        if (classifiedState.intent === 'social_post') {
          classifiedState.intent = 'examples';
          log.info('[ChatGraph] social_post on app — downgraded to examples (text-only post)');
        }
        if (classifiedState.intent === 'sharepic') {
          log.info('[ChatGraph] Sharepic intent on app — redirecting to web');
          return await finishTurnWithFixedText(APP_REDIRECT_TEXTS.sharepic, 'sharepic');
        }
      }

      // === Reel context: transcript for non-edit turns ===
      // With a reel attached, every turn the edit branch did NOT claim gets
      // the subtitle transcript injected as attachment context, so the normal
      // pipeline can answer follow-ups about the video's content ("schreib
      // mir einen Insta-Post dazu", "fass das zusammen"). Reels are short —
      // a transcript is a few hundred tokens at most.
      //
      // Injected AFTER classification on purpose: pre-classify context would
      // hit the classifier's attachment branch and force `direct` intent for
      // EVERY turn in Reel-Modus, breaking web-search/sharepic requests. The
      // respond stage reads classifiedState; initialState is mutated too so
      // the HITL clarification gate below sees the context and doesn't
      // interrupt "Fass das zusammen" with a needless question.
      if (rawCurrentReel != null && userId) {
        const reelContext = await buildReelContextBlock(userId, rawCurrentReel.projectId);
        if (reelContext) {
          classifiedState.attachmentContext = classifiedState.attachmentContext
            ? `${classifiedState.attachmentContext}\n\n${reelContext}`
            : reelContext;
          initialState.attachmentContext = classifiedState.attachmentContext;
        }
      }

      // === Social post TEXT edit (EXPERIMENTAL) ===
      // "Mach den Text knackiger" on a thread with a combined post edits the
      // PROSE, not the graphic. Must run BEFORE the sharepic edit branch: its
      // EDIT_NOUN_PATTERN contains `text`, so it would hijack these
      // instructions. Precedence: a plain Sharepic-Modus (rawCurrentSharepic
      // WITHOUT an activated post) wins — but when the user activated the
      // combined post (rawCurrentSocialPost, which may set both), text-ish
      // instructions edit the post and sharepic-noun instructions still fall
      // through to the sharepic path. Declines (returns false) when the
      // thread has no editable post. Skipped on the app, which can't render
      // the combined-post card or its update events.
      if (
        initialState.clientPlatform !== 'app' &&
        actualThreadId &&
        lastUserMessage &&
        imageAttachments.length === 0 &&
        classifiedState.intent !== 'image_edit' &&
        !universalEditForced &&
        (rawCurrentSocialPost != null || rawCurrentSharepic == null)
      ) {
        const editText = lastUserTextNoMentions.trim();
        if (editText && isSocialTextEditInstruction(editText)) {
          // Sibling of the sharepic-branch log below: the two edit branches are
          // where a follow-up either lands correctly or is silently misread.
          log.info(
            `[ChatGraph] social post text-edit branch: ${JSON.stringify(editText.slice(0, 80))}`
          );
          const handled = await handleSocialPostTextEdit({
            sse,
            req,
            threadId: actualThreadId,
            userId,
            instruction: editText,
            postId: rawCurrentSocialPost?.postId ?? null,
            aiWorkerPool,
            startTime: initialState.startTime,
            ...(classifiedState.classificationTimeMs != null && {
              classificationTimeMs: classifiedState.classificationTimeMs,
            }),
          });
          if (handled) {
            await cleanupPending(true);
            return { status: 200 as const, body: undefined };
          }
        }
      }

      // === Sharepic edit: full NL editing of an existing chat sharepic ===
      // "Zeile 2 kürzer", "Balken nach oben", "anderes Hintergrundbild" on a
      // sharepic the thread already produced. Applies structured operations to
      // the (lazily minted) canvas document and updates the card in place —
      // see sharepicEditService. Falls through to the legacy text-regeneration
      // refinement below when no editable target exists. Skipped on the app,
      // which can't render sharepic updates — edit-y phrases there run through
      // the normal pipeline instead.
      if (
        initialState.clientPlatform !== 'app' &&
        actualThreadId &&
        lastUserMessage &&
        imageAttachments.length === 0 &&
        classifiedState.intent !== 'image_edit' &&
        !universalEditForced
      ) {
        const editText = lastUserTextNoMentions.replace(/@sharepic\b/gi, ' ').trim();
        // With an explicitly activated sharepic (Sharepic-Modus) AND the tool
        // loop on, an edit verb alone is enough — the loop can answer with
        // plain text when the message turns out not to be sharepic-related,
        // so over-triggering is cheap. The strict verb+noun check stays the
        // bar for the tool-forced single-call path.
        const sharepicModeRelaxed =
          isChatToolLoopEnabled() &&
          rawCurrentSharepic != null &&
          !!editText &&
          (hasSharepicEditVerb(editText) || isShortAffirmation(editText));
        const candidate = !editText
          ? null
          : isSharepicEditInstruction(editText)
            ? 'edit-instruction'
            : isSharepicRefinement(editText)
              ? 'refinement'
              : sharepicModeRelaxed
                ? 'sharepic-mode-relaxed'
                : null;
        // EVERY lane must prove there is something to edit. `refinement` always
        // did; `edit-instruction` never did, and that asymmetry was a hole, not
        // a nuance: on a thread with no sharepic the handler declined, the turn
        // fell through, and the pipeline then CREATED a sharepic about the edit
        // instruction ("Mach den Text im Sharepic größer" became a sharepic
        // whose topic was that sentence). One check, all three lanes.
        // sharepicModeRelaxed keeps its own rawCurrentSharepic requirement —
        // an explicitly activated sharepic is stronger evidence than "the
        // thread has one somewhere".
        const sharepicTrigger =
          candidate && (rawCurrentSharepic != null || (await threadHasSharepic(actualThreadId)))
            ? candidate
            : null;
        if (sharepicTrigger) {
          // WHICH rule captured the turn, and on what text. This branch can end
          // a turn early (e.g. the "Welche Variante soll ich bearbeiten?"
          // clarification) without any other log line, so a message that was
          // never meant as a sharepic edit vanished into it leaving no trace —
          // a QA report of "my question was answered as an edit command" was
          // not diagnosable from the backend at all.
          log.info(
            `[ChatGraph] sharepic edit branch via ${sharepicTrigger}: ${JSON.stringify(editText.slice(0, 80))}`
          );
          // CHAT_TOOL_LOOP swaps the executor, not the routing: same entry
          // condition and fallthrough semantics, but the edit runs as a small
          // agentic tool loop instead of one structured call.
          const editHandler = isChatToolLoopEnabled()
            ? handleSharepicAgenticEdit
            : handleSharepicEdit;
          const handled = await editHandler({
            sse,
            req,
            threadId: actualThreadId,
            userId,
            instruction: editText,
            currentSharepic: rawCurrentSharepic ?? null,
            aiWorkerPool,
            startTime: initialState.startTime,
            ...(classifiedState.classificationTimeMs != null && {
              classificationTimeMs: classifiedState.classificationTimeMs,
            }),
          });
          if (handled) {
            await cleanupPending(true);
            return { status: 200 as const, body: undefined };
          }
        }
      }

      // === Sharepic refinement: a follow-up edit right after a sharepic ===
      // "verlängern" / "kürzer" / "anderes Bild" after a sharepic means "adjust
      // the one you just made" — regenerate seeded with the previous sharepic's
      // text, not a fresh sharepic about the word "verlängern". Overrides whatever
      // intent the classifier picked (the edit verb alone rarely classifies as
      // sharepic). Skipped when an image is attached (that's image_edit territory).
      // Reached only when handleSharepicEdit above declined (no target variant
      // or non-editable template).
      let sharepicRefinement: { instruction: string; prior: PriorSharepic } | undefined;
      if (
        initialState.clientPlatform !== 'app' &&
        actualThreadId &&
        lastUserMessage &&
        imageAttachments.length === 0 &&
        classifiedState.intent !== 'image_edit' &&
        !universalEditForced
      ) {
        const followText = lastUserTextNoMentions;
        if (isSharepicRefinement(followText)) {
          const prior = await getLastSharepicVariant(actualThreadId);
          if (prior) {
            sharepicRefinement = {
              instruction: followText.replace(/@sharepic\b/gi, '').trim(),
              prior,
            };
            classifiedState.intent = 'sharepic';
            forcedTool = true;
            log.info(
              `[ChatGraph] Sharepic refinement: "${sharepicRefinement.instruction}" on ${prior.canvasType}`
            );
          }
        }
      }

      // === Sharepic licence: the single gate for "may this turn make one?" ===
      // A sharepic is legitimate in exactly two situations: the user named one,
      // or the thread already has one to edit — and both edit lanes above have
      // had their chance at the second. Enforcing it HERE, once, is what let the
      // classifier lose five regexes: every door (Tier-3 heuristic, Tier-4 LLM,
      // the malformed-JSON recovery in classifierParsing, secondaryIntent) ends
      // up passing through this line, so none of them needs its own gate.
      // Placed before compoundKind so an unlicensed turn cannot mount the fat
      // tool either.
      const sharepicLicensed =
        forcedTool || // @sharepic mention — an explicit pick
        initialState.agentConfig?.identifier === 'gruenerator-sharepic' ||
        hasExplicitSharepicWord(lastUserTextNoMentions);

      if (classifiedState.secondaryIntent === 'sharepic' && !sharepicLicensed) {
        log.info('[ChatGraph] Dropping unlicensed sharepic secondaryIntent');
        classifiedState.secondaryIntent = null;
      }
      if (classifiedState.intent === 'sharepic' && !sharepicLicensed) {
        if (actualThreadId && (await threadHasSharepic(actualThreadId))) {
          // Sharepic-shaped, and there IS one — but the edit lanes declined it
          // (wrong template, ambiguous, not actually an edit). Answering
          // normally beats minting a surprise second sharepic.
          log.info('[ChatGraph] Unlicensed sharepic intent, thread has one → direct');
          classifiedState.intent = 'direct';
        } else {
          log.info('[ChatGraph] Unlicensed sharepic intent, nothing to edit → fixed reply');
          return await finishTurnWithFixedText(NO_SHAREPIC_TO_EDIT_TEXT, 'sharepic');
        }
      }

      // === Negative action constraints: one gate for "may this turn persist?" ===
      // Same shape as the sharepic licence above, same reason: the artifact
      // intents have many doors (Tier-2.7 lastToolContext, Tier-3 heuristics,
      // the Tier-4 LLM, its malformed-JSON recovery, secondaryIntent) and only
      // the Tier-3 ones ever checked for negation. Enforcing it here, once,
      // means a door that forgets cannot leak. Demoting to `direct` (rather than
      // a fixed reply) is deliberate: the user asked for an ANSWER and forbade
      // the artifact — they should get the answer.
      const forbiddenBy: Partial<Record<string, ForbiddableArtifact>> = {
        save_as_doc: 'document',
        modify_doc: 'document',
        share_doc: 'document',
        create_sheet: 'sheet',
        create_presentation: 'presentation',
        create_pdf: 'pdf',
        modify_board: 'board',
        image: 'image',
      };
      const secondaryFamily = forbiddenBy[classifiedState.secondaryIntent ?? ''];
      if (
        secondaryFamily &&
        forbidsPersistentAction(lastUserTextNoMentions, ARTIFACT_NOUN_BY_KIND[secondaryFamily])
      ) {
        log.info(
          `[ChatGraph] Turn forbids ${secondaryFamily} action → dropping secondaryIntent ${classifiedState.secondaryIntent}`
        );
        classifiedState.secondaryIntent = null;
      }
      const primaryFamily = forbiddenBy[classifiedState.intent];
      if (
        primaryFamily &&
        forbidsPersistentAction(lastUserTextNoMentions, ARTIFACT_NOUN_BY_KIND[primaryFamily])
      ) {
        log.info(
          `[ChatGraph] Turn forbids ${primaryFamily} action → demoting intent ${classifiedState.intent} to direct`
        );
        classifiedState.intent = 'direct';
      }

      sse.send('progress_step', {
        stepId: classifyStepId,
        toolName: 'classify',
        title: 'Verstehe Anfrage…',
        status: 'completed',
      });

      // Agentic respond path decision — made here so the `intent` event can tell
      // the client to expect real tool cards (and skip the fabricated one). It
      // must be stable through to Stage 2: forced @tool mentions, images, and
      // non-Mistral selections stay on the deterministic single-pass pipeline.
      // For an `mcp` turn the forcedTool flag means "the user picked this
      // connector" (via @<server>), NOT "pin a deterministic single-pass tool" —
      // so it may still enter the loop, which mounts that server's MCP tools.
      // System MCP intents (bahn/wetter/news) force the gate the same way: the
      // legacy pipeline has no executor for them, the loop mounts their tools.
      // `umfragen` (PolitPro) and `hilfe` (in-process docs index) are native
      // domain tools — always available, so they force the gate unconditionally.
      // `hilfe` MUST be here: @doku sets forcedTool, and without this escape
      // decideRunAgentic would keep the turn single-pass, where
      // `gruenerator_docs_search` does not exist — the mention would silently
      // do nothing.
      const isMcpTurn =
        classifiedState.intent === 'mcp' ||
        classifiedState.intent === 'umfragen' ||
        classifiedState.intent === 'hilfe' ||
        (classifiedState.intent != null && isSystemIntentAvailable(classifiedState.intent));
      const isSystemToolIntent =
        classifiedState.intent != null && SYSTEM_TOOL_INTENTS.has(classifiedState.intent);
      const lastUserText = lastUserMessage ? extractTextContent(lastUserMessage.content) : '';
      // Compound research+generation (Phase 3n): a generation ask (sharepic,
      // presentation, sheet, text doc, board) with an explicit research signal
      // goes through the loop with the matching fat tool; pure generation keeps
      // the direct dispatch + fixed text. The KIND is derived from the intent OR
      // — for a turn the classifier demoted to `agentic` — the text noun, so
      // "mach mir eine Tabelle draus" (which only reaches direct@0.50 → agentic)
      // still mounts the sheet tool. Computed AFTER the app platform gate +
      // refinement branches, so app redirects and refinements are unaffected.
      // Editor sidebars (docs/sheets/presentations/boards) EDIT the open
      // document — never create a NEW one. Signalled by an edit_current_* tool
      // being enabled + a current doc/board in scope.
      const editorSurface = isEditorSurface(enabledTools ?? undefined);
      // Target is tied to the ENABLED edit tool (not merely which raw artifact is
      // in scope) — a board sidebar that also carries a referenced document must
      // still edit the BOARD, not the stray doc.
      const editTarget: 'doc' | 'board' | null =
        enabledTools?.['edit_current_doc'] === true && rawCurrentDocument?.id
          ? 'doc'
          : enabledTools?.['edit_current_board'] === true && rawCurrentBoard?.id
            ? 'board'
            : null;
      const compoundKind =
        !forcedTool && !sharepicRefinement && !editorSurface
          ? compoundGenerationKind(classifiedState.intent, lastUserText)
          : null;
      const compoundGeneration = compoundKind != null;
      if (compoundKind) {
        classifiedState.compoundGeneration = true;
        classifiedState.compoundGenerationKind = compoundKind;
      }
      // Compound "research + edit the OPEN doc/board": research loop, then emit
      // the doc/board edit with the gathered sources as reference material. Only
      // in an editor surface with a current target and both a research + edit
      // signal. Respects the SAME single-pass kill-switches as decideRunAgentic
      // (loop flag, notebook-compound, image attachments) so forcing the loop
      // here can't bypass them.
      const isCompoundEdit = looksLikeCompoundEdit(lastUserText);
      const compoundEdit =
        editorSurface &&
        editTarget != null &&
        !forcedTool &&
        isAgenticLoopEnabled() &&
        !isCompound &&
        imageAttachments.length === 0 &&
        isCompoundEdit;
      if (compoundEdit) classifiedState.compoundEdit = true;

      // Tool-based editor edit: route the turn into the loop with the surface's
      // `edit_document` tool mounted, so the model can search then edit the OPEN
      // artifact in place (editor_operations SSE) instead of the client
      // round-trip to /api/{sheets,…}/:id/ai. Enabled by default for surfaces
      // with a tool path (TOOL_EDIT_SURFACES — currently only sheets, which isn't
      // live). The still-live surfaces (doc/board/canvas) resolve to a kind not
      // in that set → editToolLoop false → legacy trigger_doc_edit path unchanged.
      const editToolSurfaceKind = resolveEditorSurfaceKind(
        classifiedState.agentConfig?.identifier,
        enabledTools ?? undefined
      );
      const editToolLoop = decideEditToolLoop({
        loopEnabled: isAgenticLoopEnabled(),
        surfaceKind: editToolSurfaceKind,
        editToolEnabled:
          enabledTools?.['edit_current_doc'] === true ||
          enabledTools?.['edit_current_board'] === true,
        hasEditTarget: editTarget != null,
        forcedTool: !!forcedTool,
        isCompound,
        hasImageAttachments: imageAttachments.length > 0,
        secondaryIntent: classifiedState.secondaryIntent ?? null,
      });
      if (editToolLoop && editToolSurfaceKind) {
        classifiedState.editToolSurface = editToolSurfaceKind;
        log.info(
          `[ChatGraph] editToolLoop active — surface=${editToolSurfaceKind}, edit_document mounted (classifier intent=${classifiedState.intent})`
        );
      }

      // Conversational board add ("häng den fertigen Post an mein Kanban-Board"):
      // the classifier labels it modify_board, but the single-pass confirm path
      // needs an explicit @board target (rawBoardIds) and otherwise degrades to
      // "kopiere den Text manuell in die Karte". With NO board mention AND no open
      // board editor, demote to `agentic` so the loop's boards_tasks tool resolves
      // the board by name and adds the card via confirm. An @board mention or an
      // open board keep the direct single-pass path.
      if (
        classifiedState.intent === 'modify_board' &&
        (!rawBoardIds || rawBoardIds.length === 0) &&
        mentionTokenFields.boardIds.length === 0 &&
        !rawCurrentBoard &&
        !forcedTool
      ) {
        classifiedState.intent = 'agentic';
      }

      // The whole routing decision lives in the pure, unit-tested decideRunAgentic
      // (agenticLoop/routing.ts) — including the `direct`-question rescue.
      // compoundEdit forces the loop even for an edit_current_* intent (which
      // isn't otherwise a loop intent) — its guards above mirror decideRunAgentic's.
      const runAgentic =
        editToolLoop ||
        compoundEdit ||
        decideRunAgentic({
          loopEnabled: isAgenticLoopEnabled(),
          agenticIntents: AGENTIC_INTENTS,
          intent: classifiedState.intent,
          lastUserText,
          forcedTool: !!forcedTool,
          isMcpTurn,
          isCompound,
          secondaryIntent: classifiedState.secondaryIntent ?? null,
          compoundGeneration,
          hasImageAttachments: imageAttachments.length > 0,
          isPdfFillRequest:
            ((classifiedState.pdfFormAttachments?.length ?? 0) > 0 ||
              (classifiedState.threadAttachments ?? []).some(
                (a) => a.mimeType === 'application/pdf'
              )) &&
            isSheetFillRequest(lastUserText),
          classifierContradictedResearch: classifiedState.classifierContradictedResearch === true,
        });

      // A demoted turn that a kill-switch (compound, forced tool, ...) kept out
      // of the loop must not strand in executeIntentPipeline, which has no
      // 'agentic' branch — degrade to plain search.
      if (!runAgentic && classifiedState.intent === 'agentic') {
        classifiedState.intent = 'search';
      }
      // Same insurance for system tool intents: their tools exist only in the
      // loop, so an edge turn a kill-switch kept out degrades to web search.
      // Backfill the query — these intents are NON_SEARCH, so the classifier
      // nulled searchQuery and the web branch would otherwise search ''.
      if (!runAgentic && isSystemToolIntent) {
        classifiedState.intent = 'web';
        if (!classifiedState.searchQuery && lastUserText) {
          classifiedState.searchQuery = lastUserText;
        }
      }

      sse.send('intent', {
        intent: classifiedState.intent,
        message: getIntentMessage(classifiedState.intent),
        reasoning: classifiedState.reasoning,
        ...(classifiedState.searchQuery != null && { searchQuery: classifiedState.searchQuery }),
        ...(classifiedState.subQueries != null && { subQueries: classifiedState.subQueries }),
        ...(classifiedState.searchSources?.length && {
          searchSources: classifiedState.searchSources,
        }),
        ...(classifiedState.secondaryIntent != null && {
          secondaryIntent: classifiedState.secondaryIntent,
        }),
        ...(isCompound && { compound: true }),
        ...(runAgentic && { agentic: true }),
      });

      // === Recall tool-loop (flag-gated) ===
      // For the chat_history intent, let the model search + read the user's own
      // content on demand (size-probed) instead of pre-injecting everything.
      // Handles the whole turn; when off, falls through to the deterministic
      // chat_history branch in executeIntentPipeline below.
      if (
        classifiedState.intent === 'chat_history' &&
        isChatRecallLoopEnabled() &&
        actualThreadId &&
        lastUserMessage
      ) {
        const handled = await handleRecallToolLoop({
          sse,
          threadId: actualThreadId,
          userId,
          instruction: (extractTextContent(lastUserMessage.content) as string) || '',
          query:
            classifiedState.searchQuery ||
            (extractTextContent(lastUserMessage.content) as string) ||
            '',
          startTime: Date.now(),
        });
        if (handled) {
          await cleanupPending(true);
          return { status: 200 as const, body: undefined };
        }
      }

      // === Chat history context enrichment ===
      // Explicit: the user referenced a past conversation (classifier/regex).
      // Proactive: first turn of a new thread — surface a relevant past chat so
      // the assistant can continue with continuity, gated on the same
      // memory_enabled toggle as mem0. The `chat_history` tool handles its own
      // retrieval, so skip the proactive pass for it.
      const explicitRecall =
        classifiedState.searchSources?.includes('chat_history') && !!classifiedState.searchQuery;
      const proactiveRecall =
        isNewThread &&
        memoryEnabled &&
        !!lastUserMessage &&
        classifiedState.intent !== 'chat_history';

      // Space scope: when the thread is filed in a Space, recall is restricted to
      // that Space's chats and the model is told which threads it can search.
      const spaceScope = actualThreadId
        ? await getSpaceRecallScope(actualThreadId, userId).catch((err: unknown) => {
            // Was a bare noop — the Space roster silently vanished and recall
            // widened to all chats without anyone noticing.
            log.warn(`[ChatGraph] Space recall scope failed: ${err}`);
            return null;
          })
        : null;

      if (explicitRecall || proactiveRecall) {
        try {
          const recallQuery =
            classifiedState.searchQuery ||
            (lastUserMessage
              ? (extractTextContent(lastUserMessage.content) as string).slice(0, 200)
              : '');
          if (recallQuery.trim()) {
            // Fetch chats + office content + reels, then cross-source rerank to
            // the few most relevant — all inside the best-effort timeout.
            const recalled = await withTimeout(
              (async () => {
                const [chatResults, officeDocs, reels] = await Promise.all([
                  recallPastChats(userId, recallQuery, {
                    ...(actualThreadId != null && { excludeThreadId: actualThreadId }),
                    limit: 3,
                    ...(spaceScope && { threadIds: spaceScope.threadIds }),
                  }),
                  recallOfficeDocuments(userId, recallQuery, 3),
                  recallReels(userId, recallQuery, 3),
                ]);
                return rerankRecall(recallQuery, chatResults, officeDocs, 4, reels);
              })(),
              EXTERNAL_CONTEXT_TIMEOUT_MS,
              'past-work recall'
            ).catch(
              () =>
                ({ chats: [], officeDocs: [], reels: [] }) as Awaited<
                  ReturnType<typeof rerankRecall>
                >
            );
            const blocks = [
              spaceScope?.rosterBlock ?? '',
              recalled.chats.length > 0 ? formatPastChatsBlock(recalled.chats) : '',
              formatOfficeDocsBlock(recalled.officeDocs),
              formatReelsBlock(recalled.reels),
            ].filter(Boolean);
            if (blocks.length > 0) {
              classifiedState.chatHistoryContext = blocks.join('\n\n');
              log.info(
                `[ChatGraph] Injected recall: ${recalled.chats.length} chats, ${recalled.officeDocs.length} docs, ${recalled.reels.length} reels for "${recallQuery}" (${explicitRecall ? 'explicit' : 'proactive'})`
              );
            }
          }
        } catch (err) {
          // An EXPLICIT recall request ("was haben wir letzte Woche besprochen")
          // that finds nothing because the search broke must not read as "there
          // was nothing". Proactive recall is best-effort and stays quiet.
          log.warn(`[ChatGraph] Past-chat recall failed: ${err}`);
          if (explicitRecall) sendChatWarning(sse, 'recall_degraded');
        }
      }

      // Always surface the Space roster when filed in a Space, even if no recall
      // pass ran (so the model knows it can search the Space's chats on demand).
      if (spaceScope) {
        const existing = classifiedState.chatHistoryContext;
        if (!existing) {
          classifiedState.chatHistoryContext = spaceScope.rosterBlock;
        } else if (!existing.includes(spaceScope.rosterBlock)) {
          classifiedState.chatHistoryContext = `${spaceScope.rosterBlock}\n\n${existing}`;
        }
      }

      // === HITL: Check if clarification is needed ===
      // `actualThreadId` is part of the gate, not an assertion inside it: a
      // clarification the client cannot resume is worse than no clarification,
      // so a thread-less turn falls through to the normal pipeline instead.
      if (
        classifiedState.needsClarification &&
        actualThreadId != null &&
        !forcedTool &&
        !isCompound &&
        !initialState.attachmentContext &&
        !initialState.boardContext &&
        !initialState.documentMentionContext
      ) {
        log.info(`[ChatGraph] Clarification needed: "${classifiedState.clarificationQuestion}"`);

        const stepId = `clarify_${Date.now()}`;
        sse.sendRaw('thinking_step', {
          stepId,
          toolName: 'ask_human',
          title: 'Stelle Klärungsfrage...',
          status: 'in_progress',
          args: {
            question: classifiedState.clarificationQuestion,
            options: classifiedState.clarificationOptions,
          },
        });

        return suspendTurn(actualThreadId, {
          interruptType: 'clarification',
          question: classifiedState.clarificationQuestion!,
          ...(classifiedState.clarificationOptions != null && {
            options: classifiedState.clarificationOptions,
          }),
          threadId: actualThreadId,
        });
      }

      // === Client-tool interrupt: run-then-answer spreadsheet compute ===
      // Tabular aggregation question + a client that can execute Python
      // (web injects a Pyodide runner and declares clientTools:['run_python']):
      // generate pandas code server-side, pause the turn, let the browser run
      // the code and resume with the verified numbers. Mirrors the ask_human
      // interrupt sequence above; clients without the capability (mobile,
      // voice) fall through to the legacy prompt-guidance path.
      //
      // The gate re-checks the raw question text (not just intent==='compute'):
      // on multi-turn threads the vague-follow-up confidence penalty pushes the
      // tabular heuristic below threshold and the LLM classifies follow-ups
      // like "durchschnittlicher umsatz pro region?" as search/direct — which
      // silently degraded them to the legacy prompt-guidance path. Guards:
      // only hijackable intents (explicit tool intents like chart/image/
      // sharepic/web keep their flow), no @-forced tools, and the matcher
      // itself excludes text-metric ("wie viele zeichen") and visualization
      // questions.
      const computeOverridableIntents = new Set([
        'compute',
        'direct',
        'search',
        'summary',
        'compare',
      ]);
      // "Fill this in" takes precedence over the aggregation match: "trag die
      // Summe ein" is both, and writing the value into the sheet is the
      // stronger ask. Same interrupt, but codegen switches to openpyxl so the
      // template's formatting and formulas survive.
      const isSheetFill =
        computeOverridableIntents.has(classifiedState.intent) && isSheetFillRequest(lastUserText);
      const isTabularCompute =
        !isSheetFill &&
        computeOverridableIntents.has(classifiedState.intent) &&
        isTabularComputeQuestion(lastUserText);
      // Chart requests over an attached table compute their values FIRST —
      // without this the model invents the aggregation (beta: the category
      // split in the bar chart was fabricated). Intent stays 'chart'; the
      // resumed respond step builds the chart JSON from BERECHNUNGSERGEBNIS.
      const isTabularChart = classifiedState.intent === 'chart';
      if (
        (isSheetFill || isTabularCompute || isTabularChart) &&
        classifiedState.hasTabularAttachment &&
        !forcedTools?.length &&
        args.body.clientTools?.includes('run_python') &&
        actualThreadId != null
      ) {
        const { pythonCode, computeFailed } = await pandasComputeNode(
          classifiedState,
          isSheetFill ? { mode: 'fill' } : {}
        );
        // Codegen failed (as opposed to the model judging the question
        // unrelated to the table, which is a legitimate silent skip). Without
        // telling the model, it answers the numeric question from the truncated
        // table text — the hallucination this node exists to prevent.
        if (computeFailed) {
          sendChatWarning(sse, 'compute_failed');
          classifiedState.degradationNotes = [
            ...(classifiedState.degradationNotes ?? []),
            {
              code: 'compute_failed',
              modelHint:
                'Die Berechnung auf der Tabelle ist fehlgeschlagen. Rechne NICHT selbst und nenne keine Zahlen aus der Tabelle — sag ehrlich, dass die Auswertung gerade nicht möglich war.',
            },
          ];
        }
        if (pythonCode) {
          log.info(
            `[ChatGraph] run_python interrupt (${pythonCode.length} chars ${isSheetFill ? 'openpyxl fill' : 'pandas'} code)`
          );
          if (!isTabularChart) {
            // The resumed respond step should use the compute-mode guidance
            // even when the classifier had picked a different intent — and the
            // client already received the original intent event, so send a
            // corrective one before the tool card appears.
            classifiedState.intent = 'compute';
            sse.send('intent', {
              intent: 'compute',
              message: getIntentMessage('compute'),
              reasoning: isSheetFill ? 'Formular-Ausfüllen erkannt' : 'Tabellen-Berechnung erkannt',
            });
          }
          // Stashed for the error-correction round: if the client reports a
          // failed execution, the resume handler regenerates with this code +
          // the error message in context.
          classifiedState.pandasLastCode = pythonCode;
          classifiedState.pandasComputeMode = isSheetFill ? 'fill' : 'analyze';

          const stepId = `run_python_${Date.now()}`;
          sse.sendRaw('thinking_step', {
            stepId,
            toolName: 'run_python',
            title: isSheetFill ? 'Fülle Vorlage aus…' : 'Berechne mit pandas…',
            status: 'in_progress',
            args: { code: pythonCode },
          });

          return suspendTurn(actualThreadId, {
            interruptType: 'client_tool',
            toolName: 'run_python',
            args: { code: pythonCode },
            threadId: actualThreadId,
          });
        }
        // Codegen failed — continue with the normal pipeline (prompt guidance
        // still steers the model toward an auto-run code block).
      }

      // === Artifact-creating turns (@board/dokument/sheet/praesentation/pdf) ===
      // Every branch had the same shape — gate on the forced tool or the
      // classified intent, resolve the referential topic, call the handler,
      // discard the placeholder row, return. Five copies of that is how the pdf
      // branch ended up as the only one missing `await cleanupPending(true)`.
      const createTurnBase = {
        sse,
        classifiedState,
        aiWorkerPool,
        req,
        ...(actualThreadId != null && { actualThreadId }),
        userId,
      };
      /** What the artifact is ABOUT. A referential follow-up ("mach eine
       *  Tabelle dazu") names no subject, so the classifier resolves one against
       *  the history; `resolveReferentialTopic` covers the turns that never
       *  reached the LLM. The material to build FROM is separate and comes from
       *  runCreateTurn's transcript + source briefing. */
      const createTopic = (): string =>
        classifiedState.creationTopic ||
        resolveReferentialTopic(
          lastUserMessage ? extractTextContent(lastUserMessage.content) : '',
          classifiedState.messages ?? []
        ).text;

      const createRoutes: Array<{
        forcedTool: string;
        /** Classifier intent that also triggers it (the @-tool-only branches
         *  predate the create_* intents and have none). */
        intent?: string;
        /** Compound turns let the loop call the fat tool instead. */
        skipOnAgentic: boolean;
        run: () => Promise<boolean>;
      }> = [
        {
          forcedTool: 'board-erstellen',
          skipOnAgentic: false,
          // Board still takes the raw message: it resolves the topic itself.
          run: () => handleBoardCreation({ ...createTurnBase, lastUserMessage }),
        },
        {
          forcedTool: 'dokument-erstellen',
          skipOnAgentic: false,
          run: () =>
            generateAndCreateDocument({
              ...createTurnBase,
              userContent: createTopic(),
              intent: 'direct',
            }),
        },
        {
          forcedTool: 'sheet-erstellen',
          intent: 'create_sheet',
          skipOnAgentic: true,
          run: () => handleSheetCreation({ ...createTurnBase, userContent: createTopic() }),
        },
        {
          forcedTool: 'praesentation-erstellen',
          intent: 'create_presentation',
          skipOnAgentic: true,
          run: () => handlePresentationCreation({ ...createTurnBase, userContent: createTopic() }),
        },
        {
          forcedTool: 'pdf-erstellen',
          intent: 'create_pdf',
          skipOnAgentic: true,
          run: () =>
            handlePdfCreation({
              ...createTurnBase,
              userContent: createTopic(),
              userLocale: classifiedState.userLocale === 'de-AT' ? 'de-AT' : 'de-DE',
            }),
        },
      ];

      for (const route of createRoutes) {
        if (route.skipOnAgentic && runAgentic) continue;
        const triggered =
          forcedTools?.includes(route.forcedTool) === true ||
          (route.intent != null && classifiedState.intent === route.intent);
        if (!triggered) continue;
        if (await route.run()) {
          await cleanupPending(true);
          return { status: 200 as const, body: undefined };
        }
      }

      // === EXPERIMENTAL: create_recurring_task intent ===
      // Falls through to the normal pipeline if extraction fails.
      if (!runAgentic && classifiedState.intent === 'create_recurring_task') {
        const lastUserText = lastUserMessage ? extractTextContent(lastUserMessage.content) : '';
        const created = await handleRecurringTaskCreation({
          sse,
          classifiedState,
          aiWorkerPool,
          req,
          ...(actualThreadId != null && { actualThreadId }),
          userId,
          userContent: lastUserText as string,
          agentId: agentId ?? null,
          userLocale: classifiedState.userLocale === 'de-AT' ? 'de-AT' : 'de-DE',
        });
        if (created) {
          await cleanupPending(true);
          return { status: 200 as const, body: undefined };
        }
      }

      // === Handle share_doc intent ===
      if (classifiedState.intent === 'share_doc' && actualThreadId) {
        const handled = await handleShareDoc({
          sse,
          classifiedState,
          actualThreadId,
          userId,
          ...(lastUserMessage != null && { lastUserMessage }),
          ...(rawDocMentionIds != null && { rawDocMentionIds }),
          ...(rawDocumentChatIds != null && { rawDocumentChatIds }),
        });
        if (handled) {
          await cleanupPending(true);
          return { status: 200 as const, body: undefined };
        }
      }

      // === HITL: Sharepic without a topic → ask before generating ===
      // Unlike the generic clarification above this fires even for forced @sharepic,
      // because a bare "@sharepic" / "zitat sharepic" has the intent but no subject.
      if (classifiedState.intent === 'sharepic' && actualThreadId && !sharepicRefinement) {
        const sharepicText = lastUserTextNoMentions;
        // Ask only when the THREAD has no subject either. "Jetzt noch ein
        // normales sharepic" carries none of its own, but the turn before it
        // does — and runSharepicGeneration resolves exactly that. Asking here
        // would throw away a topic the pipeline already knows. Both resolution
        // paths count, in the order the generator tries them.
        const topicResolvable =
          !!classifiedState.creationTopic ||
          resolveReferentialTopic(sharepicText as string, classifiedState.messages ?? []).inherited;
        if (isSharepicTopicMissing(sharepicText as string) && !topicResolvable) {
          log.info('[ChatGraph] Sharepic topic missing — asking user for the topic');

          const stepId = `clarify_${Date.now()}`;
          const question = 'Zu welchem Thema soll ich das Sharepic erstellen?';
          const options = ['Klimaschutz', 'Soziale Gerechtigkeit', 'Verkehrswende', 'Artenschutz'];

          sse.sendRaw('thinking_step', {
            stepId,
            toolName: 'ask_human',
            title: 'Stelle Klärungsfrage...',
            status: 'in_progress',
            args: { question, options },
          });

          return suspendTurn(actualThreadId, {
            interruptType: 'clarification',
            question,
            options,
            threadId: actualThreadId,
          });
        }
      }

      // === Stage 2 + 3: Response generation ===
      type PipelineResult = Awaited<ReturnType<typeof executeIntentPipeline>>;
      let finalState: PipelineResult['finalState'];
      let generatedImage: PipelineResult['generatedImage'];
      let sharepicVariants: PipelineResult['sharepicVariants'];
      let socialPost: PipelineResult['socialPost'];
      let socialPostRefused: PipelineResult['socialPostRefused'] = false;
      let socialPostRefusalIsPolicy: PipelineResult['socialPostRefusalIsPolicy'] = false;
      let fullText: string | null;
      let agenticSteps: PersistedStep[] | undefined;
      // Presentation/sheet created by a compound loop tool — lifted from the
      // shared state and persisted as message-level `createdDocument` metadata
      // (the single-pass handlers persist it directly; the loop path lifts it).
      let createdDocument: CreatedDocument | null = null;
      // Board created by a compound loop tool — boards have no card path, so
      // this is emitted in the `done` event (boardId + boardGeneratedStructure),
      // the way the single-pass @board-erstellen handler does.
      let createdBoard: ChatGraphState['createdBoard'] = null;
      // Captured inside withLangfuseTrace so the final `done` event can hand the
      // chat-turn trace id to the client for feedback scoring. undefined when
      // Langfuse is disabled or this turn skips the respond LLM call.
      let langfuseTraceId: string | undefined;

      // From here on the reply streams into the placeholder row. Registering the
      // listener only now keeps the earlier handler branches (which stream their
      // own text and persist their own rows) out of the placeholder.
      const activeWriter = pendingWriter;
      if (activeWriter) {
        sse.setTextListener((kind, text) => activeWriter.onText(kind, text));
      }

      if (runAgentic) {
        // Agentic path: the model holds the search tools and loops until it can
        // answer, writing the reply in the same streamed turn. Stage 2's
        // pre-decided single search is skipped entirely.
        const systemMessage = await buildSystemMessage(classifiedState);
        const prunedValidMessages = pruneMessages(
          validMessages as Parameters<typeof pruneMessages>[0],
          contextWindowTokens
        );
        const { systemMessage: finalSystemMessage, messages: contextMessages } = actualThreadId
          ? await applyCompaction(
              actualThreadId,
              prunedValidMessages,
              systemMessage,
              contextWindowTokens
            )
          : { systemMessage, messages: prunedValidMessages };

        const outcome = await streamAgenticResponse({
          finalState: classifiedState,
          systemMessage: finalSystemMessage,
          messages: contextMessages as ModelMessage[],
          ...(modelId != null && { modelId }),
          requestId,
          sse,
          req,
          threadId: actualThreadId ?? null,
        });

        finalState = classifiedState;
        finalState.citations = outcome.citations;
        if (outcome.sources.length > 0) {
          finalState.searchResults = outcome.sources;
          finalState.searchCount = outcome.sources.length;
        }
        // The generate_image loop tool merges its result onto the shared state;
        // lift it so the assistant message persists the image (its rehydration
        // reads message-level generatedImage metadata, not the tool-call).
        generatedImage = finalState.generatedImage ?? null;
        // Same lift for the sharepic fat tool (compound turns) — persistence
        // reads the variants from the recorded tool step, but the non-empty
        // check + fixed confirmation branches key on this variable.
        sharepicVariants = finalState.sharepicVariants ?? [];
        // Same lift for the presentation/sheet fat tools (compound turns).
        createdDocument = finalState.createdDocument ?? null;
        createdBoard = finalState.createdBoard ?? null;
        socialPost = null;
        fullText = outcome.fullText;
        agenticSteps = outcome.steps;
      } else {
        // === Stage 2: Search or Image Generation ===
        ({
          finalState,
          generatedImage,
          sharepicVariants,
          socialPost,
          socialPostRefused,
          socialPostRefusalIsPolicy,
        } = await executeIntentPipeline({
          classifiedState,
          sse,
          forcedTool,
          ...(enabledTools != null && { enabledTools }),
          imageAttachments,
          req,
          threadId: actualThreadId ?? null,
          ...(sharepicRefinement && { sharepicRefinement }),
        }));

        // === Stage 3: Response generation ===
        if (finalState.intent === 'social_post') {
          // Combined post (EXPERIMENTAL): both halves were already produced +
          // streamed in Stage 2 (social_post_complete / sharepic_complete).
          // Fixed confirmation like the sharepic branch — no extra LLM call.
          const hasText = socialPost != null;
          const n = sharepicVariants.length;
          fullText = socialPostRefused
            ? // The text model refused, so both halves were discarded. Say so
              // plainly — the old copy promised "dein Post mit N Varianten"
              // because it only checked that SOME text came back.
              //
              // Only name the POLICY reason when the sharepic half declined on
              // the same request; otherwise all we know is that no usable post
              // came back, and asserting the fabricated-quote reason accused
              // the user of something they never asked for (live: a plain
              // request for an English version of their own post).
              socialPostRefusalIsPolicy
              ? ARTIFACT_CONFIRMATION_TEXTS.postRefusedPolicy
              : ARTIFACT_CONFIRMATION_TEXTS.postRefusedGeneric
            : hasText && n > 0
              ? buildPostWithSharepicsConfirmation(n)
              : // A post is text-only unless the user named a sharepic. Without
                // this split, every ordinary post reported a FAILED sharepic
                // that was never requested.
                hasText && !sharepicLicensed
                ? ARTIFACT_CONFIRMATION_TEXTS.postTextOnly
                : hasText
                  ? ARTIFACT_CONFIRMATION_TEXTS.postSharepicFailed
                  : n > 0
                    ? buildSharepicsWithoutPostConfirmation(n)
                    : ARTIFACT_CONFIRMATION_TEXTS.genericFailed;
          sse.send('response_start', { message: PROGRESS_MESSAGES.responseStart });
          sse.send('text_delta', { text: fullText });
        } else if (finalState.intent === 'sharepic') {
          // Sharepic variants were already produced + streamed in Stage 2 (sharepic_complete).
          // Skip the LLM — with the still-vague topic it asks clarifying questions over the
          // already-finished sharepic. Emit a fixed confirmation instead so the user sees the
          // assistant knows the sharepic exists. Also covers the all-variants-failed case.
          const n = sharepicVariants.length;
          const deckSlides = sharepicVariants[0]?.pages?.length;
          fullText =
            n > 0
              ? buildSharepicConfirmation(n, deckSlides)
              : ARTIFACT_CONFIRMATION_TEXTS.sharepicFailed;
          sse.send('response_start', { message: PROGRESS_MESSAGES.responseStart });
          sse.send('text_delta', { text: fullText });
        } else {
          sse.send('response_start', { message: PROGRESS_MESSAGES.responseStart });

          const systemMessage = await buildSystemMessage(finalState);
          const agentConfigForResolve = {
            provider: finalState.agentConfig.provider as string,
            model: finalState.agentConfig.model,
            ...(finalState.agentConfig.defaultModel != null && {
              defaultModel: finalState.agentConfig.defaultModel,
            }),
          };
          const resolution = await resolveModel(
            agentConfigForResolve,
            modelId ?? undefined,
            requestId,
            {
              hasImages: imageAttachments.length > 0,
              intent: finalState.intent,
              agentId: finalState.agentConfig.identifier,
              // Measured BEFORE pruning on purpose: the question is "does this
              // turn need a bigger lane", and pruning is exactly the loss we
              // want to avoid by answering it.
              estimatedInputTokens: estimateRequestTokens(systemMessage, validMessages),
              ...(finalState.complexity != null && { complexity: finalState.complexity }),
            }
          );
          if (resolution.unknownModelId) {
            sse.send('warning', {
              code: 'unknown_model_id',
              message: `Modell "${resolution.unknownModelId}" ist nicht verfügbar — Standardmodell wird verwendet.`,
            });
          }

          // contextWindowTokens was computed before the classifier ran, when
          // `auto` had no concrete model yet (→ conservative 32k default). Now
          // that the policy has picked a lane, use its real window so a
          // long-context model isn't compacted as if it were a short one.
          //
          // This MUST be resolved before pruning, not just before compaction:
          // pruneMessages physically drops the oldest turns, so running it on
          // the stale 32k default trimmed a 128k lane to ~20k tokens and
          // compaction then only ever saw the survivors.
          const resolvedContextWindow = resolution.contextWindow ?? contextWindowTokens;
          const prunedValidMessages = pruneMessages(
            validMessages as Parameters<typeof pruneMessages>[0],
            resolvedContextWindow
          );
          const { systemMessage: finalSystemMessage, messages: contextMessages } = actualThreadId
            ? await applyCompaction(
                actualThreadId,
                prunedValidMessages,
                systemMessage,
                resolvedContextWindow
              )
            : { systemMessage, messages: prunedValidMessages };

          let messagesForAI = buildMessagesForAI(
            finalSystemMessage,
            contextMessages as Parameters<typeof buildMessagesForAI>[1]
          );
          // image_edit narrates from BILDVERGLEICH text descriptions; the raw image
          // would put bytes in front of a non-vision model (since we no longer
          // force-switch above) and create a redundant grounding source for vision
          // models — skip injection so the descriptions are the single source.
          if (finalState.intent !== 'image_edit') {
            messagesForAI = injectImageAttachments(
              messagesForAI as Parameters<typeof injectImageAttachments>[0],
              imageAttachments,
              requestId
            );
          }

          const respondTelemetry = buildAiTelemetry('chat-graph.respond', {
            requestId,
            intent: finalState.intent,
            ...(agentId && { agentId }),
            ...(modelId && { modelId }),
          });

          try {
            // One Langfuse trace per chat turn: the respond generation (and any
            // sibling-fallback retry) nest under this `chat-turn` root span, and
            // `traceId` is captured for the client feedback score.
            fullText = await withLangfuseTrace(
              {
                name: 'chat-turn',
                ...(userId && { userId }),
                ...(actualThreadId && { sessionId: actualThreadId }),
                metadata: {
                  requestId,
                  intent: finalState.intent,
                  ...(agentId && { agentId }),
                  ...(modelId && { modelId }),
                },
              },
              async (traceId) => {
                langfuseTraceId = traceId;
                return streamWithFallback({
                  primary: resolution,
                  sse,
                  logPrefix: '[ChatGraph]',
                  buildStream: async (r) =>
                    // No output cap (OpenWebUI-style): the provider/model window is
                    // the backstop; agentConfig.params.max_tokens is deliberately
                    // ignored here so answers are never cut mid-sentence.
                    streamForResolution({
                      resolution: r,
                      messages: messagesForAI as Parameters<
                        typeof streamForResolution
                      >[0]['messages'],
                      temperature: finalState.agentConfig.params.temperature,
                      sse,
                      logPrefix: '[ChatGraph]',
                      ...(respondTelemetry && { telemetry: respondTelemetry }),
                    }),
                });
              }
            );
          } finally {
            if (resolution.releaseSlot) await resolution.releaseSlot();
          }

          if (fullText === null) {
            // Generation failed, but the retrieval that preceded it was real and
            // expensive. Keep its sources on the thread so the retry rehydrates
            // them instead of paying for the whole deep-research run again.
            if (pendingId && (finalState.searchResults?.length ?? 0) > 0) {
              const kept = await persistSourcesOnFailure(
                pendingId,
                RESEARCH_KEPT_ON_FAILURE_TEXT,
                finalState.searchResults.slice(0, MAX_SOURCES),
                finalState.searchQuery ?? undefined
              ).catch(() => false);
              if (kept) {
                log.info(
                  `[ChatGraph] Generation failed — kept ${finalState.searchResults.length} researched source(s) for the retry`
                );
                await cleanupPending(false);
                return { status: 200 as const, body: undefined };
              }
            }
            await cleanupPending(true);
            return { status: 200 as const, body: undefined };
          }

          // The single-pass synth model cites numbers the registry can't back —
          // out-of-range ("[5]" with 3 sources) or, worst, [N] placeholders when
          // there are NO sources at all (observed on at-gruene-position). The
          // agentic loop already clamps; this is its single-pass equivalent. When
          // anything changes, push the corrected text via `completion` so the
          // frontend replaces the streamed deltas (same channel as the notebook flow).
          const sanity = stripFabricatedSystemClaims(fullText, [
            finalState.attachmentContext ?? '',
            finalState.currentDocument?.title ?? '',
            ...finalState.searchResults.map((r) => `${r.title ?? ''} ${r.content ?? ''}`),
          ]);
          if (sanity.fabricated.length > 0) {
            log.warn(
              `[ChatGraph] Removed fabricated internal file claim(s): ${sanity.fabricated.join(', ')}`
            );
            fullText = sanity.text;
          }
          const citeClamp = stripOutOfRangeCitations(fullText, finalState.citations.length);
          if (citeClamp.changed || sanity.fabricated.length > 0) {
            fullText = citeClamp.text;
            sse.send('completion', { text: fullText, citations: finalState.citations });
          }
        }
      }

      // Narrow fullText for the extraction/persist stages: the agentic path
      // always yields text; the pipeline path already returned above on null.
      if (fullText === null) {
        await cleanupPending(true);
        return { status: 200 as const, body: undefined };
      }

      // === Stage 3b: Extract chart data from response (if chart intent) ===
      if (finalState.intent === 'chart') {
        const chartData = extractChartFromResponse(fullText);
        if (chartData) {
          sse.send('chart_data', { chart: chartData });
          log.info(
            `[ChatGraph] Chart data extracted: ${chartData.type} with ${chartData.data.length} points`
          );
        }
      }

      // === Stage 3b': Extract generic artifact (HTML/SVG) from response ===
      // Explicit `artifact` intent → surface any valid block. Any other intent
      // → auto-detect, but only a *complete* HTML/SVG document (not an
      // illustrative snippet), so a normal answer with an example ```html block
      // doesn't spuriously dock a panel. Skip `chart` (own ```chart fence).
      if (finalState.intent !== 'chart') {
        const artifact = extractArtifactFromResponse(fullText, {
          isArtifactIntent: finalState.intent === 'artifact',
        });
        if (artifact) {
          sse.send('artifact', { artifact });
          log.info(
            `[ChatGraph] Artifact extracted: ${artifact.type} (${artifact.content.length} chars)`
          );
        }
      }

      // === Stage 3c: Live document edit trigger (docs editor surface only) ===
      // For edit_current_doc intent, emit a `trigger_doc_edit` SSE event with
      // the user's prompt + selection flag. The docs-editor frontend dispatches
      // this into BlockNote's AIExtension.invokeAI(), which runs the existing
      // /api/docs/ai pipeline (tool calls → applyDocumentOperations → Yjs sync).
      // ChatGraph never edits the doc itself — it just classifies and forwards.
      //
      // Reference content channel: short referential commands like "füge dies
      // ein" or "im dokument einfügen" point at the previous assistant turn
      // (the rewritten Antrag the chat produced earlier). BlockNote AI sees
      // only the document — not chat history. We forward the prior substantive
      // assistant message as a SEPARATE `referenceContent` field; it lands in
      // the docs-AI route's *system prompt* as labeled instructional context,
      // never concatenated into userPrompt (an earlier attempt did that and
      // the model inserted the wrapper text verbatim into the document).
      //
      // "Substantive" = ≥200 chars, which skips the brief edit-confirmation
      // ("Ich passe das Dokument an…") that respondNode itself just emitted
      // and lands on the earlier turn that actually contains the content.
      // compoundEdit (research + edit) forces this even when the intent isn't
      // edit_current_doc: the research loop just ran, and its gathered sources
      // become the reference material (instead of a prior assistant turn).
      // NOTE: the CANVAS (sharepic editor) also rides this path — it sets
      // customEnabledTools.edit_current_doc and sends currentDocument.id = docKey,
      // so a canvas edit dispatches trigger_doc_edit here too (its handler calls
      // /api/canvas/ai-suggest). Don't add doc-only assumptions under this branch
      // without also checking resolveEditorSurfaceKind !== 'canvas'.
      if (
        !editToolLoop &&
        (finalState.intent === 'edit_current_doc' || (compoundEdit && editTarget === 'doc')) &&
        rawCurrentDocument?.id
      ) {
        const lastUserText = lastUserMessage ? extractTextContent(lastUserMessage.content) : '';
        const referenceContent = buildEditReferenceContent(
          compoundEdit,
          finalState.searchResults,
          validMessages as ModelMessage[],
          lastUserMessage as ModelMessage | undefined
        );
        const hasSelection = !!rawCurrentDocument.selectionText;
        sse.send('trigger_doc_edit', {
          targetDocumentId: rawCurrentDocument.id,
          userPrompt: lastUserText,
          useSelection: hasSelection,
          ...(referenceContent.trim() ? { referenceContent } : {}),
        });
        log.info(
          `[ChatGraph] Emitted trigger_doc_edit for doc ${rawCurrentDocument.id} (selection: ${hasSelection}, compoundEdit: ${compoundEdit}, refContentChars: ${referenceContent.length})`
        );
      }

      // === Stage 3d: Live board edit trigger (boards editor surface only) ===
      // For edit_current_board intent, emit a `trigger_board_action` SSE event
      // with the user's prompt. The boards-editor frontend calls POST
      // /api/boards/:id/ai to plan operations, then applies them to the live
      // Yjs board. ChatGraph never edits the board itself — classify + forward.
      if (
        !editToolLoop &&
        (finalState.intent === 'edit_current_board' || (compoundEdit && editTarget === 'board')) &&
        rawCurrentBoard?.id
      ) {
        const lastUserText = lastUserMessage ? extractTextContent(lastUserMessage.content) : '';
        const referenceContent = buildEditReferenceContent(
          compoundEdit,
          finalState.searchResults,
          validMessages as ModelMessage[],
          lastUserMessage as ModelMessage | undefined
        );
        sse.send('trigger_board_action', {
          targetBoardId: rawCurrentBoard.id,
          userPrompt: lastUserText,
          ...(referenceContent.trim() ? { referenceContent } : {}),
        });
        log.info(
          `[ChatGraph] Emitted trigger_board_action for board ${rawCurrentBoard.id} (compoundEdit: ${compoundEdit}, refContentChars: ${referenceContent.length})`
        );
      }

      // === Stage 4: Persist & complete ===
      // Stop the placeholder writer BEFORE persist: its final throttle write
      // must not race the finalize UPDATE (both write the same row).
      await cleanupPending(false);
      // Kicked off here but awaited only after sse.end(): the client already
      // has the full response, so a slow Postgres write must not delay the
      // done event. persistAssistantResponse catches its own errors.
      const persistPromise = persistAssistantResponse({
        threadId: actualThreadId!,
        userId,
        fullText,
        finalState,
        classifiedState,
        generatedImage,
        sharepicVariants,
        socialPost,
        createdDocument,
        isNewThread,
        lastUserMessage: lastUserMessage as ModelMessage,
        processedMeta,
        aiWorkerPool,
        requestId,
        memoryEnabled,
        ...(agentId != null && { agentId }),
        ...(agenticSteps != null && { agenticSteps }),
        ...(langfuseTraceId != null && { traceId: langfuseTraceId }),
        ...(pendingId != null && { pendingMessageId: pendingId }),
      });

      // === Stage 4b: Emit confirm_action for intents that need user approval ===
      if (actualThreadId && classifiedState.intent !== 'save_as_doc') {
        await emitConfirmAction({
          sse,
          actualThreadId,
          userId,
          fullText,
          finalState,
          classifiedState,
          ...(rawDocMentionIds != null && { rawDocMentionIds }),
          ...(rawBoardIds != null && { rawBoardIds }),
        });
      }

      // === Stage 4c: Handle save_as_doc (primary or secondary intent) ===
      const isSaveAsDoc =
        classifiedState.intent === 'save_as_doc' ||
        classifiedState.secondaryIntent === 'save_as_doc';
      if (isSaveAsDoc && fullText) {
        const lastUserText = lastUserMessage ? extractTextContent(lastUserMessage.content) : '';
        // Same transcript builder the other create turns use, so "speicher das
        // als Dokument" and "mach ein PDF draus" see the same thread. It used to
        // be a hand-rolled `slice(-4)` here and nothing at all there. The answer
        // being saved is generated in THIS turn and is not in `validMessages`
        // yet, so it is appended.
        const conversationContext = [
          buildCreateTurnContext(validMessages),
          `assistant: ${fullText.slice(0, 3000)}`,
        ]
          .filter((part) => part.trim())
          .join('\n');

        await generateAndCreateDocument({
          sse,
          classifiedState,
          aiWorkerPool,
          req,
          ...(actualThreadId != null && { actualThreadId }),
          userId,
          userContent: lastUserText,
          subtypeOverride: classifiedState.documentSubtype,
          conversationContext,
          intent: 'save_as_doc',
          skipTerminate: true,
        });
      }

      const totalTimeMs = Date.now() - finalState.startTime;
      sse.send('done', {
        ...(actualThreadId != null && { threadId: actualThreadId }),
        citations: finalState.citations,
        generatedImage,
        // Compound board turn: boards render from these `done` fields (no card
        // SSE), mirroring the single-pass @board-erstellen handler.
        ...(createdBoard != null && {
          boardId: createdBoard.boardId,
          boardGeneratedStructure: createdBoard.boardGeneratedStructure,
        }),
        metadata: {
          intent: finalState.intent,
          searchCount: finalState.searchCount || 0,
          totalTimeMs,
          ...(finalState.classificationTimeMs != null && {
            classificationTimeMs: finalState.classificationTimeMs,
          }),
          ...(finalState.searchTimeMs != null && { searchTimeMs: finalState.searchTimeMs }),
          ...(finalState.imageTimeMs != null && { imageTimeMs: finalState.imageTimeMs }),
          ...(finalState.summaryTimeMs != null && { summaryTimeMs: finalState.summaryTimeMs }),
          ...(memoryRetrieveTimeMs > 0 && { memoryRetrieveTimeMs }),
          ...(langfuseTraceId != null && { traceId: langfuseTraceId }),
        },
      });

      log.info(`[ChatGraph] Complete: ${fullText.length} chars in ${totalTimeMs}ms`);
      // Await BEFORE ending the stream: the client keeps reading until the
      // stream closes, so a warning emitted here still reaches it. Previously
      // this ran after sse.end() and a failed persist had no way to be
      // reported — the turn looked perfect live and was gone on reload.
      const persistOutcome = await persistPromise;
      if (!persistOutcome.ok) sendChatWarning(sse, 'persist_failed');
      sse.end();
      // Safety net: if persist finalized (or skipped) but the placeholder is
      // still an empty streaming row (e.g. persist bailed on its own guard),
      // drop it so it can't read as an interrupted turn.
      if (pendingId) await discardPendingAssistantIfEmpty(pendingId).catch(() => {});
      return { status: 200 as const, body: undefined };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      const { agentId, threadId, modelId } = args.body;
      log.error(
        `[ChatGraph] Controller error: ${errorMessage} ` +
          `(agentId=${agentId ?? 'default'}, threadId=${threadId ?? 'new'}, modelId=${modelId ?? 'default'})`
      );
      if (errorStack) log.error(`[ChatGraph] Stack: ${errorStack}`);
      if (!(error instanceof Error))
        log.error(`[ChatGraph] Raw error: ${JSON.stringify(error)?.slice(0, 500)}`);
      // Best-effort: stop the writer and drop the placeholder only if empty. A
      // row that already streamed partial text stays 'streaming' → renders as an
      // aborted turn; discard clears just the empty one.
      await cleanupPending(true).catch(() => {});
      sseInternalError(sse, error);
      return { status: 200 as const, body: undefined };
    }
  },

  resume: async (args) => {
    const sse = createSSEStream(args.res);
    return runChatGraphResume({ req: args.req, body: args.body, sse });
  },
});

/**
 * Mount the ts-rest contract router onto an Express app instance.
 */
export function mountChatGraphContractRouter(app: Application): void {
  createExpressEndpoints(chatGraphContract, chatGraphContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'chatGraphContract'),
  });
}
