/**
 * Die Dispositions-Achse gegen die Mengen, die dieselbe Partition beschreiben.
 *
 * Zwei sind ABGELEITET: `NO_RETRIEVAL_VERDICTS` (die `prose`-Gruppe) und
 * `GROUNDABLE_PROSE_INTENTS` (`prose` ohne `greeting`) — für sie prüft dieser
 * Test nur, dass die Ableitung das Erwartete ergibt. Die zweite hat drei
 * Konsumenten abgelöst, die dieselben zwei Ids je als Literal führten:
 * `NO_TOOL_VERDICTS` (routing), `CITATION_GATED_INTENTS` (respondNode) und
 * `CARRY_ELIGIBLE_INTENTS` (intentExecutionService).
 *
 * Interessanter sind die, die bewusst NICHT abgeleitet werden:
 * `AGENTIC_INTENTS` beantwortet eine andere Frage („wo läuft der Turn?") als die
 * Disposition („was muss vorher feststehen?"), und der Unterschied zwischen
 * beiden ist eine inhaltliche Aussage. Sie hier auszubuchstabieren macht aus
 * einer stillen Divergenz eine, die man beim Ändern sieht: wer einen Intent
 * verschiebt, muss diese Liste anfassen und dabei begründen, warum.
 *
 * Genau diese Bauform fehlte, als `NO_TOOL_VERDICTS` `greeting` verlor, ohne
 * dass es jemandem auffiel.
 */
import { describe, expect, it } from 'vitest';

import {
  DISPOSITION_BY_INTENT,
  dispositionOf,
  intentsWithDisposition,
  GROUNDABLE_PROSE_INTENTS,
  isGroundableProse,
  type ChatIntentId,
} from '@gruenerator/shared/chat-intents';

import { AGENTIC_INTENTS } from '../../../../routes/chat/services/agenticLoop/intents.js';
import {
  decideRunAgentic,
  type AgenticDecisionInput,
} from '../../../../routes/chat/services/agenticLoop/routing.js';
import { SYSTEM_TOOL_INTENTS } from '../../../../services/mcp/connectorAdapters.js';
import {
  DEMOTABLE_HEURISTIC_INTENTS,
  NON_SEARCH_INTENTS,
  NO_RETRIEVAL_VERDICTS,
} from './classifierSignals.js';

const sorted = (s: Iterable<string>): string[] => [...s].sort();

/**
 * Eine Sachfrage, damit nur der Intent den Unterschied macht.
 *
 * Vollständig statt sparsam, und `satisfies` statt `as const`: die Fixture
 * führte nach der Trennung von `mustLoop`/`forcedLoop` noch das abgelöste
 * `isMcpTurn` mit sich und blieb trotzdem grün, weil ein fehlendes Feld
 * `undefined` und damit falsch ist. `*.vitest.ts` steht ausserhalb des
 * Typecheck-Scopes (`apps/api/tsconfig.json`), also fällt so eine Drift sonst
 * nirgends auf — die Annotation ist hier das einzige Prüfmittel.
 */
const BASE = {
  intent: 'produktion',
  lastUserText: 'Wie hat Robert Habeck abgestimmt?',
  agenticIntents: AGENTIC_INTENTS,
  loopEnabled: true,
  forcedTool: false,
  mustLoop: false,
  forcedLoop: false,
  isCompound: false,
  hasSelectedNotebook: false,
  secondaryIntent: null,
  compoundGeneration: false,
  isPdfFillRequest: false,
  hasImageAttachments: false,
} satisfies AgenticDecisionInput;

describe('die Achse selbst', () => {
  it('ordnet jedem Intent genau eine Disposition zu', () => {
    // Der Compiler erzwingt die Totalität schon (`Record<ChatIntentId, …>`);
    // was er nicht sieht, ist ein Tippfehler im WERT, der zu einem gültigen
    // anderen Wert wird. Sechs Gruppen, keine leere — `retired` ist die
    // Abwesenheit eines Orts im Ablauf, nicht einer.
    const groups = new Set(Object.values(DISPOSITION_BY_INTENT));
    expect(sorted(groups)).toEqual(['anchor', 'artifact', 'gated', 'loop', 'prose', 'retired']);
    for (const d of groups) {
      expect(intentsWithDisposition(d).size).toBeGreaterThan(0);
    }
  });

  it('kennt keinen Intent ausserhalb der Registry', () => {
    expect(dispositionOf('gibt-es-nicht')).toBeNull();
  });
});

