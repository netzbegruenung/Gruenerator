import { type DecisionPointId } from '../../../utils/decisionJournal.js';

import { type ScriptedResponse } from './harness/loopScript.js';

/**
 * Scenarios that run the REAL agentic loop, with the model scripted at the
 * `streamText` boundary rather than at the service boundary.
 *
 * Separate from `scenarios.ts` because the two need incompatible module mocks
 * and `vi.mock` is per file: the simulated lane replaces `streamAgenticResponse`
 * wholesale, which is why `loop.synth_verdict` and `loop.tool_guard` show as
 * `(not reached)` in every map it renders. Here that double is gone and `ai`'s
 * `streamText` is replaced instead, so `loopEngine` runs for real.
 *
 * What this buys: the loop's three SILENT answer substitutions become
 * observable. The wire shows only the substitute — a wrongly swapped answer and
 * a correct decline look exactly alike from outside, which is why the
 * over-refusal case in the eval README went undiagnosed for so long.
 *
 * Same honesty rule as the sibling registry: `note` is required and states the
 * model assumption. Here the assumption is narrower and cheaper to hold, because
 * the scripted text is checked against the real predicates
 * (`looksLikeSynthRefusal`, `looksDegenerateSynth`) rather than against a guess
 * about what a provider would emit.
 */

export interface LoopScenario {
  id: string;
  category: string;
  /** REQUIRED — the model assumption, and what makes it hold. */
  note: string;
  prompt: string;
  /**
   * One scripted response per expected `streamText` call, in order. Split mode
   * calls twice (gather, synth) and a third time when the synth is retried; an
   * unconsumed entry fails the run, because it would mean the turn took a
   * different shape than the scenario claims.
   */
  streams: ScriptedResponse[];
  mustDecide?: Array<{ point: DecisionPointId; chose: string }>;
  notReached?: DecisionPointId[];
}

/** Trips ENGLISH_REFUSAL_RE in `refusalDetection.ts` (`i'm sorry` + `i can't help`). */
const ENGLISH_REFUSAL = "I'm sorry, I can't help with that request.";

/**
 * Trips `looksDegenerateSynth`: under 200 chars, at least three words, no markup,
 * and no German function word. This is the shape the live failure had — the synth
 * model imitating the tool-call pattern instead of answering.
 */
const LEAKED_PLAN = 'Now I will perform another search to gather more evidence.';

const GERMAN_ANSWER =
  'Die Grünen fordern einen konsequenten Ausbau der Windkraft und wollen die ' +
  'Genehmigungsverfahren in den Kommunen deutlich beschleunigen.';

/** Reaches tier 3.5 loop demotion, so every scenario below enters the loop. */
const LOOP_PROMPT = 'Was ist die Position der Gruenen zur Windkraft?';

export const LOOP_SCENARIOS: readonly LoopScenario[] = [
  {
    id: 'loop-synth-akzeptiert',
    category: 'synth-verdict',
    note: 'Der Kontrollfall und das Gegenstueck zu allen drei Ersetzungen: deutsche Prosa passiert unveraendert. Ohne ihn zeigt kein Diff, dass eine Ersetzung ANGEFANGEN hat zu greifen.',
    prompt: LOOP_PROMPT,
    streams: [{ text: '' }, { text: GERMAN_ANSWER }],
    mustDecide: [
      { point: 'router.run_agentic', chose: 'loop' },
      { point: 'loop.synth_verdict', chose: 'accepted' },
    ],
  },
  {
    id: 'loop-synth-ablehnung-getauscht',
    category: 'synth-verdict',
    note: 'Englische Ablehnung. Geprueft gegen ENGLISH_REFUSAL_RE, nicht geraten. Die Reihenfolge traegt: die Ablehnungspruefung laeuft VOR der Degeneriertheitspruefung, sonst wuerde eine englische Absage als Degeneration noch einmal beim Modell nachgefragt.',
    prompt: LOOP_PROMPT,
    streams: [{ text: '' }, { text: ENGLISH_REFUSAL }],
    mustDecide: [{ point: 'loop.synth_verdict', chose: 'refusal_swapped' }],
  },
  {
    id: 'loop-synth-degeneriert-wiederholt',
    category: 'synth-verdict',
    note: 'Geleakter Plan statt Antwort — der live beobachtete Fall. Der zweite Versuch liefert Prosa, der Nutzer sieht die Degeneration nie, weil der Emitter den ersten Absatz zurueckhaelt.',
    prompt: LOOP_PROMPT,
    streams: [{ text: '' }, { text: LEAKED_PLAN }, { text: GERMAN_ANSWER }],
    mustDecide: [{ point: 'loop.synth_verdict', chose: 'degenerate_retried' }],
  },
  {
    id: 'loop-synth-zweimal-degeneriert',
    category: 'synth-verdict',
    note: 'Beide Versuche degeneriert. Der Loop gibt dann bewusst LEEREN Text zurueck, damit der ehrliche Keine-Antwort-Pfad des Aufrufers greift statt eine geleakte Planungszeile auszuliefern.',
    prompt: LOOP_PROMPT,
    streams: [{ text: '' }, { text: LEAKED_PLAN }, { text: LEAKED_PLAN }],
    mustDecide: [{ point: 'loop.synth_verdict', chose: 'retry_failed_empty' }],
  },
];
