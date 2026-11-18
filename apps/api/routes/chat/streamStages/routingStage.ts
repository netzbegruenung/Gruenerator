/**
 * How this turn will be answered: agentic loop or deterministic single pass —
 * plus the editor-surface variants that force one or the other.
 *
 * The decision is made here, before anything streams, because the `intent`
 * event (emitted at the end of this stage) tells the client whether to expect
 * real tool cards. It must then stay stable through to the response stage.
 *
 * Diese Datei ENTSCHEIDET nichts mehr. Sie sammelt die Fakten ein, die nur sie
 * beschaffen kann (verwaltete Konnektoren, Pipeline-Agent, PDF-Formularlage),
 * ruft `decideTurnPlan` genau EINMAL und schreibt das Ergebnis in den State.
 * Vorher las sie den Loop-Schalter an drei Stellen und schrieb den Intent an
 * zwei weiteren hinterher um; `plan.intent` ist endgültig.
 */

import {
  isSheetFillRequest,
  NOUN_TRIGGER_MAX_LENGTH,
  extractMessageText,
} from '../../../agents/langgraph/ChatGraph/nodes/classifierHeuristics.js';
import { addressesThreadImage } from '../../../agents/langgraph/ChatGraph/nodes/fastPathGuards.js';
import { SYSTEM_TOOL_INTENTS } from '../../../services/mcp/connectorAdapters.js';
import { createLogger } from '../../../utils/logger.js';
import { getPipelineAgent } from '../agents/pipelines/index.js';
import { isTabelleAuswertenMountable } from '../agents/tabelleAuswertenTool.js';
import { isAgenticLoopEnabled } from '../services/agenticLoop/flags.js';
import { AGENTIC_INTENTS } from '../services/agenticLoop/intents.js';
import { threadWorksOnSharepic } from '../services/agenticLoop/routing.js';
import { decideTurnPlan, type TurnPlan } from '../services/agenticLoop/turnPlan.js';
import { editToolNameFor } from '../services/agenticLoop/types.js';
import { resolveOriginalText } from '../services/agentPipeline.js';
import { orderText } from '../services/orderText.js';
import { isPdfEditAsk } from '../services/pdfEditContext.js';
import { hasReachableForm } from '../services/pdfFormAvailability.js';
import { isReisekostenTurn } from '../services/reisekostenAvailability.js';
import { looksLikeSharepicOrder } from '../services/sharepicEditHeuristics.js';
import { stateHasSharepic } from '../services/sharepicGap.js';
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
  rawCurrentCanvas: StreamBody['currentCanvas'];
  rawBoardIds: StreamBody['boardIds'];
  mentionBoardIds: string[];
}

export interface RoutingStageResult {
  /** Die eine Turn-Entscheidung. Niemand hinter dieser Stage entscheidet neu. */
  plan: TurnPlan;
  pipelineAgent: ReturnType<typeof getPipelineAgent>;
  /** The one source text a pipeline agent works from — pinned into the system
   *  prompt AND measured against by the post-steps. */
  pipelineOriginal: string;
}

/** Was die Person VOR dieser Nachricht schrieb, älteste zuerst. */
function earlierUserTexts(messages: ChatGraphState['messages']): string[] {
  const texts = messages.filter((m) => m.role === 'user').map((m) => extractMessageText(m.content));
  return texts.slice(0, -1);
}

