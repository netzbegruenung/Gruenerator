/**
 * The two "may this turn do that?" gates, enforced once each.
 *
 * Both exist because the intents they guard have many doors (Tier-3 heuristic,
 * the malformed-JSON recovery) and only some of them ever checked. Enforcing
 * here, after the edit branches have had their chance and before anything
 * mounts a tool, is what lets every door stay dumb.
 */

import {
  ARTIFACT_NOUN_BY_KIND,
  asksForSharepic,
  forbidsPersistentAction,
  type ForbiddableArtifact,
  hasExplicitSharepicWord,
} from '../../../agents/langgraph/ChatGraph/nodes/fastPathGuards.js';
import { recordDecision } from '../../../utils/decisionJournal.js';
import { createLogger } from '../../../utils/logger.js';
import { orderText } from '../services/orderText.js';
import { threadHasSharepic } from '../services/sharepicEditService.js';

import { type InitialState } from './types.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';

const log = createLogger('chatGraphContractRouter');

export interface ActionGateStageParams {
  classifiedState: ChatGraphState;
  initialState: InitialState;
  /** An @-mention pinned the intent — an explicit pick licenses a sharepic. */
  forcedTool: boolean;
  lastUserTextNoMentions: string;
  actualThreadId: string | undefined;
}

/**
 * Das Gitter beendet keinen Turn mehr, es schreibt nur den Intent um. Die feste
 * Absage „kein Sharepic zum Anpassen" war sein letzter Ausgang (#4788).
 */
export async function runActionGateStage({
  classifiedState,
  initialState,
  forcedTool,
  lastUserTextNoMentions,
  actualThreadId,
}: ActionGateStageParams): Promise<void> {
  // === Sharepic licence: the single gate for "may this turn make one?" ===
  // A sharepic is legitimate in exactly two situations: the user named one,
  // or the thread already has one to edit — and both edit lanes above have
  // had their chance at the second. Enforcing it HERE, once, is what let the
  // classifier lose five regexes: every door (Tier-3 heuristic, the
  // malformed-JSON recovery in classifierParsing) ends up passing through
  // this line, so none of them needs its own gate.
  // Placed before compoundKind so an unlicensed turn cannot mount the fat
  // tool either.
  const sharepicLicensed =
    forcedTool || // @sharepic mention — an explicit pick
    initialState.agentConfig?.identifier === 'gruenerator-sharepic' ||
    // Das „ja" auf ein angebotenes Sharepic (#4367) — bestellt, nur nicht im Text.
    classifiedState.acceptedOfferKind === 'sharepic' ||
    // Dasselbe Prädikat wie die Klassifikator-Regel: eine blosse Erwähnung
    // („Dazu passt später ein Sharepic.") lizenziert nichts (Beta-Audit 30.09.2026).
    asksForSharepic(orderText(lastUserTextNoMentions));

  // Ein unlizenzierter Turn geht immer als `produktion` weiter. Bis 21.10.2026
  // endete er ohne Sharepic im Thread und ohne das Wort in einer festen Absage
  // („kein Sharepic, das ich anpassen könnte") und machte so jeden Fehlgriff des
  // Generierungs-Aufklärers zur Sackgasse: „Kürzer bitte und weniger Emojis"
  // unter einem Post mit Bildidee bekam die Absage statt des Posts (#4788).
  if (classifiedState.intent === 'sharepic' && !sharepicLicensed) {
    const threadHasOne = !!actualThreadId && (await threadHasSharepic(actualThreadId));
    if (threadHasOne || !hasExplicitSharepicWord(orderText(lastUserTextNoMentions))) {
      // Sharepic-shaped, but either the edit lanes declined the one the thread
      // has (wrong template, ambiguous, not actually an edit) or nothing in the
      // order says sharepic. Answering normally beats minting a surprise one.
      log.info(
        `[ChatGraph] Unlicensed sharepic intent (threadHasSharepic=${threadHasOne}) → produktion`
      );
      // Decision key unchanged (F1): the journal cards are named after it.
      recordDecision('router.intent_override', 'sharepic_unlicensed_to_direct', {
        inputs: { intentBefore: 'sharepic', sharepicLicensed, threadHasSharepic: threadHasOne },
      });
    } else {
      // Das Wort steht im Auftrag, nur das Bestell-Verb fehlt: der Klassifikator
      // hat ein Sharepic gesehen, die Regex keinen Auftrag. Der Einzeldurchlauf
      // baut immer — er ist ein erzwungener Aufruf und bleibt der Bestellung
      // vorbehalten. Der Turn geht stattdessen als `produktion` weiter, und der
      // Router montiert das Werkzeug ohne Zwang (`namesSharepicWithoutOrder`):
      // der Planer entscheidet. Bis 15.10.2026 endete so ein Turn in der festen
      // Absage. Nur ohne Sharepic im Thread, damit einer mit Sharepic weiterhin
      // keinen Überraschungs-Zweiten bekommt.
      log.info(
        '[ChatGraph] Sharepic named without an order → produktion, tool left to the planner'
      );
      recordDecision('router.intent_override', 'sharepic_named_to_planner', {
        inputs: { intentBefore: 'sharepic', sharepicLicensed },
      });
    }
    classifiedState.intent = 'produktion';
  }

  // === Negative action constraints: one gate for "may this turn persist?" ===
  // Same shape as the sharepic licence above, same reason: the artifact
  // intents have many doors (Tier-2.7 lastToolContext, Tier-3 heuristics,
  // the malformed-JSON recovery) and only the Tier-3 ones ever checked for
  // negation. Enforcing it here, once, means a door that forgets cannot
  // leak. Demoting to `direct` (rather than a fixed reply) is deliberate:
  // the user asked for an ANSWER and forbade the artifact — they should get
  // the answer.
  const forbiddenBy: Partial<Record<string, ForbiddableArtifact>> = {
    save_as_doc: 'document',
    modify_doc: 'document',
    share_doc: 'document',
    create_sheet: 'sheet',
    create_presentation: 'presentation',
    create_pdf: 'pdf',
    create_explainable: 'explainable',
    modify_board: 'board',
    image: 'image',
  };
  const primaryFamily = forbiddenBy[classifiedState.intent];
  if (primaryFamily) {
    const forbidden = forbidsPersistentAction(
      lastUserTextNoMentions,
      ARTIFACT_NOUN_BY_KIND[primaryFamily]
    );
    recordDecision(
      'router.persistent_action_gate',
      forbidden ? 'demoted_primary_to_produktion' : 'allowed',
      { inputs: { family: primaryFamily, intent: classifiedState.intent } }
    );
    if (forbidden) {
      log.info(
        `[ChatGraph] Turn forbids ${primaryFamily} action → demoting intent ${classifiedState.intent} to produktion`
      );
      classifiedState.intent = 'produktion';
      // Carry the REASON, not just the outcome. `produktion` is the prose
      // lane, and the demoted turn lands there still carrying "mach eine
      // Präsentation" — the tool gone, and nothing in the prompt saying
      // why. That gap is what the model filled with a hand-written file
      // (see `forbiddenArtifactAction` in ChatGraph/types.ts).
      classifiedState.forbiddenArtifactAction = primaryFamily;
    }
  }
}
