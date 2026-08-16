/**
 * Der Prompt des Schreibers im split-Modus — und die Verbindungs-Notizen, die
 * beide Phasen teilen.
 *
 * Beides ist reine Textmontage aus `SynthPromptContext` bzw. dem Katalog-Stand,
 * und genau das ist der Grund für eigene Tests: `agenticRespondService.vitest.ts`
 * prüft, WELCHER Modus läuft, nie WAS im Prompt landet. Die Fälle hier sind die,
 * in denen ein falscher Zweig den Schreiber zu einer FALSCHEN AUSSAGE über den
 * eigenen Turn bringt — „ich habe nichts recherchiert" neben mitgeführten
 * Quellen, ein Zitiergebot ohne Quellenliste, ein erfundener Dienst-Umfang.
 */
import { describe, it, expect } from 'vitest';

import { createRecipeRegistry } from './recipeRegistry.js';
import { createSourceRegistry } from './sourceRegistry.js';
import { buildConnectorNotes, buildSynthSystem, type SynthPromptContext } from './synthPrompt.js';
import { type PersistedStep } from './types.js';

import type { ChatGraphState } from '../../../../agents/langgraph/ChatGraph/types.js';
import type { McpCatalog } from '../../agents/mcpCatalog.js';
import type { ToolSet } from 'ai';

function fakeState(overrides: Record<string, unknown> = {}): ChatGraphState {
  return {
    intent: 'agentic',
    userLocale: 'de-DE',
    mcpServerScope: null,
    ...overrides,
  } as unknown as ChatGraphState;
}

function mcpCatalog(over: Partial<McpCatalog> = {}): McpCatalog {
  return {
    tools: {},
    labels: new Map(),
    catalogSummary: '',
    scopedServerMissing: false,
    scopedServerUnreachable: false,
    driftedServers: [],
    promptHints: [],
    close: async () => {},
    ...over,
  } as unknown as McpCatalog;
}

const sallyLabels = new Map([
  ['sally_ticket', { serverName: 'Sally', toolName: 'ticket' }],
  ['sally_list', { serverName: 'Sally', toolName: 'list' }],
]);

function ctx(over: Partial<SynthPromptContext> = {}): SynthPromptContext {
  return {
    state: fakeState(),
    systemMessage: 'SYSTEM',
    mcpNote: '',
    steps: [],
    tools: {} as ToolSet,
    sourceRegistry: createSourceRegistry(),
    recipeRegistry: createRecipeRegistry(),
    opening: () => null,
    ...over,
  };
}

/** A carried source makes `carriedSize` > 0 while `freshSize` stays 0 — the
 *  state the "you researched nothing" note must NOT describe. */
function carriedRegistry() {
  const registry = createSourceRegistry();
  registry.seedCarried([
    { title: 'Antrag', url: 'https://example.org/a', content: 'Text' },
  ] as never);
  return registry;
}

describe('buildSynthSystem — Quellenblock', () => {
  it('hängt Liste und Zitiergebot an, wenn Quellen da sind', () => {
    const prompt = buildSynthSystem('[1] Antrag — https://example.org/a', ctx());
    expect(prompt).toContain('GESAMMELTE QUELLEN (nummeriert):');
    expect(prompt).toContain('[1] Antrag — https://example.org/a');
    expect(prompt).toContain('ZITIER-REGELN');
    // Ohne Quellen wäre der Ehrlichkeits-Hinweis dran — mit Quellen wäre er
    // eine Falschaussage über denselben Turn.
    expect(prompt).not.toContain('hast du NICHTS recherchiert');
  });

  it('lässt bei leerem Block kein Zitiergebot stehen und sagt es ehrlich', () => {
    const prompt = buildSynthSystem('   ', ctx());
    expect(prompt).not.toContain('GESAMMELTE QUELLEN');
    expect(prompt).not.toContain('ZITIER-REGELN');
    expect(prompt).toContain('hast du NICHTS recherchiert');
  });

  it('unterscheidet mitgeführte von gar keinen Quellen', () => {
    const prompt = buildSynthSystem('[1] Antrag', ctx({ sourceRegistry: carriedRegistry() }));
    // Der Turn HAT Material — die „nichts recherchiert"-Zeile daneben war die
    // Aussage, mit der das Modell dem*der Nutzer*in sichtbar angehängte Quellen
    // ins Gesicht abstritt.
    expect(prompt).not.toContain('hast du NICHTS recherchiert');
    expect(prompt).toContain('NICHT neu recherchiert');
    expect(prompt).toContain('du darfst sie mit [N] belegen');
  });

  it('schweigt zur Recherche, wenn ein Verbindungs-Tool gelaufen ist', () => {
    const steps: PersistedStep[] = [
      { toolName: 'sally_ticket', serverName: 'Sally', result: { ok: true } } as never,
    ];
    const prompt = buildSynthSystem('', ctx({ steps }));
    // Ein MCP-Tool registriert keine Quellen. „Nichts recherchiert" wäre hier
    // wahr im Buchstaben und falsch in der Sache.
    expect(prompt).not.toContain('hast du NICHTS recherchiert');
  });
});