/** Ab hier ist eine getippte Nachricht an einen Pipeline-Agenten selbst der Ausgangstext. */
const MIN_TYPED_TRANSFER_CHARS = 400;
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
  rawCurrentCanvas,
  rawBoardIds,
  mentionBoardIds,
}: RoutingStageParams): RoutingStageResult {
  // Der Vorschlag des Klassifikators, festgehalten bevor der Plan ihn ersetzt —
  // die Protokollzeile unten nennt ihn, und sie meint den VORSCHLAG.
  const proposedIntent = classifiedState.intent;

  const pipelineAgent = getPipelineAgent(classifiedState.agentConfig?.identifier);

  const sharepicInProgress = threadWorksOnSharepic(
    earlierUserTexts(classifiedState.messages),
    stateHasSharepic(classifiedState),
    lastUserTextNoMentions
  );
  if (sharepicInProgress) classifiedState.sharepicInProgress = true;
  if (
    classifiedState.lastToolContext?.kind === 'image' &&
    addressesThreadImage(
      lastUserTextNoMentions,
      classifiedState.lastTurnEditables?.includes('image') === true
    )
  ) {
    classifiedState.takesThreadImage = true;
  }

  const plan = decideTurnPlan({
    // EINE Lesung des Schalters pro Turn. Vorher standen hier drei, die
    // auseinanderlaufen konnten, sobald jemand eine davon anfasst.
    loopEnabled: isAgenticLoopEnabled(),
    agenticIntents: AGENTIC_INTENTS,
    systemToolIntents: SYSTEM_TOOL_INTENTS,
    intent: proposedIntent,
    lastUserText,
    forcedTool: !!forcedTool,
    mentionPinnedTool: classifiedState.mentionPinnedTool ?? null,
    mentionPinnedArtifactKind: classifiedState.mentionPinnedArtifactKind ?? null,
    agenturaCreateOrder: classifiedState.agenturaCreateOrder === true,
    hasMcpScope: classifiedState.mcpServerScope != null,
    isCompound,
    // A chosen notebook keeps the turn single-pass, on EVERY agent — only
    // `searchNode` retrieves notebook content, and no loop tool can address a
    // notebook. `isCompound` covers just the named-agent half of this and
    // additionally drives topic extraction and a progress event, so the routing
    // fact gets its own name. See AgenticDecisionInput.
    hasSelectedNotebook: notebookIds.length > 0,
    hasImageAttachments: imageAttachments.length > 0,
    secondaryIntent: classifiedState.secondaryIntent ?? null,
    // `hasReachableForm`, nicht „irgendein PDF liegt herum": eine Ausfüll-Bitte
    // neben einem nicht ausfüllbaren PDF schob den Turn sonst in den Loop, wo
    // ihn kein Werkzeug erwartet.
    isPdfFillRequest: hasReachableForm(classifiedState) && isSheetFillRequest(lastUserText),
    isReisekostenTurn: isReisekostenTurn(
      classifiedState.activeSkillMention,
      lastUserTextNoMentions,
      classifiedState.messages
    ),
    // Die Tabelle entscheidet, nicht die Frage: `tabelle_auswerten` hängt nur im
    // Loop, und eine Tabellenfrage landet oft als `compute` im Einzeldurchlauf.
    // Dasselbe Prädikat wie Katalog und Prompt (Person, Schalter, Client-Fähigkeit).
    isTabularAnalysisTurn: isTabelleAuswertenMountable(classifiedState),
    classifierContradictedResearch: classifiedState.classifierContradictedResearch === true,
    // Same question the classifier's Tier 3.5 asks, asked again here because a
    // turn can reach this gate without having passed that tier (confident
    // heuristic, LLM verdict, post-pass correction).
    // An attached image is material like an attached PDF: "schreib einen Post
    // zu dem Plakat" is not an unsourced writing order.
    hasOwnMaterial:
      lastUserText.length > NOUN_TRIGGER_MAX_LENGTH ||
      !!classifiedState.attachmentContext ||
      imageAttachments.length > 0 ||
      !!classifiedState.currentDocument ||
      (classifiedState.docMentionIds ?? []).length > 0,
    enabledTools: enabledTools ?? null,
    agentIdentifier: classifiedState.agentConfig?.identifier ?? null,
    hasOpenDocumentId: !!rawCurrentDocument?.id,
    hasOpenBoardId: !!rawCurrentBoard?.id,
    hasOpenBoardSurface: !!rawCurrentBoard,
    hasOpenCanvasId: !!rawCurrentCanvas?.id,
    hasNamedBoard: (rawBoardIds?.length ?? 0) > 0 || mentionBoardIds.length > 0,
    isSharepicRefinement: !!sharepicRefinement,
    // Eine Antwort, die eine Lücke füllt, kommt als `isSharepicRefinement` aus
    // earlyHandlerStage — dieses Signal braucht dafür nichts.
    addressesThreadSharepic:
      stateHasSharepic(classifiedState) &&
      looksLikeSharepicOrder(orderText(lastUserTextNoMentions)),
    threadHasSharepic: stateHasSharepic(classifiedState),
    editsThreadPdf:
      classifiedState.lastToolContext?.kind === 'pdf' && isPdfEditAsk(lastUserTextNoMentions),
    threadWorksOnSharepic: sharepicInProgress,
    artifactEditOrder: classifiedState.artifactEditOrder === true,
    pipelineForceIntent: pipelineAgent?.forceIntent ?? null,
    acceptedOfferKind: classifiedState.acceptedOfferKind ?? null,
  });

  if (plan.compoundGenerationKind) {
    classifiedState.compoundGeneration = true;
    classifiedState.compoundGenerationKind = plan.compoundGenerationKind;
    classifiedState.compoundGenerationOrdered = plan.compoundGenerationOrdered;
  }
  if (plan.compoundEdit) classifiedState.compoundEdit = true;
  if (plan.editToolSurface) {
    classifiedState.editToolSurface = plan.editToolSurface;
    log.info(
      `[ChatGraph] editToolLoop active — surface=${plan.editToolSurface}, ${editToolNameFor(classifiedState)} mounted (classifier intent=${proposedIntent})`
    );
  }
  classifiedState.intent = plan.intent;
  if (plan.backfillSearchQuery && !classifiedState.searchQuery && lastUserText) {
    classifiedState.searchQuery = lastUserText;
  }

  // Der Ausgangstext wird EINMAL bestimmt und von beiden Enden der Kette
  // benutzt: der Antwortschritt bekommt ihn über den State in den Systemprompt
  // genagelt, die Nachschritte messen gegen dieselbe Variable. Vorher entschied
  // Schritt 1 selbst, was er aus dem Thread-Kontext für gemeint hielt — und dort
  // liegt der Volltext jedes früheren Anhangs.
  const resolvedOriginal = pipelineAgent
    ? resolveOriginalText(classifiedState, lastUserText, promptIsPastedText)
    : '';
  // Übertragen wird nur Material: Eingefügtes, ein Anhang oder eine Mention —
  // oder eine getippte Nachricht, die lang genug ist, um selbst der Text zu
  // sein. Eine kurze Frage an den Agenten („Was ist Leichte Sprache?") liefe
  // sonst als Ausgangstext durch Übertragung und Prüfkette.
  const isMaterial =
    promptIsPastedText ||
    resolvedOriginal.trim() !== lastUserText.trim() ||
    resolvedOriginal.length >= MIN_TYPED_TRANSFER_CHARS;
  const pipelineOriginal = isMaterial ? resolvedOriginal : '';
  if (pipelineAgent) {
    classifiedState.pipelineSourceText = pipelineOriginal || null;
    log.info(
      `[${requestId}] [${pipelineAgent.identifier}] Ausgangstext festgelegt: ` +
        `${pipelineOriginal.length} Zeichen`
    );
  }

  sse.send('intent', {
    intent: classifiedState.intent,
    // Die Statuszeile eines Konnektor-Turns („Frage verbundenen Dienst…") hing
    // am Intent `mcp`; seit #4043 ist er `agentic` mit Scope.
    message: getIntentMessage(
      classifiedState.intent === 'agentic' && classifiedState.mcpServerScope != null
        ? 'mcp'
        : classifiedState.intent
    ),
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
    ...(plan.runAgentic && { agentic: true }),
  });
  return { plan, pipelineAgent, pipelineOriginal };
}
