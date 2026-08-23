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
 * (`looksLikeSynthRefusal`, `looksLikeToolPlanLeak`) rather than against a guess
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
  /** Extra request-body fields — `forcedTools` for an @-mention, above all. */
  body?: Record<string, unknown>;
  /** Make the first N search-backend calls fail, for the failure-cap branches. */
  backendFailures?: number;
  mustDecide?: Array<{ point: DecisionPointId; chose: string }>;
  /**
   * Der `toolChoice` des ERSTEN Planer-Schritts, als Name oder `'required'`.
   *
   * Die einzige Stelle, an der ein BENANNTER erster Aufruf beobachtbar wird: die
   * Entscheidungskarte zeigt nur, welches Werkzeug lief, und das steht im Skript
   * ohnehin. Ohne diese Zusicherung liesse sich der Werkzeug-Pin ausbauen, ohne
   * dass ein Integrationstest es merkt.
   */
  firstToolChoice?: string;
  /**
   * Ein Textstück, das im Systemtext des ersten Planer-Schritts stehen MUSS.
   *
   * Gegenstück zu `firstToolChoice` für die zweite Hälfte einer umgehängten
   * Erwähnung: der Pin sagt, WORAUS der Turn holt, das Rezept sagt, WIE er
   * schreibt — und Letzteres ist sonst nirgends beobachtbar, weil die
   * Entscheidungskarte den Systemtext nicht rendert. Der Rezepttext selbst ist
   * parteiintern und in der Prüfung gedoppelt (`internalPromptsMock`).
   */
  systemIncludes?: string;
  /**
   * Exact number of times a branch was taken. The only honest assertion for
   * `search_concurrency`: which of several parallel calls loses the race is an
   * await-interleaving artefact, but HOW MANY are deferred is a property of the
   * ceiling.
   */
  decisionCounts?: Array<{ point: DecisionPointId; chose: string; count: number }>;
  notReached?: DecisionPointId[];
  /**
   * Env-Übersteuerungen für DIESES Szenario, auf die gepinnte Grundmenge
   * gelegt (`pinChatEnv`).
   *
   * Existiert für genau eine Frage, die sonst unbeobachtbar bliebe: was ein
   * Turn tut, dessen Werkzeug nur in der Schleife lebt, wenn die Schleife AUS
   * ist. Der Zustand ist keine Hypothese — `CHAT_AGENT_LOOP=false` ist ein
   * ausgelieferter Schalter, und der Einzeldurchlauf-Pfad ist die README-
   * Pflichtprobe bei jeder searchNode-Berührung.
   */
  env?: Record<string, string>;
}

/** Trips ENGLISH_REFUSAL_RE in `refusalDetection.ts` (`i'm sorry` + `i can't help`). */
const ENGLISH_REFUSAL = "I'm sorry, I can't help with that request.";