describe('buildSynthSystem — Eröffnungssatz und Rezept', () => {
  it('nennt den bereits gezeigten Eröffnungssatz, damit er nicht doppelt kommt', () => {
    const prompt = buildSynthSystem('', ctx({ opening: () => 'Ich schaue kurz nach.' }));
    expect(prompt).toContain('"Ich schaue kurz nach."');
    expect(prompt).toContain('Wiederhole diesen Satz NICHT');
  });

  it('schweigt, wenn der Eröffnungssatz nie beim Client ankam', () => {
    const prompt = buildSynthSystem('', ctx({ opening: () => null }));
    // Der Satz wurde zurückgehalten. Ihn hier anzukündigen liesse den Schreiber
    // seinen eigenen ersten Satz überspringen.
    expect(prompt).not.toContain('Deine Antwort beginnt bereits');
  });

  it('trägt ein selbst geladenes Rezept in den Prompt', () => {
    const recipeRegistry = createRecipeRegistry();
    recipeRegistry.register({
      mention: 'presse',
      title: 'Pressemitteilung',
      body: 'REZEPTTEXT',
    } as never);
    const prompt = buildSynthSystem('', ctx({ recipeRegistry }));
    // Split-Modus ist der EINZIGE Kanal dafür: dieses Modell hat keine Tools
    // und sieht das `rezept_laden`-Ergebnis nie.
    expect(prompt).toContain('REZEPTTEXT');
  });
});

describe('buildSynthSystem — Reihenfolge und Rahmen', () => {
  it('setzt Systemnachricht, Connector-Notiz und Quellen in dieser Folge', () => {
    const prompt = buildSynthSystem('[1] Antrag', ctx({ mcpNote: '\n\nMCPNOTE' }));
    expect(prompt.indexOf('SYSTEM')).toBeLessThan(prompt.indexOf('MCPNOTE'));
    expect(prompt.indexOf('MCPNOTE')).toBeLessThan(prompt.indexOf('GESAMMELTE QUELLEN'));
  });

  it('schliesst mit Sprachregel und Anweisungs-Hierarchie ab', () => {
    const prompt = buildSynthSystem('', ctx());
    expect(prompt).toContain('Antworte auf Deutsch (Du-Form, Genderstern).');
    // Der einzige Injektionsschutz auf diesem Pfad — vor der Vereinheitlichung
    // lief der unified-Modus ganz ohne ihn.
    expect(prompt).toContain('-Markierungen');
  });
});

