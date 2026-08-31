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
} from '../../../agents/langgraph/ChatGraph/nodes/classifierHeuristics.js';
import { detectManagedSources } from '../../../agents/langgraph/ChatGraph/nodes/managedSourceTrigger.js';
import { SYSTEM_TOOL_INTENTS } from '../../../services/mcp/systemMcpServers.js';
import { recordDecision } from '../../../utils/decisionJournal.js';
import { createLogger } from '../../../utils/logger.js';
import { deriveImplicitRecipeMention } from '../agents/implicitRecipe.js';
import { preferredLvRecipeMention } from '../agents/lvRecipePreference.js';
import { getPipelineAgent } from '../agents/pipelines/index.js';
import { isAgenticLoopEnabled } from '../services/agenticLoop/flags.js';
import { AGENTIC_INTENTS } from '../services/agenticLoop/intents.js';
import { decideTurnPlan, type TurnPlan } from '../services/agenticLoop/turnPlan.js';
import { resolveOriginalText } from '../services/agentPipeline.js';
import { hasReachableForm } from '../services/pdfFormAvailability.js';
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
  /** Die eine Turn-Entscheidung. Niemand hinter dieser Stage entscheidet neu. */
  plan: TurnPlan;
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
  // Der Vorschlag des Klassifikators, festgehalten bevor der Plan ihn ersetzt —
  // die Protokollzeile unten nennt ihn, und sie meint den VORSCHLAG.
  const proposedIntent = classifiedState.intent;

  // First-party connectors this turn should mount. Vocabulary decides
  // (`managedSourceTrigger`), not a verdict — and an explicit `@gesetze`-style
  // mention already resolved to an `mcp:system-<key>` scope above, which the
  // connector path handles on its own.
  const managedSourceKeys = detectManagedSources(lastUserTextNoMentions);
  if (managedSourceKeys.length > 0) {
    classifiedState.managedSourceKeys = managedSourceKeys;
    log.info(`[ChatGraph] Managed sources: ${managedSourceKeys.join(', ')}`);
  }

  const pipelineAgent = getPipelineAgent(classifiedState.agentConfig?.identifier);

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
    // Nur `@deepresearch` setzt das (forcedIntentStage). Der Entscheider
    // braucht es, seit `research` die Loop-Achse trägt — sonst risse der Flip
    // den Dossier-Weg mit.
    deepResearchRequested: classifiedState.deepResearchRequested === true,
    mentionPinnedArtifactKind: classifiedState.mentionPinnedArtifactKind ?? null,
    isCompound,
    // A chosen notebook keeps the turn single-pass, on EVERY agent — only
    // `searchNode` retrieves notebook content, and no loop tool can address a
    // notebook. `isCompound` covers just the named-agent half of this and
    // additionally drives topic extraction and a progress event, so the routing
    // fact gets its own name. See AgenticDecisionInput.
    hasSelectedNotebook: notebookIds.length > 0,
    hasManagedSources: managedSourceKeys.length > 0,
    hasImageAttachments: imageAttachments.length > 0,
    secondaryIntent: classifiedState.secondaryIntent ?? null,
    // `hasReachableForm`, nicht „irgendein PDF liegt herum": eine Ausfüll-Bitte
    // neben einem nicht ausfüllbaren PDF schob den Turn sonst in den Loop, wo
    // ihn kein Werkzeug erwartet.
    isPdfFillRequest: hasReachableForm(classifiedState) && isSheetFillRequest(lastUserText),
    classifierContradictedResearch: classifiedState.classifierContradictedResearch === true,
    // Same question the classifier's Tier 3.5 asks, asked again here because a
    // turn can reach this gate without having passed that tier (confident
    // heuristic, LLM verdict, post-pass correction).
    hasOwnMaterial:
      lastUserText.length > NOUN_TRIGGER_MAX_LENGTH ||
      !!classifiedState.attachmentContext ||
      !!classifiedState.currentDocument ||
      (classifiedState.docMentionIds ?? []).length > 0,
    enabledTools: enabledTools ?? null,
    agentIdentifier: classifiedState.agentConfig?.identifier ?? null,
    hasOpenDocumentId: !!rawCurrentDocument?.id,
    hasOpenBoardId: !!rawCurrentBoard?.id,
    hasOpenBoardSurface: !!rawCurrentBoard,
    hasNamedBoard: (rawBoardIds?.length ?? 0) > 0 || mentionBoardIds.length > 0,
    isSharepicRefinement: !!sharepicRefinement,
    pipelineForceIntent: pipelineAgent?.forceIntent ?? null,
  });

  if (plan.compoundGenerationKind) {
    classifiedState.compoundGeneration = true;
    classifiedState.compoundGenerationKind = plan.compoundGenerationKind;
  }
  if (plan.compoundEdit) classifiedState.compoundEdit = true;
  if (plan.editToolSurface) {
    classifiedState.editToolSurface = plan.editToolSurface;
    log.info(
      `[ChatGraph] editToolLoop active — surface=${plan.editToolSurface}, edit_document mounted (classifier intent=${proposedIntent})`
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
  //
  // Die Bedingung fragt die LANE, nicht drei Einzelfakten: `produktion` heisst
  // per Definition „kein Loop, Prosa-Verdikt, kein Gruss" — genau die drei
  // Prüfungen, die hier vorher als `!runAgentic` plus ein Intent-Literalpaar
  // standen. Ein viertes Prosa-Verdikt bekäme das Rezept damit von selbst,
  // statt dass jemand daran denken muss, diese Zeile nachzuziehen.
  //
  // Ein server-eigener Rollen-Baustein zählt dabei NICHT als Custom-Prompt —
  // dieselbe Ausnahme, die `catalogAssembly` für das Rezept-Selbstladen im
  // Loop macht: eine Katalogrolle „Presse & Social-Media" will das
  // Presse-Rezept, statt von allen ausgesperrt zu sein. Der Antwortknoten
  // hängt das Fragment im Baustein-Zweig entsprechend an (respondNode).
  if (
    plan.lane === 'produktion' &&
    !pipelineAgent &&
    !classifiedState.activeSkillMention &&
    (!classifiedState.customSystemPrompt || classifiedState.roleBausteinActive === true) &&
    enabledTools?.['rezept_laden'] !== false
  ) {
    const implicitRecipe = deriveImplicitRecipeMention(
      lastUserTextNoMentions,
      classifiedState.userLocale ?? null
    );
    if (implicitRecipe) {
      // Der Matcher liefert bewusst nur generische Mentions (ein nacktes
      // Plattformwort trägt keine Region). Die Region kommt aus dem Kontext:
      // LV-PR-Agent oder genau EINE Landesverbands-Rolle → deren Variante.
      const lvVariant = preferredLvRecipeMention({
        mention: implicitRecipe,
        agentIdentifier: classifiedState.agentConfig?.identifier ?? null,
        roles: classifiedState.userRoles ?? null,
        userLocale: classifiedState.userLocale ?? null,
      });
      recordDecision('router.implicit_recipe', implicitRecipe, {
        inputs: { intent: classifiedState.intent, ...(lvVariant && { lvVariant }) },
      });
      log.info(
        `[${requestId}] implicit recipe on single-pass: @${lvVariant ?? implicitRecipe}` +
          (lvVariant ? ` (LV-Vorzug statt @${implicitRecipe})` : '')
      );
      classifiedState.activeSkillMention = lvVariant ?? implicitRecipe;
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
    ...(plan.runAgentic && { agentic: true }),
  });
  return { plan, pipelineAgent, pipelineOriginal };
}
