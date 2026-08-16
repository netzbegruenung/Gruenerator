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
  forbidsPersistentAction,
  hasExplicitSharepicWord,
  type ForbiddableArtifact,
} from '../../../agents/langgraph/ChatGraph/nodes/fastPathGuards.js';
import { recordDecision } from '../../../utils/decisionJournal.js';
import { createLogger } from '../../../utils/logger.js';
import { NO_SHAREPIC_TO_EDIT_TEXT } from '../services/platformGating.js';
import { threadHasSharepic } from '../services/sharepicEditService.js';

import { finishTurnWithFixedText, type FixedTextBase } from './turnEnd.js';
import { type InitialState, type MaybeHandled } from './types.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';

const log = createLogger('chatGraphContractRouter');

export interface ActionGateStageParams {
  classifiedState: ChatGraphState;
  initialState: InitialState;
  fixedTextBase: FixedTextBase;
  /** An @-mention pinned the intent — an explicit pick licenses a sharepic. */
  forcedTool: boolean;
  lastUserTextNoMentions: string;
  actualThreadId: string | undefined;
}

export interface ActionGateStageOutput {
  /** Whether this turn was allowed to MAKE a sharepic. Read again in the
   *  response stage: a post without a licence is text-only, not a failed
   *  sharepic. */
  sharepicLicensed: boolean;
}

export async function runActionGateStage({
  classifiedState,
  initialState,
  fixedTextBase,
  forcedTool,
  lastUserTextNoMentions,
  actualThreadId,
}: ActionGateStageParams): Promise<MaybeHandled<ActionGateStageOutput>> {
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
    hasExplicitSharepicWord(lastUserTextNoMentions);

  if (classifiedState.intent === 'sharepic' && !sharepicLicensed) {
    if (actualThreadId && (await threadHasSharepic(actualThreadId))) {
      // Sharepic-shaped, and there IS one — but the edit lanes declined it
      // (wrong template, ambiguous, not actually an edit). Answering
      // normally beats minting a surprise second sharepic.
      log.info('[ChatGraph] Unlicensed sharepic intent, thread has one → produktion');
      // Decision key unchanged (F1): the journal cards are named after it.
      recordDecision('router.intent_override', 'sharepic_unlicensed_to_direct', {
        inputs: { intentBefore: 'sharepic', sharepicLicensed, threadHasSharepic: true },
      });
      classifiedState.intent = 'produktion';
    } else {
      log.info('[ChatGraph] Unlicensed sharepic intent, nothing to edit → fixed reply');
      recordDecision('router.intent_override', 'sharepic_unlicensed_fixed_text', {
        inputs: { intentBefore: 'sharepic', sharepicLicensed, threadHasSharepic: false },
      });
      return {
        handled: true,
        result: await finishTurnWithFixedText({
          ...fixedTextBase,
          text: NO_SHAREPIC_TO_EDIT_TEXT,
          intent: 'sharepic',
        }),
      };
    }
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
  return { handled: false, sharepicLicensed };
}