describe('buildConnectorNotes — Dienst-Lage', () => {
  const notes = (
    state: ChatGraphState,
    over: {
      mcpCatalog?: McpCatalog | null;
      systemCatalog?: McpCatalog | null;
      managedKeys?: string[];
      mcpCapabilityQuestion?: boolean;
    } = {}
  ) =>
    buildConnectorNotes({
      state,
      mcpCatalog: over.mcpCatalog ?? null,
      systemCatalog: over.systemCatalog ?? null,
      managedKeys: over.managedKeys ?? [],
      mcpCapabilityQuestion: over.mcpCapabilityQuestion ?? false,
    });

  it('sagt einen fehlenden Dienst an, statt tool-los weiterzulaufen', () => {
    const out = notes(fakeState({ mcpServerScope: 'sally' }), {
      mcpCatalog: mcpCatalog({ scopedServerMissing: true }),
    });
    expect(out.mcpNote).toContain('nicht (mehr) verbunden');
    expect(out.mcpNote).toContain('erfinde keine Ergebnisse');
  });

  it('trennt „nicht erreichbar" von „nicht verbunden"', () => {
    const out = notes(fakeState({ mcpServerScope: 'sally' }), {
      mcpCatalog: mcpCatalog({ scopedServerUnreachable: true }),
    });
    // Zwei verschiedene Auskünfte an den*die Nutzer*in: gelöscht heisst
    // Einstellungen prüfen, unerreichbar heisst später nochmal versuchen.
    expect(out.mcpNote).toContain('gerade nicht erreichbar');
    expect(out.mcpNote).not.toContain('nicht (mehr) verbunden');
  });

  it('bindet einen ausdrücklich erwähnten Dienst verbindlich ein', () => {
    const out = notes(fakeState({ mcpServerScope: 'sally' }), {
      mcpCatalog: mcpCatalog({ labels: sallyLabels }),
    });
    expect(out.mcpServerNames).toEqual(['Sally']);
    expect(out.mcpNote).toContain('explizit angesprochen');
  });

  it('formuliert die Klebe-Scope eines agentic-Turns als Rückblick', () => {
    const out = notes(fakeState({ intent: 'agentic', mcpServerScope: null }), {
      mcpCatalog: mcpCatalog({ labels: sallyLabels }),
    });
    expect(out.mcpNote).toContain('zuletzt mit dem Dienst Sally gearbeitet');
    expect(out.mcpNote).not.toContain('explizit angesprochen');
  });

  it('zählt bei einer Fähigkeitsfrage genau die montierten Tools auf', () => {
    const out = notes(fakeState({ mcpServerScope: 'sally' }), {
      mcpCatalog: mcpCatalog({ labels: sallyLabels }),
      mcpCapabilityQuestion: true,
    });
    expect(out.mcpNote).toContain('GENAU diese Tools bereit: ticket, list');
    expect(out.mcpNote).toContain('erfinde keine weiteren');
  });

  it('lässt die Aufzählung weg, wenn kein Dienst angesprochen wurde', () => {
    const out = notes(fakeState({ mcpServerScope: null }), {
      mcpCatalog: mcpCatalog({ labels: sallyLabels }),
      mcpCapabilityQuestion: true,
    });
    // Ohne Scope gäbe es keinen Dienst, über dessen Umfang man Auskunft geben
    // könnte — die Liste wäre eine Behauptung über irgendwen.
    expect(out.mcpNote).not.toContain('GENAU diese Tools');
  });

  it('löst Datum und Land in den Hinweisen der verwalteten Quellen auf', () => {
    const out = notes(fakeState({ userLocale: 'de-AT' }), {
      systemCatalog: mcpCatalog({ promptHints: ['Heute ist {{TODAY_ISO}} in {{COUNTRY}}.'] }),
      managedKeys: ['bahn'],
    });
    expect(out.systemNote).toContain(`Heute ist ${new Date().toISOString().slice(0, 10)} in AT.`);
    expect(out.systemNote).not.toContain('{{');
  });

  it('meldet einen ausgefallenen Auskunftsdienst, statt still zu schweigen', () => {
    const out = notes(fakeState(), {
      systemCatalog: mcpCatalog({ promptHints: [] }),
      managedKeys: ['bahn'],
    });
    // Der Schlüssel wurde ausgelöst, aber nichts hat gemountet. Ohne diesen
    // Satz erfindet der Schreiber Fahrpläne.
    expect(out.systemNote).toContain('nicht erreichbar');
  });

  it('schweigt ganz, wenn gar keine verwaltete Quelle ausgelöst wurde', () => {
    const out = notes(fakeState(), { managedKeys: [] });
    expect(out.systemNote).toBe('');
  });

  it('reicht den Werkzeug-Katalog unabhängig von einer Fähigkeitsfrage durch', () => {
    const out = notes(fakeState(), {
      mcpCatalog: mcpCatalog({ catalogSummary: 'Sally: ticket(id), list()' }),
      mcpCapabilityQuestion: false,
    });
    // Der Planer muss die Geschwister-Tools SEHEN, bevor er wegen eines
    // fehlenden Parameters zurückfragt.
    expect(out.connectorCatalogNote).toContain('Sally: ticket(id), list()');
  });
});
