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
import { sanitizeMentionTokens } from '@gruenerator/shared/utils';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { pandasComputeNode, buildSystemMessage } from '../../agents/langgraph/ChatGraph/index.js';
import { knownArtifactRefs } from '../../agents/langgraph/ChatGraph/nodes/artifactInventory.js';
import {
  isSheetFillRequest,
  isTabularComputeQuestion,
  NOUN_TRIGGER_MAX_LENGTH,
} from '../../agents/langgraph/ChatGraph/nodes/classifierHeuristics.js';
import { detectManagedSources } from '../../agents/langgraph/ChatGraph/nodes/managedSourceTrigger.js';
import { SYSTEM_TOOL_INTENTS } from '../../services/mcp/systemMcpServers.js';
import {
  BOTH_LANES_FAILED,
  buildAiTelemetry,
  withLangfuseTrace,
} from '../../services/telemetry/langfuseTelemetry.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { recordDecision } from '../../utils/decisionJournal.js';
import { createLogger } from '../../utils/logger.js';
import { withTimeout } from '../../utils/withTimeout.js';

import { deriveImplicitRecipeMention } from './agents/implicitRecipe.js';
import { getPipelineAgent } from './agents/pipelines/index.js';
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
import { resolveOriginalText, runAgentPipeline } from './services/agentPipeline.js';
import {
  ARTIFACT_CONFIRMATION_TEXTS,
  buildPostWithSharepicsConfirmation,
  buildSharepicConfirmation,
  buildSharepicsWithoutPostConfirmation,
} from './services/artifactConfirmations.js';
import { extractArtifactFromResponse } from './services/artifactExtraction.js';
import { injectImageAttachments } from './services/attachmentProcessingService.js';
import { extractChartFromResponse, emitConfirmAction } from './services/confirmActionService.js';
import { pruneMessages, applyCompaction } from './services/contextPruningService.js';
import { buildCreateTurnContext } from './services/createTurn.js';
import {
  handleBoardCreation,
  handleSheetCreation,
  handleSheetEdit,
  handlePresentationCreation,
  handlePdfCreation,
  handleRecurringTaskCreation,
  generateAndCreateDocument,
  handleShareDoc,
  executeIntentPipeline,
} from './services/intentExecutionService.js';
import { estimateRequestTokens, extractTextContent } from './services/messageHelpers.js';
import {
  stripFabricatedArtifactDelivery,
  stripFabricatedSystemClaims,
} from './services/outputSanity.js';
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
import { persistAssistantResponse } from './services/postResponseService.js';
import { handleRecallToolLoop, isChatRecallLoopEnabled } from './services/recallToolLoopService.js';
import { resolveReferentialTopic } from './services/referentialTopic.js';
import {
  resolveModel,
  buildMessagesForAI,
  streamForResolution,
  streamWithFallback,
} from './services/responseStreamingService.js';
import { runChatGraphResume } from './services/resumePipeline.js';
import { isSharepicTopicMissing } from './services/sharepicVariantHelpers.js';
import {
  createSSEStream,
  getIntentMessage,
  PROGRESS_MESSAGES,
  sseInternalError,
  sendChatWarning,
} from './services/sseHelpers.js';
import { buildStreamContext } from './services/streamContext.js';
import {
  discardPendingAssistantIfEmpty,
  persistSourcesOnFailure,
} from './services/threadPersistenceService.js';
import { turnMaterialChars } from './services/turnMaterial.js';
import { runActionGateStage } from './streamStages/actionGateStage.js';
import { runClassifyStage } from './streamStages/classifyStage.js';
import { runEarlyHandlerStage } from './streamStages/earlyHandlerStage.js';
import { runForcedIntentStage } from './streamStages/forcedIntentStage.js';
import { suspendTurn, type FixedTextBase, type SuspendTurnBase } from './streamStages/turnEnd.js';

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
        aiClient,
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
      const classifiedState = await runClassifyStage({
        initialState,
        validMessages,
        lastUserTextNoMentions,
        sse,
      });

      let forcedTool: boolean = false;

      // The turn-wide half of the two early-exit paths. `forcedTool` is NOT in
      // here: it is still being decided while these are already in scope, so
      // every suspend passes the current value at the call site.
      const suspendBase: SuspendTurnBase = {
        sse,
        classifiedState,
        cleanupPending,
        userId,
        agentId,
        enabledTools,
        modelId,
        isNewThread,
        processedMeta,
        userMessageId,
        imageAttachments,
        memoryContext,
        memoryRetrieveTimeMs,
        validMessages,
        rawDocumentIds,
        startTime: initialState.startTime,
      };
      const fixedTextBase: FixedTextBase = {
        sse,
        cleanupPending,
        actualThreadId,
        classifiedState,
        startTime: initialState.startTime,
      };

      log.info(
        `[ChatGraph] forcedTools received: ${JSON.stringify(forcedTools)}, classifier intent: ${classifiedState.intent}`
      );

      const {
        isCompound,
        forcedTool: mentionForcedTool,
        universalEditForced,
      } = await runForcedIntentStage({
        sse,
        classifiedState,
        initialState,
        notebookIds,
        agentId,
        forcedTools,
        lastUserTextNoMentions,
        lastUserMessage,
        imageAttachments,
        actualThreadId,
      });
      forcedTool = mentionForcedTool;

      // === Early handler branches (reel / app gate / social post / sharepic edit) ===
      const early = await runEarlyHandlerStage({
        sse,
        req,
        classifiedState,
        initialState,
        cleanupPending,
        fixedTextBase,
        actualThreadId,
        userId,
        aiClient,
        lastUserMessage,
        lastUserTextNoMentions,
        imageAttachments,
        universalEditForced,
        rawCurrentReel,
        rawReelUpload,
        rawCurrentSharepic,
        rawCurrentSocialPost,
      });
      if (early.handled) return early.result;
      const { sharepicRefinement } = early;
      if (early.forcedTool) forcedTool = true;

      // === Gates: may this turn make a sharepic / persist an artifact? ===
      const gate = await runActionGateStage({
        classifiedState,
        initialState,
        fixedTextBase,
        forcedTool,
        lastUserTextNoMentions,
        actualThreadId,
      });
      if (gate.handled) return gate.result;
      const { sharepicLicensed } = gate;

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
      // `umfragen` (PolitPro) and `hilfe` (in-process docs index) are native
      // domain tools — always available, so they force the gate unconditionally.
      // `hilfe` MUST be here: @doku sets forcedTool, and without this escape
      // decideRunAgentic would keep the turn single-pass, where
      // `gruenerator_docs_search` does not exist — the mention would silently
      // do nothing.
      //
      // The five system-MCP intents used to force the gate here too, via an
      // availability check that also carried the locale. Both jobs moved into
      // `managedSourceKeys` below: the trigger names the connectors, and
      // `loadManagedMcpCatalog` applies the country filter and the per-user
      // opt-out at the mount itself — one place instead of two that had to agree.
      const isMcpTurn =
        classifiedState.intent === 'mcp' ||
        classifiedState.intent === 'umfragen' ||
        classifiedState.intent === 'hilfe';
      const isSystemToolIntent =
        classifiedState.intent != null && SYSTEM_TOOL_INTENTS.has(classifiedState.intent);
      // First-party connectors this turn should mount. Vocabulary decides
      // (`managedSourceTrigger`), not a verdict — and an explicit `@gesetze`-style
      // mention already resolved to an `mcp:system-<key>` scope above, which the
      // connector path handles on its own.
      const managedSourceKeys = detectManagedSources(lastUserTextNoMentions);
      if (managedSourceKeys.length > 0) {
        classifiedState.managedSourceKeys = managedSourceKeys;
        log.info(`[ChatGraph] Managed sources: ${managedSourceKeys.join(', ')}`);
      }
      // A chosen notebook keeps the turn single-pass, on EVERY agent — only
      // `searchNode` retrieves notebook content, and no loop tool can address a
      // notebook. `isCompound` above covers just the named-agent half of this
      // and additionally drives topic extraction and a progress event, so the
      // routing fact gets its own name. See AgenticDecisionInput.
      const hasSelectedNotebook = notebookIds.length > 0;
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
        !hasSelectedNotebook &&
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
        hasSelectedNotebook,
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
        recordDecision('router.intent_override', 'modify_board_to_agentic', {
          inputs: {
            intentBefore: 'modify_board',
            hasRawBoardIds: !!rawBoardIds && rawBoardIds.length > 0,
            hasOpenBoard: !!rawCurrentBoard,
          },
        });
        classifiedState.intent = 'agentic';
      }

      // The whole routing decision lives in the pure, unit-tested decideRunAgentic
      // (agenticLoop/routing.ts) — including the `direct`-question rescue.
      // compoundEdit forces the loop even for an edit_current_* intent (which
      // isn't otherwise a loop intent) — its guards above mirror decideRunAgentic's.
      // Ein Pipeline-Agent (routes/chat/agents/pipelines/) geht NIE über die
      // Schleife. Übertragen ist reine Textarbeit am mitgelieferten Material,
      // und die Prüfung dahinter ist eine eigene Kette statt eines Werkzeugs.
      // Der erste Einfache-Sprache-Lauf (13.08.2026) belegte beide Hälften: 19
      // Werkzeuge gemountet, KEINES benutzt (`steps=0`) — bezahlt wurden
      // trotzdem 2661 Zeichen Werkzeugregeln und 1141 Zeichen Rezept-Katalog im
      // Systemprompt, aus dem das Modell dann die Nachbarrolle
      // „Rückübersetzung" in seine Ausgabe zog.
      //
      // `produktion` und nicht `direct`: der Turn IST eine Schreibaufgabe mit
      // eigenem Material, und `direct` ist seit #2269 F0 — es wird nur noch
      // gelesen, nicht mehr neu vergeben (siehe agenticLoop/routing.ts).
      // Beides nötig, weil `produktion` zwar in NO_TOOL_VERDICTS steht, die
      // Rettungsregel in decideRunAgentic es aber dennoch in den Loop heben
      // kann.
      const pipelineAgent = getPipelineAgent(classifiedState.agentConfig?.identifier);
      if (pipelineAgent && classifiedState.intent !== pipelineAgent.forceIntent) {
        recordDecision('router.intent_override', 'einfache_sprache_to_produktion', {
          inputs: { intentBefore: classifiedState.intent },
        });
        classifiedState.intent = pipelineAgent.forceIntent;
      }

      // Der Ausgangstext wird EINMAL bestimmt und von beiden Enden der Kette
      // benutzt: der Antwortschritt bekommt ihn über den State in den
      // Systemprompt genagelt, die Nachschritte messen gegen dieselbe Variable.
      // Vorher entschied Schritt 1 selbst, was er aus dem Thread-Kontext für
      // gemeint hielt — und dort liegt der Volltext jedes früheren Anhangs.
      const pipelineOriginal = pipelineAgent
        ? resolveOriginalText(classifiedState, lastUserText, promptIsPastedText)
        : '';
      if (pipelineAgent) {
        classifiedState.pipelineSourceText = pipelineOriginal || null;
        log.info(
          `[${requestId}] [${pipelineAgent.identifier}] Ausgangstext festgelegt: ` +
            `${pipelineOriginal.length} Zeichen`
        );
      }

      const runAgentic =
        !pipelineAgent &&
        (editToolLoop ||
          compoundEdit ||
          decideRunAgentic({
            loopEnabled: isAgenticLoopEnabled(),
            agenticIntents: AGENTIC_INTENTS,
            intent: classifiedState.intent,
            lastUserText,
            forcedTool: !!forcedTool,
            isMcpTurn,
            hasManagedSources: managedSourceKeys.length > 0,
            isCompound,
            hasSelectedNotebook,
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
            // Same question the classifier's Tier 3.5 asks, asked again here
            // because a turn can reach this gate without having passed that tier
            // (confident heuristic, LLM verdict, post-pass correction).
            hasOwnMaterial:
              lastUserText.length > NOUN_TRIGGER_MAX_LENGTH ||
              !!classifiedState.attachmentContext ||
              !!classifiedState.currentDocument ||
              (classifiedState.docMentionIds ?? []).length > 0,
          }));

      // A demoted turn that a kill-switch (compound, forced tool, ...) kept out
      // of the loop must not strand in executeIntentPipeline, which has no
      // 'agentic' branch — degrade to plain search.
      //
      // KEINE automatisierte Abdeckung mehr, und das ist eine Aussage über die
      // Erreichbarkeit, nicht über den Aufwand: `agentic` entstand entweder bei
      // Tier 3.5 (das mit ausgeschaltetem Loop gar nicht erst demotiert) oder als
      // Auffangwert der LLM-Stufe (gelöscht). Innerhalb eines Requests können
      // Klassifikator und Router den Schalter also nicht mehr verschieden sehen.
      // Was bleibt, ist der WIEDERAUFNAHME-Pfad: ein gespeicherter `agentic`-
      // Intent, der nach einem Deploy mit umgelegtem Schalter fortgesetzt wird.
      // Die zugehörige Simulation ist in diesem PR gelöscht worden — sie endete
      // nachweislich im Fehler-Fallback und belegte den Zweig nie.
      if (!runAgentic && classifiedState.intent === 'agentic') {
        recordDecision('router.intent_override', 'agentic_to_search', {
          inputs: { intentBefore: 'agentic', runAgentic },
        });
        classifiedState.intent = 'search';
      }
      // Same insurance for system tool intents: their tools exist only in the
      // loop, so an edge turn a kill-switch kept out degrades to web search.
      // Backfill the query — these intents are NON_SEARCH, so the classifier
      // nulled searchQuery and the web branch would otherwise search ''.
      if (!runAgentic && isSystemToolIntent) {
        recordDecision('router.intent_override', 'system_tool_to_web', {
          inputs: { intentBefore: classifiedState.intent, runAgentic, isSystemToolIntent },
        });
        classifiedState.intent = 'web';
        if (!classifiedState.searchQuery && lastUserText) {
          classifiedState.searchQuery = lastUserText;
        }
      }

      // Implicit recipe on the single-pass path: `rezept_laden` only exists in
      // the loop, but the most common writing turn ("Schreib mir eine
      // Pressemitteilung zu X") is single-pass — the recipe used to load there
      // only via an explicit @mention. An unambiguous match sets
      // `activeSkillMention`, so downstream everything behaves exactly as if
      // the user had picked the recipe: respondNode injects the fragment,
      // learned text forms keep their precedence, and on a later loop turn the
      // mount gate reads it as a deliberate choice. Same opt-out and
      // custom-prompt guards as the loop's catalogue; loop turns are untouched
      // (the model picks via the tool there).
      //
      // Einfache Sprache steht ganz aussen vor: der Turn ist per Override immer
      // `produktion`, bringt immer eigenes Material mit und hat seine Ausgabeform
      // bereits (Übertragung + Prüfkette). Ein Rezept wäre dort keine Ergänzung,
      // sondern ein zweiter Formatgeber — im Lauf vom 13.08.2026 gewann er, und
      // der Agent bot statt einer Übertragung einen Facebook-Post an.
      if (
        !runAgentic &&
        !pipelineAgent &&
        (classifiedState.intent === 'direct' || classifiedState.intent === 'produktion') &&
        !classifiedState.activeSkillMention &&
        !classifiedState.customSystemPrompt &&
        enabledTools?.['rezept_laden'] !== false
      ) {
        const implicitRecipe = deriveImplicitRecipeMention(
          lastUserTextNoMentions,
          classifiedState.userLocale ?? null
        );
        if (implicitRecipe) {
          recordDecision('router.implicit_recipe', implicitRecipe, {
            inputs: { intent: classifiedState.intent },
          });
          log.info(`[${requestId}] implicit recipe on single-pass: @${implicitRecipe}`);
          classifiedState.activeSkillMention = implicitRecipe;
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

        return suspendTurn({
          ...suspendBase,
          forcedTool,
          threadId: actualThreadId,
          interrupt: {
            interruptType: 'clarification',
            question: classifiedState.clarificationQuestion!,
            ...(classifiedState.clarificationOptions != null && {
              options: classifiedState.clarificationOptions,
            }),
            threadId: actualThreadId,
          },
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
      // like "durchschnittlicher umsatz pro region?" as search/produktion — which
      // silently degraded them to the legacy prompt-guidance path. Guards:
      // only hijackable intents (explicit tool intents like chart/image/
      // sharepic/web keep their flow), no @-forced tools, and the matcher
      // itself excludes text-metric ("wie viele zeichen") and visualization
      // questions.
      const computeOverridableIntents = new Set([
        'compute',
        'produktion',
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

          return suspendTurn({
            ...suspendBase,
            forcedTool,
            threadId: actualThreadId,
            interrupt: {
              interruptType: 'client_tool',
              toolName: 'run_python',
              args: { code: pythonCode },
              threadId: actualThreadId,
            },
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
        aiClient,
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
              intent: 'produktion',
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

      // === edit_sheet intent (Tier 2.7 follow-up on a chat-created sheet) ===
      // handleSheetEdit always owns the turn once dispatched (mirrors
      // runCreateTurn's contract) — no fall-through to the normal pipeline.
      if (!runAgentic && classifiedState.intent === 'edit_sheet') {
        const lastUserText = lastUserMessage ? extractTextContent(lastUserMessage.content) : '';
        await handleSheetEdit({
          sse,
          classifiedState,
          ...(actualThreadId != null && { actualThreadId }),
          userId,
          userContent: lastUserText as string,
        });
        await cleanupPending(true);
        return { status: 200 as const, body: undefined };
      }

      // === EXPERIMENTAL: create_recurring_task intent ===
      // Falls through to the normal pipeline if extraction fails.
      if (!runAgentic && classifiedState.intent === 'create_recurring_task') {
        const lastUserText = lastUserMessage ? extractTextContent(lastUserMessage.content) : '';
        const created = await handleRecurringTaskCreation({
          sse,
          classifiedState,
          aiClient,
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

          return suspendTurn({
            ...suspendBase,
            forcedTool,
            threadId: actualThreadId,
            interrupt: {
              interruptType: 'clarification',
              question,
              options,
              threadId: actualThreadId,
            },
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

      /**
       * Both answer-writing paths open the same `chat-turn` trace — the agentic
       * loop and the single-pass respond call. `intent` is the only field that
       * differs: the loop answers under the classifier's intent, the pipeline
       * may have rewritten it by the time it reaches the respond model.
       */
      const buildTurnTrace = (intent: string) => ({
        name: 'chat-turn',
        ...(userId && { userId }),
        ...(actualThreadId && { sessionId: actualThreadId }),
        metadata: {
          requestId,
          intent,
          ...(agentId && { agentId }),
          ...(modelId && { modelId }),
        },
      });

      if (runAgentic) {
        // Agentic path: the model holds the search tools and loops until it can
        // answer, writing the reply in the same streamed turn. Stage 2's
        // pre-decided single search is skipped entirely.
        // `retrievalExpected`: this prompt is written before the loop calls a
        // single tool, so the citation count it would otherwise read is 0 on
        // every agentic turn — not because the answer will be thin, but because
        // the search has not happened yet.
        const systemMessage = await buildSystemMessage(classifiedState, {
          retrievalExpected: true,
        });
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

        // The loop's gather/synth generations nest under this root span — they
        // pass buildAiTelemetry() from inside loopEngine. Until this existed the
        // most expensive turns in the product were the only untraced ones, and
        // the client got no traceId, so their thumbs buttons never rendered.
        const outcome = await withLangfuseTrace(
          buildTurnTrace(classifiedState.intent ?? 'agentic'),
          async (trace) => {
            langfuseTraceId = trace.traceId;
            const result = await streamAgenticResponse({
              finalState: classifiedState,
              systemMessage: finalSystemMessage,
              messages: contextMessages as ModelMessage[],
              ...(modelId != null && { modelId }),
              requestId,
              sse,
              req,
              threadId: actualThreadId ?? null,
              // Dieselben Zeilen, die buildStreamContext schon gelesen hat.
              // Null heisst nur „nicht vorgelesen" — der Loop liest dann selbst.
              toolHistory: threadToolHistory,
            });
            trace.update({ input: lastUserText, output: result.fullText });
            return result;
          }
        );

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
        } else if (finalState.deepResearchAnswer) {
          // @deepresearch: the dossier is ALREADY WRITTEN (see deepResearchTurn.ts)
          // and is served verbatim as the assistant message. No tool card, no
          // artefact — the text lands in the transcript like any other answer, so
          // a follow-up ("kürz mir den zweiten Abschnitt") can actually refer to
          // it. That was impossible with the old research card, where the dossier
          // lived only in a tool result the model never saw.
          //
          // Skipping the synthesis pass is the point, not an optimisation: a model
          // run over a finished text paraphrases what we just paid for, costs a
          // second LLM pass, and renumbers citations it has no way to verify.
          //
          // One delta rather than chunks: the whole text is already in hand, so
          // splitting it would only fake a stream — and the smooth-streaming hook
          // has a history of breaking on prefix boundaries.
          fullText = finalState.deepResearchAnswer;
          sse.send('response_start', { message: PROGRESS_MESSAGES.responseStart });
          //
          // No `completion` follow-up: that event exists to REPLACE streamed text
          // after a correction, and there is nothing to correct here — the
          // out-of-range clamp already ran before the text left deepResearchTurn.
          // `done` carries the citations, as on every other path.
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
              ...(finalState.taskShape != null && { taskShape: finalState.taskShape }),
              materialChars: turnMaterialChars(finalState),
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

          // Context (requestId/intent/agentId/modelId) rides on the trace below —
          // AI SDK 7 telemetry has no metadata field.
          const respondTelemetry = buildAiTelemetry('chat-graph.respond');

          try {
            // One Langfuse trace per chat turn: the respond generation (and any
            // sibling-fallback retry) nest under this `chat-turn` root span, and
            // `traceId` is captured for the client feedback score.
            fullText = await withLangfuseTrace(
              buildTurnTrace(finalState.intent ?? 'unknown'),
              async (trace) => {
                langfuseTraceId = trace.traceId;
                const text = await streamWithFallback({
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
                // streamWithFallback swallows a dead primary AND a dead sibling
                // into `null` instead of throwing, so without this the failed
                // turn would sit in Langfuse as a successful one.
                trace.update(
                  text === null
                    ? { input: lastUserText, level: 'ERROR', statusMessage: BOTH_LANES_FAILED }
                    : { input: lastUserText, output: text }
                );
                return text;
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
            // The user's own message grounds a filename too — see the parameter
            // doc. Without it, "fass Internetkonzept.pdf zusammen" had its
            // answer deleted and replaced with a denial of file access.
            finalState.lastUserTextNoMentions ?? '',
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
          // A file the model typed out, or an artefact path it made up. This is
          // the path that produced the base64 „.pptx" and the 404'ing
          // /office/<uuid> on 02.08.2026 — single-pass, no artefact tool.
          const delivery = stripFabricatedArtifactDelivery(fullText, knownArtifactRefs(finalState));
          if (delivery.removed.length > 0) {
            log.warn(
              `[ChatGraph] Removed fabricated artefact delivery: ${delivery.removed.join(', ')}`
            );
            fullText = delivery.text;
          }
          const citeClamp = stripOutOfRangeCitations(fullText, finalState.citations.length);
          if (citeClamp.changed || sanity.fabricated.length > 0 || delivery.removed.length > 0) {
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

      // === Pipeline-Agenten: die Nachschritte, jeder mit eigenem Kontext ===
      // Laufen NACH der gestromten Antwort und hängen an denselben Text an,
      // damit Persistenz und Neuladen sehen, was auf dem Bildschirm steht.
      // `pipelineOriginal` ist dieselbe Zeichenkette, die Schritt 1 oben im
      // Systemprompt festgenagelt bekam — die Prüfung misst nichts anderes, als
      // was übertragen werden sollte.
      if (pipelineAgent) {
        fullText += await runAgentPipeline({
          pipeline: pipelineAgent,
          state: finalState,
          sse,
          produced: fullText,
          original: pipelineOriginal,
        });
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
        aiClient,
        requestId,
        memoryEnabled,
        ...(agentId != null && { agentId }),
        ...(agenticSteps != null && { agenticSteps }),
        ...(langfuseTraceId != null && { traceId: langfuseTraceId }),
        ...(pendingId != null && { pendingMessageId: pendingId }),
        ...(userMessageId != null && { userMessageId }),
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
          aiClient,
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
      if (persistOutcome.discarded) sendChatWarning(sse, 'turn_discarded');
      else if (!persistOutcome.ok) sendChatWarning(sse, 'persist_failed');
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
