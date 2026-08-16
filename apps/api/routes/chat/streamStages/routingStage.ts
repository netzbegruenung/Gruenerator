/**
 * How this turn will be answered: agentic loop or deterministic single pass —
 * plus the editor-surface variants that force one or the other.
 *
 * The decision is made here, before anything streams, because the `intent`
 * event (emitted at the end of this stage) tells the client whether to expect
 * real tool cards. It must then stay stable through to the response stage.
 *
 * `isAgenticLoopEnabled()` is read at three separate points and the intent is
 * rewritten in two places (`agentic`→`search`, system tool→`web`). That
 * redundancy is deliberate for now — consolidating it is its own change.
 */

import {
  isSheetFillRequest,
  NOUN_TRIGGER_MAX_LENGTH,
} from '../../../agents/langgraph/ChatGraph/nodes/classifierHeuristics.js';
import { detectManagedSources } from '../../../agents/langgraph/ChatGraph/nodes/managedSourceTrigger.js';
import { SYSTEM_TOOL_INTENTS } from '../../../services/mcp/systemMcpServers.js';
import { recordDecision } from '../../../utils/decisionJournal.js';
import { createLogger } from '../../../utils/logger.js';
import { deriveImplicitRecipeMention } from '../agents/implicitRecipe.js';
import { getPipelineAgent } from '../agents/pipelines/index.js';
import { isAgenticLoopEnabled } from '../services/agenticLoop/agenticRespondService.js';
import { AGENTIC_INTENTS } from '../services/agenticLoop/intents.js';
import {
  compoundGenerationKind,
  decideEditToolLoop,
  decideRunAgentic,
  isEditorSurface,
  looksLikeCompoundEdit,
  resolveEditorSurfaceKind,
} from '../services/agenticLoop/routing.js';
import { resolveOriginalText } from '../services/agentPipeline.js';
import { getIntentMessage, type SSEWriter } from '../services/sseHelpers.js';

import { type SharepicRefinement } from './earlyHandlerStage.js';
import { type StreamBody } from './types.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';
import type { StreamContext } from '../services/streamContext.js';

const log = createLogger('chatGraphContractRouter');

export interface RoutingStageParams {
  sse: SSEWriter;
  classifiedState: ChatGraphState;
  requestId: string;
  enabledTools: StreamBody['enabledTools'];
  notebookIds: string[];
  imageAttachments: StreamContext['imageAttachments'];
  lastUserText: string;
  lastUserTextNoMentions: string;
  promptIsPastedText: boolean;
  forcedTool: boolean;
  isCompound: boolean;
  sharepicRefinement: SharepicRefinement | undefined;
  rawCurrentDocument: StreamBody['currentDocument'];
  rawCurrentBoard: StreamBody['currentBoard'];
  rawBoardIds: StreamBody['boardIds'];
  mentionBoardIds: string[];
}

export interface RoutingStageResult {
  /** The turn runs the agentic tool loop instead of the single-pass pipeline. */
  runAgentic: boolean;
  /** Research-then-edit-the-open-artifact: the loop runs, then the gathered
   *  sources become the doc/board edit's reference material. */
  compoundEdit: boolean;
  /** Which open artifact an editor surface edits, tied to the ENABLED tool. */
  editTarget: 'doc' | 'board' | null;
  /** The surface edits in-loop via `edit_document` instead of the legacy
   *  trigger_doc_edit round-trip. */
  editToolLoop: boolean;
  pipelineAgent: ReturnType<typeof getPipelineAgent>;
  /** The one source text a pipeline agent works from — pinned into the system
   *  prompt AND measured against by the post-steps. */
  pipelineOriginal: string;
}

export function runRoutingStage({
  sse,
  classifiedState,
  requestId,
  enabledTools,
  notebookIds,
  imageAttachments,
  lastUserText,
  lastUserTextNoMentions,
  promptIsPastedText,
  forcedTool,
  isCompound,
  sharepicRefinement,
  rawCurrentDocument,
  rawCurrentBoard,
  rawBoardIds,
  mentionBoardIds,
}: RoutingStageParams): RoutingStageResult {
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
      enabledTools?.['edit_current_doc'] === true || enabledTools?.['edit_current_board'] === true,
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
    mentionBoardIds.length === 0 &&
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
  return { runAgentic, compoundEdit, editTarget, editToolLoop, pipelineAgent, pipelineOriginal };
}
