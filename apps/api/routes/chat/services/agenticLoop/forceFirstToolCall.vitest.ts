import {
  allIntentMentions,
  pinnedToolForMention,
  CHAT_INTENTS,
} from '@gruenerator/shared/chat-intents';
import { describe, it, expect } from 'vitest';

import { pinnedFirstTool, shouldForceFirstToolCall } from './forceFirstToolCall.js';

const base = {
  researchBanned: false,
  intent: 'agentic' as string | null,
  hasMcpScope: false,
  isMcpCapabilityQuestion: false,
  mcpToolCount: 0,
  lastUserText: 'Erstelle die Tabelle.',
  loopDemotedFromRetrieval: false,
  classifierContradictedResearch: false,
  materialHeavy: false,
  pinnedTool: null as string | null,
};

const force = (over: Partial<typeof base> = {}) => shouldForceFirstToolCall({ ...base, ...over });

describe('shouldForceFirstToolCall', () => {
  it('erzwingt nichts, wenn kein Weg zutrifft', () => {
    expect(force()).toBe(false);
  });

  /**
   * Die Klasse „antwortet aus dem Gedächtnis" — festgehalten, nicht repariert.
   *
   * In den Abnahmeläufen vom 19.08.2026 rissen vier Szenarien wiederholt an
   * `grounded` (`ground-verbrenner-premise`, `false-premise-1`,
   * `adv-tempo30-not-compute`, `adv-imperative-vs-question-2`) — mal rot, mal
   * grün, was wie Streuung aussah. Das Gitter davor ist aber vollständig
   * deterministisch:
   *
   *   1. Die Heuristik gibt ein PROSA-Verdikt (`direct`) — kein Abruf-Verdikt.
   *   2. `looksLikeToolableQuestion` erkennt trotzdem eine echte Frage, der
   *      Turn wird nach `agentic` demotiert (Tier 3.5).
   *   3. `loopDemotedFromRetrieval` bleibt dabei FALSE — die Flagge trägt
   *      `DEMOTABLE_HEURISTIC_INTENTS.has('direct')`, und `direct` steht dort
   *      nicht (classifierNode.ts, Tier 3.5).
   *   4. `agentic` ist aus `NAMED_RETRIEVAL_INTENTS` ausgenommen — es IST der
   *      Auffangwert.
   *
   * ⇒ kein Weg feuert, `toolChoice` bleibt offen, und OB gesucht wird,
   * entscheidet allein der Planer. Die Streuung sitzt also nicht im Gitter,
   * sondern dahinter: das Gitter ist eindeutig, es überlässt die Wahl nur dem
   * Modell.
   *
   * Das ist bewusst so — der Kommentar am `loopDemotedFromRetrieval`-Zweig
   * sagt ausdrücklich, ein `direct`, das bloss werkzeugfähig aussah, setze die
   * Flagge nicht. Dieser Test hält den Stand fest, damit eine spätere Änderung
   * daran sichtbar wird, statt als Eval-Streuung durchzugehen.
   */
  describe('demotiertes Prosa-Verdikt: das Gitter erzwingt nichts', () => {
    const demotedFromProse = {
      intent: 'agentic',
      loopDemotedFromRetrieval: false,
      classifierContradictedResearch: false,
    };

    it.each([
      ['Warum haben die Grünen das Verbrenner-Aus ab 2035 abgelehnt?'],
      ['Was bringt Tempo 30 in der Innenstadt für die Verkehrssicherheit?'],
      ['Zeig mir die wichtigsten Argumente für ein Tempolimit'],
    ])('%s', (lastUserText) => {
      expect(force({ ...demotedFromProse, lastUserText })).toBe(false);
    });

    it('ein Abruf-VERDIKT vor der Demotion erzwingt dagegen sehr wohl', () => {
      // Der Unterschied zur Klasse oben, an einer Stelle: die Heuristik hat
      // `abgeordnetenwatch` benannt (in DEMOTABLE_HEURISTIC_INTENTS), also
      // setzt Tier 3.5 die Flagge. `followup-bundestag-scope` läuft hier
      // durch — sein Ausfall liegt hinter diesem Gitter, nicht in ihm.
      expect(
        force({
          intent: 'agentic',
          loopDemotedFromRetrieval: true,
          lastUserText: 'Wie hat die SPD zum Heizungsgesetz abgestimmt?',
        })
      ).toBe(true);
    });
  });

  describe('der Recherche-Bann sticht alles', () => {
    it.each([
      ['Demotion aus einem Abruf-Verdikt', { loopDemotedFromRetrieval: true }],
      ['ausdrücklicher Rechercheauftrag', { lastUserText: 'Recherchiere das bitte.' }],
      ['benannter Abruf-Intent', { intent: 'web' }],
      ['Selbstwiderspruch der LLM-Stufe', { classifierContradictedResearch: true }],
      ['ein per Erwähnung gepinntes Werkzeug', { pinnedTool: 'umfragen' }],
    ])('%s', (_name, over) => {
      expect(force(over)).toBe(true);
      expect(force({ ...over, researchBanned: true })).toBe(false);
    });
  });

  describe('MCP mit gesetztem Scope', () => {
    const mcp = { intent: 'mcp', hasMcpScope: true, mcpToolCount: 3 };

    it('erzwingt den Aufruf', () => {
      expect(force(mcp)).toBe(true);
    });

    it('nicht bei einer Fähigkeitsfrage — die beschreibt nur', () => {
      expect(force({ ...mcp, isMcpCapabilityQuestion: true })).toBe(false);
    });

    it('nicht ohne gemountete Werkzeuge', () => {
      expect(force({ ...mcp, mcpToolCount: 0 })).toBe(false);
    });

    it('nicht ohne Scope', () => {
      expect(force({ ...mcp, hasMcpScope: false })).toBe(false);
    });
  });

  describe('eigenes Material entzieht der Demotion den Zwang', () => {
    it('demotierter Abruf-Turn OHNE eigenes Material sucht', () => {
      expect(force({ loopDemotedFromRetrieval: true })).toBe(true);
    });

    it('derselbe Turn MIT eigenem Material sucht nicht', () => {
      // Turn 4 vom 13.08.2026: die Prüfliste wurde als `web@0.35` demotiert und
      // suchte den Artikel im Netz, der im Kontext stand.
      expect(force({ loopDemotedFromRetrieval: true, materialHeavy: true })).toBe(false);
    });

    it('ein ausdrücklicher Auftrag sticht das eigene Material', () => {
      // „Recherchiere ergänzend dazu" zu einem angehängten Dokument bleibt
      // möglich — nur der stille Zwang aus der Demotion fällt weg.
      expect(
        force({
          loopDemotedFromRetrieval: true,
          materialHeavy: true,
          lastUserText: 'Recherchiere ergänzend dazu.',
        })
      ).toBe(true);
    });

    it('ein ausdrücklich benannter Abruf-Intent ebenso', () => {
      expect(force({ intent: 'web', materialHeavy: true })).toBe(true);
    });

    it('und der Selbstwiderspruch der LLM-Stufe ebenso', () => {
      expect(force({ classifierContradictedResearch: true, materialHeavy: true })).toBe(true);
    });
  });

  describe('der Werkzeug-Pin trägt ohne Intent', () => {
    // Der Punkt der ganzen Entkopplung: `@umfragen` läuft seit der Stilllegung
    // als `agentic`, und `agentic` ist aus NAMED_RETRIEVAL_INTENTS ausgenommen.
    // Ohne den Pin-Zweig hätte diese Erwähnung ihren Werkzeugzwang verloren.
    it('erzwingt den Aufruf für einen `agentic`-Turn mit gepinntem Werkzeug', () => {
      expect(force({ intent: 'agentic', pinnedTool: 'umfragen' })).toBe(true);
      expect(force({ intent: 'agentic', pinnedTool: null })).toBe(false);
    });

    it('sticht auch eigenes Material — der Pin ist eine ausdrückliche Wahl', () => {
      expect(force({ intent: 'agentic', pinnedTool: 'umfragen', materialHeavy: true })).toBe(true);
    });
  });
});