describe('abgeleitete Mengen', () => {
  it('NO_RETRIEVAL_VERDICTS ist die prose-Gruppe', () => {
    expect(sorted(NO_RETRIEVAL_VERDICTS)).toEqual(['direct', 'greeting', 'produktion']);
  });

  it('GROUNDABLE_PROSE_INTENTS ist prose OHNE greeting', () => {
    // Der Ausschluss IST der Inhalt der Menge. Ginge er verloren, würde ein
    // Gruss wieder erbfähig: er dürfte die Loop-Rettungen anfassen, Zitate
    // zeigen und den Quellenblock eines früheren Turns übernehmen — drei
    // Wirkungen, die vor diesem Schnitt an drei Literalen hingen und einzeln
    // hätten wegdriften können.
    expect(sorted(GROUNDABLE_PROSE_INTENTS)).toEqual(['direct', 'produktion']);
    expect(sorted(intentsWithDisposition('prose'))).toEqual(
      sorted([...GROUNDABLE_PROSE_INTENTS, 'greeting'])
    );
    expect(isGroundableProse('greeting')).toBe(false);
    // Nimmt ein unverengtes `string` an — das ist der Zweck des Prädikats.
    expect(isGroundableProse('gibt-es-nicht')).toBe(false);
  });

  it('NO_TOOL_VERDICTS ist es NICHT — greeting fehlt mit Absicht', () => {
    // Beinahe dieselbe Menge, andere Frage. Die Disposition sagt „ein Gruss
    // braucht kein Werkzeug"; `NO_TOOL_VERDICTS` sagt „diese Verdikte dürfen die
    // drei Rettungen in decideRunAgentic anfassen". Seit #2269 ist `greeting`
    // dort ausgenommen, damit keine Formulierung einen Gruss in den Loop ziehen
    // kann — eine strukturelle Garantie, die eine Ableitung aufgäbe.
    expect(decideRunAgentic({ ...BASE, intent: 'greeting' })).toBe(false);
    expect(decideRunAgentic({ ...BASE, intent: 'produktion' })).toBe(true);
  });
});

describe('AGENTIC_INTENTS — halb abgeleitet, halb Aussage', () => {
  it('enthält jede loop-Disposition — seit dem Schnitt per Konstruktion', () => {
    // Die eine Richtung, die gelten MUSS: ein Intent, dessen Werkzeugwahl der
    // Planer trifft, muss den Planer auch erreichen. Ein loop-Intent, der hier
    // fehlte, würde ohne jede Recherche beantwortet — der Fehler, den die
    // Degrade-Versicherung in `decideRunAgentic` schon einmal auffangen musste.
    //
    // Diese Zusicherung war eine handgepflegte Liste gegen eine Ableitung; jetzt
    // ist sie die Ableitung selbst und kann nicht mehr brechen. Der Test bleibt
    // trotzdem stehen: er ist der Ort, an dem jemand liest, WARUM die Richtung
    // gilt — und er wird wieder scharf, sobald jemand die Aufzählung zurückholt.
    for (const id of intentsWithDisposition('loop')) {
      expect(AGENTIC_INTENTS.has(id), `loop-Intent ${id} fehlt in AGENTIC_INTENTS`).toBe(true);
    }
  });

  it('und darüber hinaus genau diese vier', () => {
    // Die andere Richtung gilt NICHT, und das ist der Punkt der Trennung: diese
    // vier laufen IM Loop, aber ihr Verdikt muss vorher feststehen, weil es
    // steuert, was dort montiert wird (`hilfe`/`summary`), weil es Geld kostet
    // (`image`) oder weil der Prompt den Rechenauftrag benennt (`compute`, das
    // Werkzeug `rechnen`). Wer die Liste ändert, ändert eine Aussage. `mcp`
    // stand hier und ist stillgelegt (#4043) — den Konnektor trägt der Scope
    // an `agentic`.
    const extras = [...AGENTIC_INTENTS].filter((id: ChatIntentId) => dispositionOf(id) !== 'loop');
    expect(sorted(extras)).toEqual(['compute', 'hilfe', 'image', 'summary']);
  });
});

