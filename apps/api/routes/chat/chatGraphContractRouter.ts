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

import { chatGraphContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import {
  classifierNode,
  pandasComputeNode,
  buildSystemMessage,
} from '../../agents/langgraph/ChatGraph/index.js';
import { isTabularComputeQuestion } from '../../agents/langgraph/ChatGraph/nodes/classifierHeuristics.js';
import { isReasoningStreamModel } from '../../services/ai/regoloReasoningStream.js';
import {
  SYSTEM_TOOL_INTENTS,
  isSystemIntentAvailable,
} from '../../services/mcp/systemMcpServers.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { createLogger } from '../../utils/logger.js';
import { withTimeout } from '../../utils/withTimeout.js';

import {
  streamAgenticResponse,
  isAgenticLoopEnabled,
  AGENTIC_INTENTS,
} from './services/agenticLoop/agenticRespondService.js';
import {
  compoundGenerationKind,
  looksLikeCompoundEdit,
  isEditorSurface,
  decideRunAgentic,
  resolveEditorSurfaceKind,
  decideEditToolLoop,
} from './services/agenticLoop/routing.js';
import { type PersistedStep } from './services/agenticLoop/types.js';
import { extractArtifactFromResponse } from './services/artifactExtraction.js';
import { injectImageAttachments } from './services/attachmentProcessingService.js';
import { extractCompoundTopic } from './services/compoundTopicExtractor.js';
import { extractChartFromResponse, emitConfirmAction } from './services/confirmActionService.js';
import { pruneMessages, applyCompaction } from './services/contextPruningService.js';
import {
  handleBoardCreation,
  handleSheetCreation,
  handlePresentationCreation,
  handleRecurringTaskCreation,
  generateAndCreateDocument,
  handleShareDoc,
  executeIntentPipeline,
} from './services/intentExecutionService.js';
import { extractTextContent } from './services/messageHelpers.js';
import {
  recallPastChats,
  recallOfficeDocuments,
  rerankRecall,
  formatPastChatsBlock,
  formatOfficeDocsBlock,
} from './services/pastChatRecallService.js';
import { pipelineStateStore } from './services/pipelineStateStore.js';
import { APP_REDIRECT_TEXTS } from './services/platformGating.js';
import { persistAssistantResponse } from './services/postResponseService.js';
import { handleRecallToolLoop, isChatRecallLoopEnabled } from './services/recallToolLoopService.js';
import {
  buildReelContextBlock,
  handleReelEdit,
  hasReelEditVerb,
  isReelEditInstruction,
} from './services/reelEditService.js';
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
import { handleSharepicEdit, isSharepicEditInstruction } from './services/sharepicEditService.js';
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
} from './services/sseHelpers.js';
import { buildStreamContext } from './services/streamContext.js';
import { createMessage, touchThread } from './services/threadPersistenceService.js';

import type { ChatGraphState, CreatedDocument } from '../../agents/langgraph/ChatGraph/types.js';
import type { ModelMessage } from 'ai';
import type { Application } from 'express';

