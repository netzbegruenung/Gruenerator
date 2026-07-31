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
  /**
   * Die Antwort des Generierungs-Auflösers (Tier 3.8), falls er erreicht wird.
   *
   * Ersetzt das frühere `verdict` — den Antwortsatz der LLM-Stufe. Die ist
   * gelöscht, und damit ist dieser Auflöser die einzige Stelle geblieben, an der
   * ein Modell dem Turn noch ein Verdikt geben kann. Sein Antwortraum ist
   * geschlossen (`dokument | sharepic | bild | tabelle | praesentation | pdf |
   * diagramm | social | keine`), also ist eine Annahme hier ungleich billiger zu
   * prüfen als eine Annahme über 40 Intents.
   *
   * Weglassen, wenn die Formulierung deterministisch entschieden wird.
   */
  generationKind?: string;
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
    note: 'Braucht seit dem Loeschen der LLM-Stufe keine Annahme mehr: das Verbot wird deterministisch erkannt, der Turn faellt ins Residual. Die Entscheidung ist damit eine Stufe frueher gewandert — das Gate im Router wird fuer den PRIMAERintent gar nicht mehr erreicht (es kennt nur Artefakt-Intents) und bleibt die zweite Tuer fuer secondaryIntent.',
    prompt: 'Halte die Ergebnisse fest, aber erstelle diesmal kein Dokument.',
    mustDecide: [
      { point: 'classifier.tier', chose: 'residual' },
      { point: 'router.run_agentic', chose: 'single_pass' },
    ],
    notReached: ['router.persistent_action_gate'],
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
    note: 'Nimmt an, dass der Generierungs-Aufloeser einen Wortkunst-Auftrag als sharepic liest. Ein unlizenziertes sharepic kann praktisch nur von dort kommen — eine Formulierung, die die Heuristik als sharepic liest, benennt eines und waere damit lizenziert. Prompt am 31.07.2026 gegen die Tiers gemessen: "Entwirf" triggert das Generierungs-Gitter, "Slogan" haelt den Turn in sich geschlossen (keine Demotion), und das Wort Sharepic faellt nicht.',
    prompt: 'Entwirf einen Slogan zur Kernaussage',
    generationKind: 'sharepic',
    mustDecide: [
      { point: 'router.intent_override', chose: 'sharepic_unlicensed_fixed_text' },
      { point: 'classifier.tier', chose: 'tier3.8_generation_scope' },
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
  // GELOESCHT: 'loop-aus-degradiert'.
  //
  // Das Szenario sollte die Degrade-Versicherung des Routers belegen
  // (`agentic` mit ausgeschaltetem Loop -> `search`). Die committete Karte zeigt,
  // dass es das nie tat: der Lauf endete in `tier4_llm_error_fallback` mit
  // `classifier_degraded`, also im Fehlerpfad, und `single_pass` folgte daraus
  // trivial. Mit der geloeschten LLM-Stufe kann `agentic` bei ausgeschaltetem
  // Schalter ueberhaupt nicht mehr entstehen — Tier 3.5 demotiert dann nicht.
  // Der Guard im Router bleibt fuer den Wiederaufnahme-Pfad stehen und sagt das
  // dort auch.
];
