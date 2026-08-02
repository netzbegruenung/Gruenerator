/**
 * Die Dispositions-Achse gegen die Mengen, die dieselbe Partition beschreiben.
 *
 * Zwei sind seit diesem Schnitt ABGELEITET (`NO_RETRIEVAL_VERDICTS`,
 * `NO_TOOL_VERDICTS`) — für sie prüft dieser Test nur, dass die Ableitung das
 * Erwartete ergibt. Interessanter sind die, die bewusst NICHT abgeleitet werden:
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
  type ChatIntentId,
} from '@gruenerator/shared/chat-intents';

import {
  AGENTIC_INTENTS,
  NAMED_RETRIEVAL_INTENTS,
} from '../../../../routes/chat/services/agenticLoop/agenticRespondService.js';
import { decideRunAgentic } from '../../../../routes/chat/services/agenticLoop/routing.js';
import { NO_RETRIEVAL_VERDICTS } from './classifierSignals.js';

const sorted = (s: Iterable<string>): string[] => [...s].sort();

/** Eine Sachfrage, damit nur der Intent den Unterschied macht. */
const BASE = {
  intent: 'produktion',
  lastUserText: 'Wie hat Robert Habeck abgestimmt?',
  agenticIntents: AGENTIC_INTENTS,
  loopEnabled: true,
  isCompound: false,
  hasSelectedNotebook: false,
  isMcpTurn: false,
  hasImageAttachments: false,
} as const;

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

describe('bewusst NICHT abgeleitet', () => {
  it('AGENTIC_INTENTS enthält jede loop-Disposition', () => {
    // Die eine Richtung, die gelten MUSS: ein Intent, dessen Werkzeugwahl der
    // Planer trifft, muss den Planer auch erreichen. Ein loop-Intent, der hier
    // fehlt, würde ohne jede Recherche beantwortet — der Fehler, den die
    // Degrade-Versicherung in `decideRunAgentic` schon einmal auffangen musste.
    for (const id of intentsWithDisposition('loop')) {
      expect(AGENTIC_INTENTS.has(id), `loop-Intent ${id} fehlt in AGENTIC_INTENTS`).toBe(true);
    }
  });

  it('und darüber hinaus genau diese vier', () => {
    // Die andere Richtung gilt NICHT, und das ist der Punkt der Trennung: diese
    // vier laufen IM Loop, aber ihr Verdikt muss vorher feststehen, weil es
    // steuert, was dort montiert wird (`hilfe`/`summary`/`mcp`) bzw. weil es
    // Geld kostet (`image`). Wer die Liste ändert, ändert eine Aussage.
    const extras = [...AGENTIC_INTENTS].filter((id: ChatIntentId) => dispositionOf(id) !== 'loop');
    expect(sorted(extras)).toEqual(['hilfe', 'image', 'mcp', 'summary']);
  });
});

describe('NAMED_RETRIEVAL_INTENTS — der vierte Zwang zum Werkzeugaufruf', () => {
  it('ist die loop-Gruppe ohne den Auffangwert', () => {
    // Die Ableitung ist die ganze Aussage: „loop" heisst, der Planer wählt die
    // Werkzeuge — aber `agentic` ist der AUFFANGWERT dieser Gruppe. Ihn
    // mitzuzwingen hiesse, jede unklare Frage zu einem Werkzeugaufruf zu
    // verpflichten; für die aus einem Recherche-Verdikt demotierten Turns gibt
    // es `loopDemotedFromRetrieval`, das die Herkunft festhält.
    expect(NAMED_RETRIEVAL_INTENTS.has('agentic')).toBe(false);
    expect(sorted(NAMED_RETRIEVAL_INTENTS)).toEqual(
      sorted([...intentsWithDisposition('loop')].filter((id) => id !== 'agentic'))
    );
  });

  it('enthält jedes Verdikt, das ohne Abruf sinnlos wäre', () => {
    // Live gemessen, bevor es diese Menge gab: „Wie komme ich am Montag früh von
    // Wien nach Graz?" wurde auf `web` degradiert und dann mit steps=0,
    // sources=0 aus dem Modellgedächtnis beantwortet — samt einer erfundenen
    // Aussage über den Nutzer.
    // `news` stand hier und ist raus: als verwalteter Connector ist es kein
    // Verdikt mehr, das man erzwingen könnte. Der zitierte Live-Fall (eine
    // Fahrplanfrage, aus dem Modellgedächtnis beantwortet) wird jetzt eine Stufe
    // früher verhindert — der Trigger montiert die Quelle, statt dass ein
    // Verdikt einen Abruf erzwingen muss.
    for (const id of ['web', 'search', 'research', 'compare', 'bundestag'] as const) {
      expect(NAMED_RETRIEVAL_INTENTS.has(id), `${id} müsste einen Abruf erzwingen`).toBe(true);
    }
  });

  it('zwingt nichts, was gar nicht im Loop landet', () => {
    // Ein Zwang auf einem Intent, der den Planer nie erreicht, wäre tot — und
    // tote Bedingungen sind genau die, die beim nächsten Umbau falsch gelesen
    // werden.
    for (const id of NAMED_RETRIEVAL_INTENTS) {
      expect(AGENTIC_INTENTS.has(id as ChatIntentId), `${id} fehlt in AGENTIC_INTENTS`).toBe(true);
    }
  });
});