const log = createLogger('chatGraphContractRouter');

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
      } = ctxResult.ctx;

      const {
        agentId,
        forcedTools,
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

      // === Stage 1: Classify ===
      const classifiedState = {
        ...initialState,
        ...(await classifierNode(initialState)),
      } as ChatGraphState;

      let forcedTool: boolean = false;
      log.info(
        `[ChatGraph] forcedTools received: ${JSON.stringify(forcedTools)}, classifier intent: ${classifiedState.intent}`
      );

      // === Compound query detection ===
      const isCompound = notebookIds.length > 0 && !!agentId && agentId !== 'gruenerator-universal';
      classifiedState.isCompound = isCompound;

      if (isCompound) {
        log.info(
          `[ChatGraph] Compound query detected: notebooks=[${notebookIds.join(',')}], agent=${agentId}`
        );

        if (!classifiedState.searchQuery) {
          const userText = lastUserMessage ? extractTextContent(lastUserMessage.content) : '';
          classifiedState.searchQuery = extractCompoundTopic(userText, notebookIds);
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
          const userText = extractTextContent(lastUserMessage.content).trim();
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
          const userText = extractTextContent(lastUserMessage.content).trim();
          if (userText) classifiedState.searchQuery = userText;
        }
        log.info('[ChatGraph] Intent forced to "bundestag" via @bundestag mention');
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
            const userText = extractTextContent(lastUserMessage.content).trim();
            if (userText) {
              classifiedState.searchQuery = userText;
              log.info(
                `[ChatGraph] searchQuery populated from last user message for forced ${forced}: "${userText.slice(0, 60)}"`
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
        if (handled) return { status: 200 as const, body: undefined };
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
        const reelText = (extractTextContent(lastUserMessage.content) || '').trim();
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
          if (handled) return { status: 200 as const, body: undefined };
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
          const redirectText = APP_REDIRECT_TEXTS.sharepic;
          sse.send('response_start', { message: PROGRESS_MESSAGES.responseStart });
          sse.send('text_delta', { text: redirectText });
          sse.send('done', {
            threadId: actualThreadId ?? null,
            citations: [],
            metadata: {
              intent: classifiedState.intent,
              searchCount: 0,
              totalTimeMs: Date.now() - initialState.startTime,
              classificationTimeMs: classifiedState.classificationTimeMs,
              searchTimeMs: 0,
            },
          });
          if (actualThreadId) {
            try {
              await createMessage(actualThreadId, 'assistant', redirectText, {
                intent: 'sharepic',
              });
              await touchThread(actualThreadId);
            } catch (err) {
              log.error('[ChatGraph] Failed to persist app sharepic redirect:', err);
            }
          }
          sse.end();
          return { status: 200 as const, body: undefined };
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
        const editText = ((extractTextContent(lastUserMessage.content) as string) || '').trim();
        if (editText && isSocialTextEditInstruction(editText)) {
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
          if (handled) return { status: 200 as const, body: undefined };
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
        const editText = ((extractTextContent(lastUserMessage.content) as string) || '')
          .replace(/@sharepic\b/gi, ' ')
          .trim();
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
        if (
          editText &&
          (isSharepicEditInstruction(editText) ||
            isSharepicRefinement(editText) ||
            sharepicModeRelaxed)
        ) {
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
          if (handled) return { status: 200 as const, body: undefined };
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
        const followText = (extractTextContent(lastUserMessage.content) as string) || '';
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
      // `umfragen` is a native domain tool (PolitPro service) — always
      // available, so it forces the gate unconditionally.
      const isMcpTurn =
        classifiedState.intent === 'mcp' ||
        classifiedState.intent === 'umfragen' ||
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
        if (handled) return { status: 200 as const, body: undefined };
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

      if (explicitRecall || proactiveRecall) {
        try {
          const recallQuery =
            classifiedState.searchQuery ||
            (lastUserMessage
              ? (extractTextContent(lastUserMessage.content) as string).slice(0, 200)
              : '');
          if (recallQuery.trim()) {
            // Fetch chats + office content, then cross-source rerank to the few
            // most relevant — all inside the best-effort timeout.
            const recalled = await withTimeout(
              (async () => {
                const [chatResults, officeDocs] = await Promise.all([
                  recallPastChats(userId, recallQuery, {
                    ...(actualThreadId != null && { excludeThreadId: actualThreadId }),
                    limit: 3,
                  }),
                  recallOfficeDocuments(userId, recallQuery, 3),
                ]);
                return rerankRecall(recallQuery, chatResults, officeDocs, 4);
              })(),
              EXTERNAL_CONTEXT_TIMEOUT_MS,
              'past-work recall'
            ).catch(
              () => ({ chats: [], officeDocs: [] }) as Awaited<ReturnType<typeof rerankRecall>>
            );
            const blocks = [
              recalled.chats.length > 0 ? formatPastChatsBlock(recalled.chats) : '',
              formatOfficeDocsBlock(recalled.officeDocs),
            ].filter(Boolean);
            if (blocks.length > 0) {
              classifiedState.chatHistoryContext = blocks.join('\n\n');
              log.info(
                `[ChatGraph] Injected recall: ${recalled.chats.length} chats, ${recalled.officeDocs.length} docs for "${recallQuery}" (${explicitRecall ? 'explicit' : 'proactive'})`
              );
            }
          }
        } catch (err) {
          log.warn(`[ChatGraph] Past-chat recall failed: ${err}`);
        }
      }

      // === HITL: Check if clarification is needed ===
      if (
        classifiedState.needsClarification &&
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

        sse.send('interrupt', {
          interruptType: 'clarification',
          question: classifiedState.clarificationQuestion!,
          ...(classifiedState.clarificationOptions != null && {
            options: classifiedState.clarificationOptions,
          }),
          ...(actualThreadId != null && { threadId: actualThreadId }),
        });

        await pipelineStateStore.store(actualThreadId!, {
          classifiedState,
          requestContext: {
            userId,
            agentId: agentId ?? 'gruenerator-universal',
            enabledTools: enabledTools ?? {},
            ...(modelId != null && { modelId }),
            ...(actualThreadId != null && { actualThreadId }),
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
          ...(actualThreadId != null && { threadId: actualThreadId }),
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
        sse.end();
        return { status: 200 as const, body: undefined };
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
      const isTabularCompute =
        computeOverridableIntents.has(classifiedState.intent) &&
        isTabularComputeQuestion(lastUserText);
      // Chart requests over an attached table compute their values FIRST —
      // without this the model invents the aggregation (beta: the category
      // split in the bar chart was fabricated). Intent stays 'chart'; the
      // resumed respond step builds the chart JSON from BERECHNUNGSERGEBNIS.
      const isTabularChart = classifiedState.intent === 'chart';
      if (
        (isTabularCompute || isTabularChart) &&
        classifiedState.hasTabularAttachment &&
        !forcedTools?.length &&
        args.body.clientTools?.includes('run_python') &&
        actualThreadId != null
      ) {
        const { pythonCode } = await pandasComputeNode(classifiedState);
        if (pythonCode) {
          log.info(`[ChatGraph] run_python interrupt (${pythonCode.length} chars pandas code)`);
          if (!isTabularChart) {
            // The resumed respond step should use the compute-mode guidance
            // even when the classifier had picked a different intent — and the
            // client already received the original intent event, so send a
            // corrective one before the tool card appears.
            classifiedState.intent = 'compute';
            sse.send('intent', {
              intent: 'compute',
              message: getIntentMessage('compute'),
              reasoning: 'Tabellen-Berechnung erkannt',
            });
          }
          // Stashed for the error-correction round: if the client reports a
          // failed execution, the resume handler regenerates with this code +
          // the error message in context.
          classifiedState.pandasLastCode = pythonCode;

          const stepId = `run_python_${Date.now()}`;
          sse.sendRaw('thinking_step', {
            stepId,
            toolName: 'run_python',
            title: 'Berechne mit pandas…',
            status: 'in_progress',
            args: { code: pythonCode },
          });

          sse.send('interrupt', {
            interruptType: 'client_tool',
            toolName: 'run_python',
            args: { code: pythonCode },
            threadId: actualThreadId,
          });

          await pipelineStateStore.store(actualThreadId, {
            classifiedState,
            requestContext: {
              userId,
              agentId: agentId ?? 'gruenerator-universal',
              enabledTools: enabledTools ?? {},
              ...(modelId != null && { modelId }),
              actualThreadId,
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
            threadId: actualThreadId,
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
          sse.end();
          return { status: 200 as const, body: undefined };
        }
        // Codegen failed — continue with the normal pipeline (prompt guidance
        // still steers the model toward an auto-run code block).
      }

      // === Handle @board-erstellen tool ===
      if (forcedTools?.includes('board-erstellen')) {
        const created = await handleBoardCreation({
          sse,
          classifiedState,
          lastUserMessage,
          aiWorkerPool,
          req,
          ...(actualThreadId != null && { actualThreadId }),
          userId,
        });
        if (created) return { status: 200 as const, body: undefined };
      }

      // === Handle @dokument-erstellen tool ===
      if (forcedTools?.includes('dokument-erstellen')) {
        const lastUserText = lastUserMessage ? extractTextContent(lastUserMessage.content) : '';
        const created = await generateAndCreateDocument({
          sse,
          classifiedState,
          aiWorkerPool,
          req,
          ...(actualThreadId != null && { actualThreadId }),
          userId,
          userContent: lastUserText as string,
          intent: 'direct',
        });
        if (created) return { status: 200 as const, body: undefined };
      }

      // === Handle @sheet-erstellen tool / create_sheet intent ===
      // Skipped on a compound turn (runAgentic): there the loop researches first
      // and calls the create_sheet fat tool itself.
      if (
        !runAgentic &&
        (forcedTools?.includes('sheet-erstellen') || classifiedState.intent === 'create_sheet')
      ) {
        const lastUserText = lastUserMessage ? extractTextContent(lastUserMessage.content) : '';
        const created = await handleSheetCreation({
          sse,
          classifiedState,
          aiWorkerPool,
          req,
          ...(actualThreadId != null && { actualThreadId }),
          userId,
          userContent: lastUserText as string,
        });
        if (created) return { status: 200 as const, body: undefined };
      }

      // === Handle @praesentation-erstellen tool / create_presentation intent ===
      // Skipped on a compound turn (runAgentic): the loop researches first and
      // calls the create_presentation fat tool itself.
      if (
        !runAgentic &&
        (forcedTools?.includes('praesentation-erstellen') ||
          classifiedState.intent === 'create_presentation')
      ) {
        const lastUserText = lastUserMessage ? extractTextContent(lastUserMessage.content) : '';
        const created = await handlePresentationCreation({
          sse,
          classifiedState,
          aiWorkerPool,
          req,
          ...(actualThreadId != null && { actualThreadId }),
          userId,
          userContent: lastUserText as string,
        });
        if (created) return { status: 200 as const, body: undefined };
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
        if (created) return { status: 200 as const, body: undefined };
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
        if (handled) return { status: 200 as const, body: undefined };
      }

      // === HITL: Sharepic without a topic → ask before generating ===
      // Unlike the generic clarification above this fires even for forced @sharepic,
      // because a bare "@sharepic" / "zitat sharepic" has the intent but no subject.
      if (classifiedState.intent === 'sharepic' && actualThreadId && !sharepicRefinement) {
        const sharepicText = lastUserMessage ? extractTextContent(lastUserMessage.content) : '';
        if (isSharepicTopicMissing(sharepicText as string)) {
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

          sse.send('interrupt', {
            interruptType: 'clarification',
            question,
            options,
            threadId: actualThreadId,
          });

          await pipelineStateStore.store(actualThreadId, {
            classifiedState,
            requestContext: {
              userId,
              agentId: agentId ?? 'gruenerator-universal',
              enabledTools: enabledTools ?? {},
              ...(modelId != null && { modelId }),
              actualThreadId,
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
            threadId: actualThreadId,
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
          sse.end();
          return { status: 200 as const, body: undefined };
        }
      }

      // === Stage 2 + 3: Response generation ===
      type PipelineResult = Awaited<ReturnType<typeof executeIntentPipeline>>;
      let finalState: PipelineResult['finalState'];
      let generatedImage: PipelineResult['generatedImage'];
      let sharepicVariants: PipelineResult['sharepicVariants'];
      let socialPost: PipelineResult['socialPost'];
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

      if (runAgentic) {
        // Agentic path: the model holds the search tools and loops until it can
        // answer, writing the reply in the same streamed turn. Stage 2's
        // pre-decided single search is skipped entirely.
        const systemMessage = await buildSystemMessage(classifiedState);
        const prunedValidMessages = pruneMessages(
          validMessages as Parameters<typeof pruneMessages>[0]
        );
        const finalSystemMessage = actualThreadId
          ? await applyCompaction(
              actualThreadId,
              prunedValidMessages,
              systemMessage,
              contextWindowTokens
            )
          : systemMessage;

        const outcome = await streamAgenticResponse({
          finalState: classifiedState,
          systemMessage: finalSystemMessage,
          messages: prunedValidMessages as ModelMessage[],
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
        ({ finalState, generatedImage, sharepicVariants, socialPost } = await executeIntentPipeline(
          {
            classifiedState,
            sse,
            forcedTool,
            ...(enabledTools != null && { enabledTools }),
            imageAttachments,
            req,
            threadId: actualThreadId ?? null,
            ...(sharepicRefinement && { sharepicRefinement }),
          }
        ));

        // === Stage 3: Response generation ===
        if (finalState.intent === 'social_post') {
          // Combined post (EXPERIMENTAL): both halves were already produced +
          // streamed in Stage 2 (social_post_complete / sharepic_complete).
          // Fixed confirmation like the sharepic branch — no extra LLM call.
          const hasText = socialPost != null;
          const n = sharepicVariants.length;
          fullText =
            hasText && n > 0
              ? `Hier ist dein Post mit ${n} passenden Sharepic-${n === 1 ? 'Variante' : 'Varianten'}. ` +
                `Sag mir, was ich am Text oder an der Grafik anpassen soll.`
              : hasText
                ? `Hier ist dein Post. Die Sharepic-Erstellung hat leider nicht geklappt — ` +
                  `sag mir, was ich am Text anpassen soll, oder versuch es für die Grafik noch einmal.`
                : n > 0
                  ? `Ich habe dir ${n} Sharepic-${n === 1 ? 'Variante' : 'Varianten'} erstellt. ` +
                    `Der Post-Text hat leider nicht geklappt — magst du es noch einmal versuchen?`
                  : `Das hat leider nicht geklappt. Magst du es mit einem anderen Thema noch einmal versuchen?`;
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
              ? deckSlides
                ? `Ich habe dir ein Slider-Karussell mit ${deckSlides} Folien erstellt. ` +
                  `Sag mir, was ich an einzelnen Folien anpassen soll, oder öffne es im Studio.`
                : `Ich habe dir ${n} Sharepic-${n === 1 ? 'Variante' : 'Varianten'} erstellt. ` +
                  `Wähle eine aus oder sag mir, was ich am Text oder Bild anpassen soll.`
              : `Die Sharepic-Erstellung hat leider nicht geklappt. Magst du es mit einem ` +
                `anderen Thema noch einmal versuchen?`;
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
            }
          );
          if (resolution.unknownModelId) {
            sse.send('warning', {
              code: 'unknown_model_id',
              message: `Modell "${resolution.unknownModelId}" ist nicht verfügbar — Standardmodell wird verwendet.`,
            });
          }

          const prunedValidMessages = pruneMessages(
            validMessages as Parameters<typeof pruneMessages>[0]
          );
          const finalSystemMessage = actualThreadId
            ? await applyCompaction(
                actualThreadId,
                prunedValidMessages,
                systemMessage,
                contextWindowTokens
              )
            : systemMessage;

          let messagesForAI = buildMessagesForAI(
            finalSystemMessage,
            prunedValidMessages as Parameters<typeof buildMessagesForAI>[1]
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

          const baseMaxTokens = finalState.agentConfig.params.max_tokens;

          try {
            fullText = await streamWithFallback({
              primary: resolution,
              sse,
              logPrefix: '[ChatGraph]',
              buildStream: async (r) => {
                const isReasoning = isReasoningStreamModel(r.provider, r.modelName);
                return streamForResolution({
                  resolution: r,
                  messages: messagesForAI as Parameters<typeof streamForResolution>[0]['messages'],
                  maxTokens: isReasoning
                    ? Math.max(baseMaxTokens, 16000)
                    : Math.max(baseMaxTokens, 8000),
                  temperature: finalState.agentConfig.params.temperature,
                  sse,
                  logPrefix: '[ChatGraph]',
                });
              },
            });
          } finally {
            if (resolution.releaseSlot) await resolution.releaseSlot();
          }

          if (fullText === null) return { status: 200 as const, body: undefined };
        }
      }

      // Narrow fullText for the extraction/persist stages: the agentic path
      // always yields text; the pipeline path already returned above on null.
      if (fullText === null) return { status: 200 as const, body: undefined };

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
        const conversationContext = [
          ...validMessages.slice(-4).map((m) => `${m.role}: ${extractTextContent(m.content)}`),
          `assistant: ${fullText.slice(0, 3000)}`,
        ].join('\n');

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
        },
      });

      log.info(`[ChatGraph] Complete: ${fullText.length} chars in ${totalTimeMs}ms`);
      sse.end();
      await persistPromise;
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