describe('DEMOTABLE_HEURISTIC_INTENTS — loop MINUS drei, und jede Ausnahme sagt etwas', () => {
  it('ist eine echte Teilmenge der loop-Disposition', () => {
    // Demotion tauscht das Verdikt gegen `agentic`. Etwas zu demotieren, dessen
    // Werkzeugwahl NICHT der Planer trifft, hiesse seine Ausführung wegzuwerfen.
    for (const id of DEMOTABLE_HEURISTIC_INTENTS) {
      expect(dispositionOf(id), `${id} ist nicht loop`).toBe('loop');
    }
  });

  it('lässt genau research, chat_history und agentic aus', () => {
    // Der Rest der Aussage — und der Grund, warum diese Menge NICHT abgeleitet
    // wird. Jede der beiden Ausnahmen hat ihren eigenen Grund:
    //  - `research` behält seinen Namen bis ins Residual und damit den Zwang
    //    aus NAMED_RETRIEVAL_INTENTS.
    //  - `agentic` IST das Ziel der Demotion.
    //
    // `umfragen` war die dritte, mit der Begründung „sein Verdikt montiert das
    // Werkzeug". Die trug schon vorher nicht (der Katalog montiert es breit,
    // `toolCatalog.ts`) und ist mit der Stilllegung des Intents gegenstandslos:
    // er hat keine `loop`-Disposition mehr, die Menge kann ihn gar nicht mehr
    // auslassen. In SYSTEM_TOOL_INTENTS steht er weiterhin — als tolerantes
    // Weiterlesen eines aus einem alten Thread zurückgereichten Verdikts.
    //
    // Umgekehrt bei `pressemitteilung_examples`: der stand MIT in der Menge und
    // ist mit derselben Stilllegung herausgefallen. Beide Male ändert sich die
    // Mitgliedschaft, ohne dass jemand die Menge angefasst hätte — genau das
    // prüft der erste Test oben.
    const notDemotable = [...intentsWithDisposition('loop')].filter(
      (id) => !DEMOTABLE_HEURISTIC_INTENTS.has(id)
    );
    // `chat_history` (seit 11/2026 `loop`, #5456) aus demselben Grund wie
    // `research`: sein Name trägt den erzwungenen ersten Aufruf `search_threads`.
    expect(sorted(notDemotable)).toEqual(['agentic', 'chat_history', 'research']);
    expect(dispositionOf('umfragen')).toBe('retired');
    expect(SYSTEM_TOOL_INTENTS.has('umfragen')).toBe(true);
    // Derselbe Weg für den Dauerauftrag (09/2026): das Werkzeug heißt
    // `recurring_tasks`, der Pin kommt aus Tier 3.4 statt aus einer Erwähnung.
    expect(dispositionOf('create_recurring_task')).toBe('retired');
  });
});

describe('NON_SEARCH_INTENTS — Politik des Heuristik-Tisches, keine Disposition', () => {
  it('deckt sich mit keiner Vereinigung von Dispositionen', () => {
    // Die Messung, die den Kopfkommentar der Menge trägt: `prose` und
    // `artifact` ganz, `anchor` und `gated` je zur Hälfte, dazu ein einzelnes
    // `umfragen` — seit Phase L aus `retired`. Wer daraus eine Ableitung will, ändert
    // Verhalten — der Test sagt, wieviel.
    //
    // Dass `artifact` vollständig drinsteht und `gated` bis auf drei, hat einen
    // Grund: der Mehr-Themen-Abschlag gilt nur für Abrufe, und `social_post` wie
    // `summary` sind keine.
    const missing = (d: Parameters<typeof intentsWithDisposition>[0]) =>
      sorted([...intentsWithDisposition(d)].filter((id) => !NON_SEARCH_INTENTS.has(id)));

    expect(missing('prose')).toEqual([]);
    expect(missing('artifact')).toEqual([]);
    expect(missing('anchor')).toEqual(['edit_current_board', 'edit_current_doc', 'edit_sheet']);
    expect(missing('gated')).toEqual(['hilfe', 'scrape_url']);
  });

  it('trägt keinen Intent, den es nicht gibt', () => {
    // Der eigentliche Gewinn der Typisierung: die 19 Literale standen als
    // `Set<string>`, ein Tippfehler wäre nie Mitglied geworden und hätte
    // stillschweigend die Suchanfrage optimiert.
    for (const id of NON_SEARCH_INTENTS) {
      expect(dispositionOf(id), `${id} steht nicht in der Registry`).not.toBeNull();
    }
  });
});
