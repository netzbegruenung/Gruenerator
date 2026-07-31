import { type DecisionPointId } from '../../../utils/decisionJournal.js';

/**
 * Simulated prompt runs: realistic prompts through the real pipeline, with the
 * model scripted, recording which decisions were made and what reached the wire.
 *
 * A typed registry rather than the live lane's JSONL, deliberately. The two
 * lanes answer different questions and must not share artefacts — someone
 * reading a green simulated line as a green live line is the exact confusion
 * this tier has to avoid. Being typed also means `point` and `chose` are checked
 * by the compiler, so a scenario cannot name a decision that does not exist;
 * the live corpus paid for the untyped version of that lesson once already
 * (`evals/types.ts`: a mistyped key "silently became undefined … reported green
 * having asserted nothing").
 *
 * Scenarios come in PAIRS wherever a guard is involved. A single-sided scenario
 * cannot show that a guard stopped firing — the pair can: one line flips from
 * the guarded branch to the unguarded one, and the consequences follow it down
 * the map.
 */

/** What the classifier's LLM tier should answer, if it is reached at all. */
export interface ScriptedVerdict {
  intent: string;
  secondaryIntent?: string | null;
}

export interface SimScenario {
  id: string;
  category: string;
  /**
   * REQUIRED. The model assumption this scenario rests on, and when it was last
   * checked against reality. A scripted verdict is a guess about model
   * behaviour: if the real classifier stops producing it, this scenario stays
   * green while the product is broken. Writing the assumption down is what
   * makes that reviewable instead of invisible.
   */
  note: string;
  prompt: string;
  /** Omit when the phrasing is expected to resolve in a heuristic tier. */
  verdict?: ScriptedVerdict;
  /** Extra request-body fields. */
  body?: Record<string, unknown>;
  env?: Record<string, string>;
  /** Points that MUST appear in the journal, with the branch taken. */
  mustDecide?: Array<{ point: DecisionPointId; chose: string }>;
  /** Points that must NOT have been evaluated at all on this path. */
  notReached?: DecisionPointId[];
}

export const SIM_SCENARIOS: readonly SimScenario[] = [
  {
    id: 'kein-dokument',
    category: 'negative-action',
    note: 'Nimmt an, dass der LLM-Tier fuer diese Formulierung save_as_doc liefert. Geprueft am 2026-07-30 gegen die Heuristik-Tiers: die Formulierung erreicht Tier 4.',
    prompt: 'Halte die Ergebnisse fest, aber erstelle diesmal kein Dokument.',
    verdict: { intent: 'save_as_doc' },
    mustDecide: [
      { point: 'router.persistent_action_gate', chose: 'demoted_primary_to_direct' },
      { point: 'router.run_agentic', chose: 'single_pass' },
      { point: 'classifier.tier', chose: 'tier4_llm' },
    ],
  },
  {
    id: 'dokument-erlaubt',
    category: 'negative-action',
    note: 'Gegenstueck zu kein-dokument: gleiche Verben, kein Verbot. Beweist, dass das Gate ueberhaupt der Unterschied ist. Braucht seit #2270 KEIN Verdikt mehr: "leg sie als Dokument ab" erreicht die Heuristik in beiden Wortstellungen und wird bei Tier 3 entschieden. Ein gesetztes Verdikt wuerde hier nichts mehr belegen — der Turn kaeme nie beim Modell an.',
    prompt: 'Halte die Ergebnisse fest und leg sie als Dokument ab.',
    mustDecide: [
      { point: 'router.persistent_action_gate', chose: 'allowed' },
      { point: 'classifier.tier', chose: 'tier3_heuristic' },
    ],
  },
  {
    id: 'sharepic-unlizenziert',
    category: 'sharepic-licence',
    note: 'Nimmt an, dass der LLM-Tier einen Umformulierungs-Auftrag als sharepic liest. Ein unlizenziertes sharepic kann praktisch nur von dort kommen — eine Formulierung, die die Heuristik als sharepic liest, benennt eines und waere damit lizenziert. Prompt am 31.07.2026 gegen die Tiers gemessen: seit der Default-Inversion erreicht nur noch ein in sich geschlossener Turn (hier: reine Wortkunst) die LLM-Stufe.',
    prompt: 'Entwickle einen Slogan zur Kernaussage',
    verdict: { intent: 'sharepic' },
    mustDecide: [
      { point: 'router.intent_override', chose: 'sharepic_unlicensed_fixed_text' },
      { point: 'classifier.tier', chose: 'tier4_llm' },
    ],
  },
  {
    id: 'sharepic-lizenziert',
    category: 'sharepic-licence',
    note: 'Gegenstueck: dieselbe Absicht, aber das Wort steht in der Prosa. Der Lizenz-Zweig darf dann gar nicht erst greifen.',
    prompt: 'Erstelle ein Sharepic zur Windkraft',
    notReached: ['router.persistent_action_gate'],
  },
  {
    id: 'loop-demotion',
    category: 'routing',
    note: 'Sachfrage ohne Sharepic-/Artefakt-Bezug. Erwartet die Loop-Demotion (heuristische Confidence unter der Schwelle), also KEINEN LLM-Aufruf.',
    prompt: 'Was ist die Position der Gruenen zur Windkraft?',
    mustDecide: [
      { point: 'classifier.tier', chose: 'tier3.5_loop_demotion' },
      { point: 'router.run_agentic', chose: 'loop' },
    ],
  },
  {
    id: 'gruss-bleibt-direct',
    category: 'routing',
    // Id bleibt (F1: Registry-IDs werden nicht umbenannt) — die Karte darunter
    // heisst genauso. Der Gruss traegt seit dem Split den Intent `greeting`.
    note: 'Gegenstueck zur Demotion: ein Gruss darf niemals ein Werkzeug ausloesen.',
    prompt: 'Hallo!',
    mustDecide: [
      { point: 'classifier.tier', chose: 'tier3_short_message' },
      { point: 'router.run_agentic', chose: 'single_pass' },
    ],
  },
  {
    id: 'loop-aus-degradiert',
    category: 'routing',
    note: 'Dieselbe Sachfrage mit geworfenem Kill-Switch. Der Intent "agentic" benennt dann einen Pfad, den es nicht mehr gibt — ohne die Degrade-Versicherung antwortete der Turn ohne jede Recherche aus dem Modellgedaechtnis.',
    prompt: 'Was ist die Position der Gruenen zur Windkraft?',
    env: { CHAT_AGENT_LOOP: 'false' },
    mustDecide: [{ point: 'router.run_agentic', chose: 'single_pass' }],
  },
];