/**
 * Trips `looksLikeToolPlanLeak`: under 200 chars, at least three words, no markup,
 * and an opening that announces an action. This is the shape the live failure had
 * — the synth model imitating the tool-call pattern instead of answering.
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
    id: 'loop-synth-werkzeugplan-wiederholt',
    category: 'synth-verdict',
    note: 'Geleakter Plan statt Antwort — der live beobachtete Fall. Der zweite Versuch liefert Prosa, der Nutzer sieht den geleakten Plan nie, weil der Emitter den ersten Absatz zurueckhaelt.',
    prompt: LOOP_PROMPT,
    streams: [{ text: '' }, { text: LEAKED_PLAN }, { text: GERMAN_ANSWER }],
    mustDecide: [{ point: 'loop.synth_verdict', chose: 'tool_plan_retried' }],
  },
  {
    id: 'loop-synth-zweimal-werkzeugplan',
    category: 'synth-verdict',
    note: 'Beide Versuche nur Plan. Der Loop gibt dann bewusst LEEREN Text zurueck, damit der ehrliche Keine-Antwort-Pfad des Aufrufers greift statt eine geleakte Planungszeile auszuliefern.',
    prompt: LOOP_PROMPT,
    streams: [{ text: '' }, { text: LEAKED_PLAN }, { text: LEAKED_PLAN }],
    mustDecide: [{ point: 'loop.synth_verdict', chose: 'retry_failed_empty' }],
  },

  // ── Tool guards ────────────────────────────────────────────────────────────
  // Thresholds these encode, from loopGuards.ts: 2 failures per tool, 5 overall,
  // 6 search calls, 2 concurrent searches, Jaccard 0.6 for near-duplicates. They
  // are asserted through the guards rather than restated, so a changed constant
  // shows up as a moved line in the map instead of a stale copy here.
  {
    id: 'loop-guard-duplikat',
    category: 'tool-guard',
    note: 'Zweimal wortgleich, danach eine andere Frage. Der dritte Aufruf ist das Gegenstueck im selben Turn: er beweist, dass die Sperre die WIEDERHOLUNG trifft und nicht das Tool.',
    prompt: LOOP_PROMPT,
    streams: [
      {
        calls: [
          { tool: 'gruenerator_search', args: { query: 'Windkraft Ausbau Kommunen' } },
          { tool: 'gruenerator_search', args: { query: 'Windkraft Ausbau Kommunen' } },
          { tool: 'gruenerator_search', args: { query: 'Kindergrundsicherung Hoehe' } },
        ],
      },
      { text: GERMAN_ANSWER },
    ],
    decisionCounts: [{ point: 'loop.tool_guard', chose: 'duplicate', count: 1 }],
  },
  {
    id: 'loop-guard-aehnliche-suche',
    category: 'tool-guard',
    note: 'Keine Wiederholung, sondern eine Teilmenge derselben Tokens — genau das, was der exakte Schluessel durchlaesst. Das ist FINDINGS.md-Befund 2: Umformulierungen kollabieren nicht von selbst.',
    prompt: LOOP_PROMPT,
    streams: [
      {
        calls: [
          { tool: 'gruenerator_search', args: { query: 'Windkraft Ausbau Kommunen' } },
          { tool: 'gruenerator_search', args: { query: 'Windkraft Ausbau' } },
        ],
      },
      { text: GERMAN_ANSWER },
    ],
    decisionCounts: [{ point: 'loop.tool_guard', chose: 'near_duplicate', count: 1 }],
  },
  {
    id: 'loop-guard-suchbudget',
    category: 'tool-guard',
    note: 'Sieben thematisch verschiedene Suchen. Keine ist Duplikat oder aehnlich, jede gelingt — die Sperre kann also nur die Anzahl sein. Der Stub liefert bewusst EINE Quelle pro Aufruf, sonst risse die Quellen-Obergrenze (20) frueher als die Aufruf-Obergrenze (6).',
    prompt: LOOP_PROMPT,
    streams: [
      {
        calls: [
          { tool: 'gruenerator_search', args: { query: 'Windkraft Ausbau' } },
          { tool: 'gruenerator_search', args: { query: 'Kindergrundsicherung Hoehe' } },
          { tool: 'gruenerator_search', args: { query: 'Mietendeckel Staedte' } },
          { tool: 'gruenerator_search', args: { query: 'Tempolimit Autobahn' } },
          { tool: 'gruenerator_search', args: { query: 'Buergergeld Reform' } },
          { tool: 'gruenerator_search', args: { query: 'Kohleausstieg Datum' } },
          { tool: 'gruenerator_search', args: { query: 'Wasserstoff Industrie' } },
        ],
      },
      { text: GERMAN_ANSWER },
    ],
    decisionCounts: [{ point: 'loop.tool_guard', chose: 'search_budget', count: 1 }],
  },
  {
    id: 'loop-guard-fehlerdeckel',
    category: 'tool-guard',
    note: 'Zwei Fehlschlaege desselben Tools, dann ein dritter Versuch. Die Sperre laeuft VOR der Duplikatspruefung, deshalb sind die Fragen verschieden — sonst benennte die Karte den falschen Grund.',
    prompt: LOOP_PROMPT,
    backendFailures: 2,
    streams: [
      {
        calls: [
          { tool: 'gruenerator_search', args: { query: 'Windkraft Ausbau' } },
          { tool: 'gruenerator_search', args: { query: 'Kindergrundsicherung Hoehe' } },
          { tool: 'gruenerator_search', args: { query: 'Mietendeckel Staedte' } },
        ],
      },
      { text: GERMAN_ANSWER },
    ],
    decisionCounts: [{ point: 'loop.tool_guard', chose: 'failure_cap', count: 1 }],
  },
  {
    id: 'loop-guard-fehlerbudget',
    category: 'tool-guard',
    note: 'Fuenf Fehlschlaege ueber drei Tools verteilt, damit der Deckel pro Tool (2) nicht zuerst greift. Der sechste Aufruf trifft das Gesamtbudget — die Versicherung dagegen, dass ein kaputter Anbieter den ganzen Turn verheizt.',
    prompt: LOOP_PROMPT,
    backendFailures: 5,
    streams: [
      {
        calls: [
          { tool: 'gruenerator_search', args: { query: 'Windkraft Ausbau' } },
          { tool: 'gruenerator_search', args: { query: 'Kindergrundsicherung Hoehe' } },
          { tool: 'web_search', args: { query: 'Mietendeckel aktuelle Lage' } },
          { tool: 'web_search', args: { query: 'Tempolimit Debatte heute' } },
          { tool: 'gruenerator_examples_search', args: { query: 'Buergergeld Reform' } },
          { tool: 'gruenerator_examples_search', args: { query: 'Kohleausstieg Datum' } },
        ],
      },
      { text: GERMAN_ANSWER },
    ],
    decisionCounts: [{ point: 'loop.tool_guard', chose: 'failure_budget', count: 1 }],
  },
  {
    id: 'loop-guard-nebenlaeufig',
    category: 'tool-guard',
    note: 'Drei Suchen in EINEM Modellschritt. Das Deckel liegt bei zwei gleichzeitigen, also wird genau eine zurueckgestellt — zurueckgestellt, nicht abgelehnt: der Aufruf darf danach unveraendert erneut laufen. Zugesichert wird die ANZAHL, nie welcher Aufruf verlor.',
    prompt: LOOP_PROMPT,
    streams: [
      {
        parallel: true,
        calls: [
          { tool: 'gruenerator_search', args: { query: 'Windkraft Ausbau' } },
          { tool: 'gruenerator_search', args: { query: 'Kindergrundsicherung Hoehe' } },
          { tool: 'gruenerator_search', args: { query: 'Mietendeckel Staedte' } },
        ],
      },
      { text: GERMAN_ANSWER },
    ],
    decisionCounts: [{ point: 'loop.tool_guard', chose: 'search_concurrency', count: 1 }],
  },
  // ── @-Erwähnung auf der Loop-Lane ────────────────────────────────────────
  // Das PAAR, das den Flip vom 16.08.2026 belegt. `@bundestag` lief bis dahin
  // als Einzeldurchlauf, weil `forcedTool` im Entscheider ein Loop-Notausschalter
  // war; jetzt trägt der Intent `forcedLane: 'loop'` und die Erwähnung kommt hier
  // an. Das Gegenstück daneben zeigt, dass der Notausschalter für alle anderen
  // Erwähnungen unverändert gilt — ohne es wäre nicht zu sehen, ob der Flip
  // gezielt war oder das Gate ganz aufgegangen ist.
  {
    id: 'mention-bundestag-loop',
    category: 'mention-lane',
    note: 'Keine Modellannahme: `@bundestag` zurrt den Intent deterministisch fest (forcedIntentStage), und `forcedLane: loop` entscheidet die Lane. Der DIP-Abruf ist gestubbt wie jedes andere Suchbackend — was hier zaehlt, ist dass das Domain-Werkzeug ueberhaupt montiert ist und laeuft.',
    prompt: 'Was liegt zum Heizungsgesetz vor?',
    body: { forcedTools: ['bundestag'] },
    streams: [
      { calls: [{ tool: 'bundestag', args: { query: 'Heizungsgesetz' } }] },
      { text: GERMAN_ANSWER },
    ],
    mustDecide: [{ point: 'router.run_agentic', chose: 'loop' }],
    firstToolChoice: 'bundestag',
  },
  // Der Degradierungsfall, den Phase N erst nötig gemacht hat: die dünne
  // Einzeldurchlauf-Tür der Parlaments-Abrufe ist gefallen, der Kern hängt nur
  // noch am Loop-Werkzeug. Mit ausgeschalteter Schleife MUSS der Turn also
  // umgeleitet werden — vorher lief er in den `case`-Zweig, jetzt liefe er ohne
  // Umleitung in `default: log.warn` und der Turn täte still nichts.
  {
    id: 'mention-bundestag-degradiert',
    category: 'mention-lane',
    note: 'Keine Modellannahme: `@bundestag` zurrt den Intent deterministisch fest, und mit `CHAT_AGENT_LOOP=false` haelt das Gate ihn draussen. Was hier zaehlt, ist die Umleitung auf `web` aus der Registry (`degradeTo`) — nicht welches Suchbackend danach antwortet, das ist gestubbt wie ueberall.',
    prompt: 'Was liegt zum Heizungsgesetz vor?',
    body: { forcedTools: ['bundestag'] },
    env: { CHAT_AGENT_LOOP: 'false' },
    streams: [],
    mustDecide: [
      { point: 'router.run_agentic', chose: 'single_pass' },
      { point: 'router.intent_override', chose: 'loop_only_degraded' },
    ],
  },
  {
    id: 'mention-dokumente-einzeln',
    category: 'mention-lane',
    note: 'Gegenstueck: `@dokumente` (Intent `search`) traegt `forcedLane: single-pass`, der Notausschalter greift also weiter. Beweist, dass der Flip die beiden Quellen meint und nicht das Gate allgemein geoeffnet hat.',
    prompt: 'Was liegt zum Heizungsgesetz vor?',
    body: { forcedTools: ['search'] },
    streams: [],
    mustDecide: [{ point: 'router.run_agentic', chose: 'single_pass' }],
  },
  {
    id: 'mention-umfragen-loop',
    category: 'mention-lane',
    note: 'Keine Modellannahme: `@umfragen` traegt keinen Intent mehr (er ist stillgelegt), sondern zurrt ueber die Registry das WERKZEUG fest. Der Turn laeuft deshalb als `agentic` — und dass er ueberhaupt in die Schleife kommt, entscheidet allein der Pin. Der PolitPro-Abruf ist gestubbt wie jedes andere Suchbackend.',
    prompt: 'Wie stehen die Gruenen aktuell in Umfragen?',
    body: { forcedTools: ['umfragen'] },
    streams: [{ calls: [{ tool: 'umfragen', args: { topic: '' } }] }, { text: GERMAN_ANSWER }],
    mustDecide: [{ point: 'router.run_agentic', chose: 'loop' }],
    // Der benannte erste Aufruf, den `agentic` allein nicht mehr hergaebe: kein
    // Werkzeug heisst `agentic`, und aus NAMED_RETRIEVAL_INTENTS ist es
    // ausgenommen. Nur der Pin traegt das hier.
    firstToolChoice: 'umfragen',
    // Der Auffang, den der Pin verhindert: ohne ihn faellt `agentic` auf
    // `search` — eine Dokumentensuche statt PolitPro.
    notReached: ['router.intent_override'],
  },
  {
    id: 'mention-pressemitteilungen-loop',
    category: 'mention-lane',
    note: 'Keine Modellannahme: dieselbe Bauform wie `@umfragen`, plus die zweite Haelfte von Phase L — die Erwaehnung zurrt nicht nur das WERKZEUG fest, sie laedt auch das REZEPT `presse` (`activatesSkill`). Der stillgelegte Intent trug die Textsorte nie; `respondNode` gab ihm die generische SEARCH_GUIDANCE. Der PM-Abruf ist gestubbt wie jedes andere Suchbackend.',
    prompt: 'Schreib eine PM zum Heizungsgesetz.',
    body: { forcedTools: ['pressemitteilung_examples'] },
    streams: [
      {
        calls: [
          { tool: 'gruenerator_pressemitteilung_examples', args: { query: 'Heizungsgesetz' } },
        ],
      },
      { text: GERMAN_ANSWER },
    ],
    mustDecide: [{ point: 'router.run_agentic', chose: 'loop' }],
    // Wie bei `@umfragen`: `agentic` allein gaebe den benannten ersten Aufruf
    // nicht her. Dass hier der PM- und nicht der Social-Beispiel-Abruf steht,
    // ist der ganze Unterschied, den der Pin traegt.
    firstToolChoice: 'gruenerator_pressemitteilung_examples',
    // Die zweite Haelfte: das Rezept `presse` steht im Systemtext des Loops.
    // `buildSystemMessage` ueberschreibt den Block mit dem Titel des Rezepts —
    // ohne `activatesSkill` faende der Turn hier gar keins.
    systemIncludes: '## AKTIVE PLATTFORM: Pressemitteilung',
    notReached: ['router.intent_override'],
  },
  {
    id: 'mention-doku-loop',
    category: 'mention-lane',
    note: 'Keine Modellannahme: `@doku` zurrt jetzt das Doku-Werkzeug fest. Der Intent `hilfe` BLEIBT (Tier 2.9 erzeugt ihn aus Prosa und haelt Anleitungsfragen von den Erzeugungs-Verdikten fern) — was die Erwaehnung dazugewinnt, ist der BENANNTE erste Aufruf: der Doku-Index ist ohnehin breit montiert, der Intent trug also nur die Schleife, und welches Werkzeug in ihr laufen soll, sagte niemand. Der Wortlaut faellt ABSICHTLICH durch `looksLikeDocsHelpQuestion` — so traegt allein die Erwaehnung den Turn, und die Seitenkarte im Systemtext beweist den Pin statt das Gitter.',
    prompt: 'Ich komme mit den Notizbuechern nicht weiter.',
    body: { forcedTools: ['hilfe'] },
    streams: [
      { calls: [{ tool: 'gruenerator_docs_search', args: { query: 'Notizbuch anlegen' } }] },
      { text: GERMAN_ANSWER },
    ],
    mustDecide: [{ point: 'router.run_agentic', chose: 'loop' }],
    firstToolChoice: 'gruenerator_docs_search',
    // Die Seitenkarte haengt seit diesem PR am PIN statt am Intent. Sie ist kein
    // Rezepttext — nur ihre Aktivierungsbedingung hat gewechselt.
    systemIncludes: '## GRÜNERATOR-DOKUMENTATION',
  },
  {
    id: 'anhang-zusammenfassung-loop',
    category: 'mention-lane',
    note: 'Keine Modellannahme: der Turn haengt an zwei Gittern, die beide ohne das Modell entscheiden. Ein Dokument am Turn (`documentChatIds`) plus eine Zusammenfassungs-Bitte zwingen den ersten Aufruf auf `summarize` — das ist der achte Weg in `shouldForceFirstToolCall` und der zweite Grund in `pinnedFirstTool`. Gemessener Ausfall am 23.08.2026: dasselbe Prompt, ein vektorisiertes 21.785-Zeichen-PDF, und der Planer rief `media`/`find_content` und fasste ein fremdes Konto-Dokument zusammen. Das Skript gibt dem Planer NUR den `summarize`-Aufruf; griffe er daneben, bliebe ein Stream unverbraucht und der Lauf faellt.',
    prompt: 'fasse das pdf zusammen',
    body: { documentChatIds: ['doc-1'] },
    streams: [{ calls: [{ tool: 'summarize', args: {} }] }, { text: GERMAN_ANSWER }],
    mustDecide: [{ point: 'router.run_agentic', chose: 'loop' }],
    firstToolChoice: 'summarize',
  },
];
