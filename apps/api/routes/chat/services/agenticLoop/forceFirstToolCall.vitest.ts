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
};

const force = (over: Partial<typeof base> = {}) => shouldForceFirstToolCall({ ...base, ...over });

describe('shouldForceFirstToolCall', () => {
  it('erzwingt nichts, wenn kein Weg zutrifft', () => {
    expect(force()).toBe(false);
  });

  describe('der Recherche-Bann sticht alles', () => {
    it.each([
      ['Demotion aus einem Abruf-Verdikt', { loopDemotedFromRetrieval: true }],
      ['ausdrücklicher Rechercheauftrag', { lastUserText: 'Recherchiere das bitte.' }],
      ['benannter Abruf-Intent', { intent: 'web' }],
      ['Selbstwiderspruch der LLM-Stufe', { classifierContradictedResearch: true }],
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

  it('nennt das Werkzeug, wenn eine Erwähnung den Intent festgezurrt hat', () => {
    expect(pinnedFirstTool({ pinnedIntent: 'umfragen', intent: 'umfragen', isMounted })).toBe(
      'umfragen'
    );
  });

  it('schweigt ohne Erwähnung — ein Klassifikator-Verdikt ist keine Wahl', () => {
    expect(pinnedFirstTool({ pinnedIntent: null, intent: 'umfragen', isMounted })).toBe(null);
  });

  it('schweigt, wenn eine spätere Stufe den Intent umgeschrieben hat', () => {
    expect(pinnedFirstTool({ pinnedIntent: 'umfragen', intent: 'produktion', isMounted })).toBe(
      null
    );
  });

  // Die Locale-Gitter in `buildChatToolCatalog` lassen die beiden DE-only-
  // Werkzeuge für de-AT weg. Ein Zwang auf ein nicht montiertes Werkzeug bräche
  // den Aufruf — hier bleibt es bei `required`.
  it('schweigt, wenn das Werkzeug für diesen Turn gar nicht montiert ist', () => {
    expect(
      pinnedFirstTool({ pinnedIntent: 'umfragen', intent: 'umfragen', isMounted: () => false })
    ).toBe(null);
  });

  // `hilfe` montiert `gruenerator_docs_search`, `mcp` ist überhaupt kein
  // einzelnes Werkzeug. Die Regel greift nur, wo der Name trägt — der
  // Montage-Test ist genau das, was sie dort schweigen lässt.
  it('schweigt, wo das Werkzeug nicht wie der Intent heisst', () => {
    expect(pinnedFirstTool({ pinnedIntent: 'hilfe', intent: 'hilfe', isMounted })).toBe(null);
    expect(pinnedFirstTool({ pinnedIntent: 'mcp', intent: 'mcp', isMounted })).toBe(null);
  });

  it('schweigt für einen Intent, dessen Zwang nicht in die Schleife führt', () => {
    expect(pinnedFirstTool({ pinnedIntent: 'examples', intent: 'examples', isMounted })).toBe(null);
  });
});
