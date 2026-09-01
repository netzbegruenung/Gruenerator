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
  priorTurnRetrieved: false,
  hasAttachedDocuments: false,
  summaryAsk: false,
  attachedSeedDelivered: false,
};

const force = (over: Partial<typeof base> = {}) => shouldForceFirstToolCall({ ...base, ...over });

describe('shouldForceFirstToolCall', () => {
  it('erzwingt nichts, wenn kein Weg zutrifft', () => {
    expect(force()).toBe(false);
  });

  // Achter Weg. Der gemessene Ausfall (23.08.2026): ein 21.785-Zeichen-PDF war
  // vektorisiert, `attachmentContext` genullt, und der Planer beantwortete
  // „fasse das pdf zusammen" aus `media`/`find_content` — mit einem fremden
  // Konto-Dokument. Beide Bedingungen zusammen, nicht einzeln.
  it('erzwingt einen Aufruf, wenn ein angehängtes Dokument zusammengefasst werden soll', () => {
    expect(force({ hasAttachedDocuments: true, summaryAsk: true })).toBe(true);
  });

  it('erzwingt nichts bei einer Zusammenfassung OHNE angehängtes Dokument', () => {
    expect(force({ hasAttachedDocuments: false, summaryAsk: true })).toBe(false);
  });

  it('erzwingt nichts bei einem Dokument ohne Zusammenfassungs-Bitte', () => {
    expect(force({ hasAttachedDocuments: true, summaryAsk: false })).toBe(false);
  });

  // Der Bann vetoed alles — auch diesen Weg. „ohne neue Recherche" heisst nicht
  // „stattdessen halt zusammenfassen".
  it('weicht dem Recherche-Bann, auch mit Dokument und Zusammenfassungs-Bitte', () => {
    expect(force({ researchBanned: true, hasAttachedDocuments: true, summaryAsk: true })).toBe(
      false
    );
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
      // setzt Tier 3.5 die Flagge. Das ist der ERSTE Turn von
      // `followup-bundestag-scope`; sein zweiter trägt die Flagge nicht und
      // hatte bis zum siebten Weg keinen Träger (siehe unten).
      expect(
        force({
          intent: 'agentic',
          loopDemotedFromRetrieval: true,
          lastUserText: 'Wie hat die SPD zum Heizungsgesetz abgestimmt?',
        })
      ).toBe(true);
    });
  });

  /**
   * Siebter Weg — die rückbezügliche Anschlussfrage nach einem Abruf-Turn.
   *
   * Die Eingaben sind gemessen, nicht angenommen: eine Zwei-Turn-Sonde auf
   * `classifierNode` (20.08.2026, echte Heuristik, Provider abgefangen) gab für
   * `followup-bundestag-scope`
   *
   *   t0 „Wie hat die SPD zum Heizungsgesetz abgestimmt?"
   *      → intent=agentic, loopDemotedFromRetrieval=true   (Demotions-Zweig)
   *   t1 „Und die FDP?"
   *      → intent=agentic, loopDemotedFromRetrieval=false  (bis hier: niemand)
   *
   * Damit ist die Streuung dieses Messpunkts erklärt, ohne den Planer-Host zu
   * bemühen: für t1 wurde `toolChoice: 'required'` nie gesetzt, die Werkzeugwahl
   * lag allein beim Modell.
   */
  describe('die rückbezügliche Anschlussfrage nach einem Abruf-Turn', () => {
    const followup = {
      intent: 'agentic',
      loopDemotedFromRetrieval: false,
      priorTurnRetrieved: true,
      lastUserText: 'Und die FDP?',
    };

    it('erzwingt den Aufruf', () => {
      expect(force(followup)).toBe(true);
    });

    it.each([['Und die FDP?'], ['Was ist mit Bayern?'], ['Und wie war das 2021?']])(
      '%s',
      (lastUserText) => {
        expect(force({ ...followup, lastUserText })).toBe(true);
      }
    );

    // Der Negativfall, der den Weg überhaupt so eng verankert: eine
    // Meta-Anweisung über die vorige ANTWORT ist ebenfalls kurz, ebenfalls
    // rückbezüglich und steht ebenfalls hinter einem Abruf-Turn. Sie ist in dem
    // Text gegründet, an dem sie arbeitet — ein erzwungener Abruf legte fremde
    // Recherche unter eine Kürzung.
    it.each([
      ['fasse das kürzer'],
      ['kürze das bitte'],
      ['nochmal auf englisch'],
      ['umformulieren bitte'],
    ])('„%s" nach einem Abruf-Turn erzwingt NICHTS', (lastUserText) => {
      expect(force({ ...followup, lastUserText })).toBe(false);
    });

    // Offener Rand, hier festgehalten statt still gelassen: die TRENNBARE Form
    // („formuliere das um") steht nicht in `REWRITE_TARGET_RE`, nur die
    // untrennbare („umformulieren"). Sie kommt damit bis hierher durch. Die
    // Regex zu weiten ist kein Nebenbei-Schritt — `rewritesSuppliedText`
    // entscheidet auch über die mitgeführten Quellen, und ihre heutige Form ist
    // über den 196-Turn-Korpus gemessen. Eigener Befund, eigene Messung.
    it('bekannte Lücke: die trennbare Umformulierungs-Form kommt durch', () => {
      expect(force({ ...followup, lastUserText: 'formuliere das um' })).toBe(true);
    });

    it('eine Höflichkeit erzwingt nichts', () => {
      expect(force({ ...followup, lastUserText: 'Danke!' })).toBe(false);
      expect(force({ ...followup, lastUserText: 'Okay' })).toBe(false);
    });

    it('ein Turn mit eigenem Thema braucht diesen Weg nicht', () => {
      // Über der Wortgrenze: so ein Turn nennt sein Thema selbst, sein eigenes
      // Verdikt trägt ihn (oder eben nicht — dann ist das eine andere Frage).
      expect(
        force({
          ...followup,
          lastUserText: 'Erkläre mir bitte ausführlich, wie das Gebäudeenergiegesetz zustande kam',
        })
      ).toBe(false);
    });

    it('ohne Abrufkontext im Thread erzwingt nichts', () => {
      // Erster Turn eines Threads, oder ein Thread, der bisher nur erzeugt hat.
      expect(force({ ...followup, priorTurnRetrieved: false })).toBe(false);
    });

    it('nicht für einen Turn, der gar nicht der Auffangwert ist', () => {
      // `sharepic`/`image_edit` u. ä. kommen mit ihrem eigenen Verdikt an —
      // „mach es blauer" nach einer Bundestags-Frage ist keine Nachschlage.
      expect(force({ ...followup, intent: 'sharepic', lastUserText: 'mach es blauer' })).toBe(
        false
      );
    });

    it('eigenes Material sticht auch hier', () => {
      expect(force({ ...followup, materialHeavy: true })).toBe(false);
    });

    it('und der Recherche-Bann sticht ihn ebenfalls', () => {
      expect(force({ ...followup, researchBanned: true })).toBe(false);
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

  /**
   * Der Vorab-Seed ist ein Abruf. Der Zweig, der Abruf-Intents zwingt, will
   * genau verhindern, dass ein solcher Turn NICHTS abruft — ist der Seed
   * gelaufen, ist seine Bedingung erfüllt und der Zwang fordert nur noch einen
   * Aufruf um des Aufrufs willen.
   *
   * Gemessen am 24.08.2026, Thread 4517d0d9: „erstelle daraus eine tabelle" zu
   * einer angehängten Datenschutzerklärung. Keine Zusammenfassungsfrage, also
   * kein Pin — der Planer wählte unter `required` frei und rief `read_pdf_form`.
   */
  describe('der gelaufene Vorab-Seed entzieht dem Abruf-Intent den Zwang', () => {
    it('Dokument-Turn OHNE Seed-Treffer sucht', () => {
      expect(force({ intent: 'search', hasAttachedDocuments: true })).toBe(true);
    });

    it('derselbe Turn MIT geseedeten Passagen sucht nicht', () => {
      expect(
        force({ intent: 'search', hasAttachedDocuments: true, attachedSeedDelivered: true })
      ).toBe(false);
    });

    // Die Zusammenfassung steht VOR diesem Zweig und bleibt unberührt: sie
    // braucht den Volltext, und den holt nur `summarize` — die geseedeten
    // Passagen sind dafür der falsche Stoff.
    it('die Zusammenfassungsbitte sticht den Seed', () => {
      expect(
        force({
          intent: 'search',
          hasAttachedDocuments: true,
          attachedSeedDelivered: true,
          summaryAsk: true,
        })
      ).toBe(true);
    });

    // „Recherchiere dazu aktuelle Zahlen" ist mit Passagen aus dem Anhang nicht
    // erledigt — derselbe Vorrang wie beim eigenen Material darüber.
    it('ein ausdrücklicher Recherche-Auftrag sticht den Seed', () => {
      expect(
        force({
          intent: 'search',
          hasAttachedDocuments: true,
          attachedSeedDelivered: true,
          lastUserText: 'Recherchiere ergänzend dazu.',
        })
      ).toBe(true);
    });

    it('der Selbstwiderspruch der LLM-Stufe ebenso', () => {
      expect(
        force({
          intent: 'search',
          hasAttachedDocuments: true,
          attachedSeedDelivered: true,
          classifierContradictedResearch: true,
        })
      ).toBe(true);
    });

    it('und eine @-Erwähnung, die ein Werkzeug benennt, ebenso', () => {
      expect(
        force({
          intent: 'search',
          hasAttachedDocuments: true,
          attachedSeedDelivered: true,
          pinnedTool: 'umfragen',
        })
      ).toBe(true);
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

    it('auch ohne Erwähnung: der Pin aus Tier 3.4 auf `recurring_tasks` trägt', () => {
      // Kein `@`-Token setzt diesen Pin — der Klassifikator tut es, wenn er
      // einen Dauerauftrag erkennt. Ohne den Zwang erklärte der Planer am
      // Ende, das Produkt könne keine Erinnerungen setzen.
      expect(
        force({
          intent: 'agentic',
          pinnedTool: 'recurring_tasks',
          lastUserText: 'Erinnere mich jeden Montag um 9 an den Wochenbericht',
        })
      ).toBe(true);
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
    expect(
      pinnedFirstTool({
        pinnedTool: 'recurring_tasks',
        isMounted: (name) => name === 'recurring_tasks',
      })
    ).toBe('recurring_tasks');
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

  // Für eine Zusammenfassung ist `summarize` das einzig richtige Werkzeug: es
  // liest den VOLLTEXT (getMultipleDocumentsFullText, Map-Reduce). Der
  // Vorab-Seed hat nur die zur Frage ähnlichen Passagen geholt — bei „fasse
  // zusammen" ist das der falsche Stoff.
  it('nennt summarize, wenn ein angehängtes Dokument zusammengefasst werden soll', () => {
    expect(
      pinnedFirstTool({
        pinnedTool: null,
        hasAttachedDocuments: true,
        summaryAsk: true,
        isMounted: (n) => n === 'summarize',
      })
    ).toBe('summarize');
  });

  it('lässt die Wahl beim Planer, wenn nur eine der beiden Bedingungen trägt', () => {
    const isSummarizeMounted = (n: string) => n === 'summarize';
    expect(
      pinnedFirstTool({
        pinnedTool: null,
        hasAttachedDocuments: true,
        summaryAsk: false,
        isMounted: isSummarizeMounted,
      })
    ).toBe(null);
    expect(
      pinnedFirstTool({
        pinnedTool: null,
        hasAttachedDocuments: false,
        summaryAsk: true,
        isMounted: isSummarizeMounted,
      })
    ).toBe(null);
  });

  // Derselbe Montage-Test wie für den Erwähnungs-Pin: ein Zwang auf ein nicht
  // montiertes Werkzeug bricht den Aufruf.
  it('schweigt, wenn summarize diesen Turn nicht montiert ist', () => {
    expect(
      pinnedFirstTool({
        pinnedTool: null,
        hasAttachedDocuments: true,
        summaryAsk: true,
        isMounted: () => false,
      })
    ).toBe(null);
  });

  // Die Erwähnung ist die ausdrückliche Wahl der Person und schlägt die
  // abgeleitete.
  it('lässt der Erwähnung den Vortritt vor dem Zusammenfassungs-Pin', () => {
    expect(
      pinnedFirstTool({
        pinnedTool: 'umfragen',
        hasAttachedDocuments: true,
        summaryAsk: true,
        isMounted,
      })
    ).toBe('umfragen');
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