describe('pinnedFirstTool', () => {
  /** Die Werkzeuge, die `buildChatToolCatalog` im Loop tatsächlich montiert —
   *  soweit sie hier zählen. `hilfe` steht bewusst NICHT darin: sein Werkzeug
   *  heisst `gruenerator_docs_search`. */
  const MOUNTED = new Set([
    'bundestag',
    'abgeordnetenwatch',
    'umfragen',
    'gruenerator_docs_search',
  ]);
  const isMounted = (name: string) => MOUNTED.has(name);

  it('nennt das Werkzeug, das die Erwähnung festgezurrt hat', () => {
    expect(pinnedFirstTool({ pinnedTool: 'umfragen', isMounted })).toBe('umfragen');
  });

  it('schweigt ohne Erwähnung — ein Klassifikator-Verdikt ist keine Wahl', () => {
    expect(pinnedFirstTool({ pinnedTool: null, isMounted })).toBe(null);
  });

  // Die Locale-Gitter in `buildChatToolCatalog` lassen die beiden DE-only-
  // Werkzeuge für de-AT weg. Ein Zwang auf ein nicht montiertes Werkzeug bräche
  // den Aufruf — hier bleibt es bei `required`.
  it('schweigt, wenn das Werkzeug für diesen Turn gar nicht montiert ist', () => {
    expect(pinnedFirstTool({ pinnedTool: 'bundestag', isMounted: () => false })).toBe(null);
  });
});

describe('die Registry entscheidet, welche Erwähnung ein Werkzeug pinnt', () => {
  // Der Pin ersetzt die frühere Regel „das Werkzeug heisst wie der Intent". Der
  // Test hängt deshalb an der Registry und nicht an einer zweiten Liste hier:
  // wer `pinsTool` setzt oder wegnimmt, ändert eine Aussage über den Loop.
  it('fünf Erwähnungen pinnen ein Werkzeug — und nur die', () => {
    const pinned = allIntentMentions()
      .filter(({ mention }) => mention.pinsTool != null)
      .map(({ mention }) => mention.pinsTool)
      .sort();
    expect(pinned).toEqual([
      'abgeordnetenwatch',
      'bundestag',
      'gruenerator_docs_search',
      'gruenerator_pressemitteilung_examples',
      'umfragen',
    ]);
  });

  it('`@umfragen` pinnt sein Werkzeug, obwohl sein Intent stillgelegt ist', () => {
    expect(pinnedToolForMention('umfragen')).toBe('umfragen');
    expect(CHAT_INTENTS.umfragen.availability).toBe('retired');
  });

  // `@doku` stand hier, bis gemessen war, dass der Intent nur die Schleife trug
  // und den Aufruf niemand benannte — der Doku-Index ist ohnehin breit montiert.
  // `@dokumente` ist die Dokumentensuche des Einzeldurchlaufs, `@notion` ein
  // ganzer Server: die meinen wirklich kein EINZELNES Werkzeug.
  it('schweigt, wo eine Erwähnung kein einzelnes Werkzeug meint', () => {
    expect(pinnedToolForMention('search')).toBe(null);
    expect(pinnedToolForMention('examples')).toBe(null);
  });

  it('`@doku` pinnt den Doku-Index', () => {
    expect(pinnedToolForMention('hilfe')).toBe('gruenerator_docs_search');
  });
});
