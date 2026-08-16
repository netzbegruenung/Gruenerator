/**
 * Die Montage des Turn-Katalogs — was mitkommt und in welcher Reihenfolge.
 *
 * `agenticRespondService.vitest.ts` prüft davon zwei Fälle mit (ein leer
 * zurückkommender MCP-Lader, ein Turn ohne MCP-Absicht), weil es sie für seine
 * eigene Aussage braucht. Hier steht, was das Modul SELBST entscheidet und was
 * dort nicht vorkommt:
 *  - was mit einer VERALTETEN Klebe-Scope passiert (mcp holt neu, agentic wirft
 *    weg — und schliesst dabei den Katalog, sonst bleibt die Verbindung offen),
 *  - dass eine AUSDRÜCKLICHE Erwähnung ihren Ehrlichkeits-Hinweis behält,
 *  - die vier Türen vor dem Rezept-Werkzeug,
 *  - die Montage-REIHENFOLGE: intern → MCP → verwaltete Quellen → Rezept, und
 *    dass jede spätere Stufe eine frühere gleichen Namens überschreibt.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { assembleToolCatalog, wrapAssembledTools, type CatalogDeps } from './catalogAssembly.js';
import { createToolLoopGuards } from './loopGuards.js';
import { createSourceRegistry } from './sourceRegistry.js';
import { type PersistedStep } from './types.js';

import type { ChatGraphState } from '../../../../agents/langgraph/ChatGraph/types.js';
import type { McpCatalog } from '../../agents/mcpCatalog.js';
import type { SSEWriter } from '../sseHelpers.js';
import type { ToolSet } from 'ai';

const getThreadLastMcpServer = vi.fn<(threadId: string) => Promise<string | null>>();
const setThreadLastMcpServer = vi.fn<(threadId: string, serverId: string) => Promise<void>>();

vi.mock('../threadPersistenceService.js', () => ({
  getThreadLastMcpServer: (threadId: string) => getThreadLastMcpServer(threadId),
  setThreadLastMcpServer: (threadId: string, serverId: string) =>
    setThreadLastMcpServer(threadId, serverId),
  getRecentThreadSources: async () => [],
  getRecentToolSteps: async () => [],
}));

interface SentEvent {
  event: string;
  data: Record<string, unknown>;
}

function fakeSse(): { sse: SSEWriter; sent: SentEvent[] } {
  const sent: SentEvent[] = [];
  const sse = {
    send: (event: string, data: Record<string, unknown>) => sent.push({ event, data }),
    isEnded: () => false,
  } as unknown as SSEWriter;
  return { sse, sent };
}

function fakeState(overrides: Record<string, unknown> = {}): ChatGraphState {
  return {
    intent: 'agentic',
    userLocale: 'de-DE',
    agentConfig: { identifier: 'gruenerator-universal', userId: 'u1' },
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

function deps(over: Partial<CatalogDeps> = {}): CatalogDeps {
  return {
    buildChatToolCatalog: () => ({ tools: { web_search: { execute: async () => ({}) } } }),
    loadMcpCatalog: async () => mcpCatalog(),
    loadManagedMcpCatalog: async () => mcpCatalog(),
    buildRecipeCatalog: async () => [],
    ...over,
  } as unknown as CatalogDeps;
}

function assemble(
  state: ChatGraphState,
  d: CatalogDeps,
  opts: { threadId?: string | null; sse?: SSEWriter } = {}
) {
  return assembleToolCatalog(
    {
      state,
      sourceRegistry: createSourceRegistry(),
      sse: opts.sse ?? fakeSse().sse,
      threadId: opts.threadId ?? null,
    },
    d
  );
}

beforeEach(() => {
  getThreadLastMcpServer.mockReset();
  setThreadLastMcpServer.mockReset();
  getThreadLastMcpServer.mockResolvedValue(null);
  setThreadLastMcpServer.mockResolvedValue(undefined);
});

describe('assembleToolCatalog — ausgefallener MCP-Dienst', () => {
  it('holt bei veralteter Klebe-Scope auf einem mcp-Turn ungescopt nach', async () => {
    getThreadLastMcpServer.mockResolvedValue('server-weg');
    const calls: Array<string | null> = [];
    const loadMcpCatalog = vi.fn(async ({ scope }: { scope: string | null }) => {
      calls.push(scope);
      return scope
        ? mcpCatalog({ scopedServerMissing: true })
        : mcpCatalog({
            tools: { sally_ticket: { execute: async () => ({}) } },
            labels: new Map([['sally_ticket', { serverName: 'Sally', toolName: 'ticket' }]]),
          });
    });

    const assembled = await assemble(fakeState({ intent: 'mcp' }), deps({ loadMcpCatalog }), {
      threadId: 't1',
    });

    expect(calls).toEqual(['server-weg', null]);
    expect(Object.keys(assembled.tools)).toContain('sally_ticket');
    // Der zweite Lauf ist ungescopt — es gibt keinen Server, den man sich
    // merken könnte, also darf auch nichts geschrieben werden.
    expect(setThreadLastMcpServer).not.toHaveBeenCalled();
  });

  it('verwirft den Katalog auf einem agentic-Turn und schliesst ihn dabei', async () => {
    getThreadLastMcpServer.mockResolvedValue('server-weg');
    const close = vi.fn(async () => {});
    const loadMcpCatalog = vi.fn(async () => mcpCatalog({ scopedServerMissing: true, close }));

    const assembled = await assemble(fakeState({ intent: 'agentic' }), deps({ loadMcpCatalog }), {
      threadId: 't1',
    });

    expect(loadMcpCatalog).toHaveBeenCalledTimes(1);
    expect(assembled.mcpCatalog).toBeNull();
    // Ohne dieses close() bleibt die Verbindung des weggeworfenen Katalogs
    // offen — der Aufrufer schliesst nur, was er zurückbekommt.
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('behält den fehlenden Dienst, wenn er AUSDRÜCKLICH erwähnt wurde', async () => {
    const loadMcpCatalog = vi.fn(async () => mcpCatalog({ scopedServerMissing: true }));

    const assembled = await assemble(
      fakeState({ intent: 'agentic', mcpServerScope: 'sally' }),
      deps({ loadMcpCatalog })
    );

    // Genau EIN Versuch, und das Ergebnis bleibt stehen: nur so kann der Prompt
    // "der erwähnte Dienst ist nicht verbunden" sagen, statt still tool-los zu
    // laufen.
    expect(loadMcpCatalog).toHaveBeenCalledTimes(1);
    expect(assembled.mcpCatalog?.scopedServerMissing).toBe(true);
    expect(getThreadLastMcpServer).not.toHaveBeenCalled();
  });

  it('merkt sich den benutzten Dienst nur bei einem Katalog mit Werkzeugen', async () => {
    const withTools = mcpCatalog({
      tools: { sally_ticket: { execute: async () => ({}) } },
      labels: new Map([['sally_ticket', { serverName: 'Sally', toolName: 'ticket' }]]),
    });
    await assemble(
      fakeState({ intent: 'mcp', mcpServerScope: 'sally' }),
      deps({ loadMcpCatalog: async () => withTools }),
      { threadId: 't1' }
    );
    expect(setThreadLastMcpServer).toHaveBeenCalledWith('t1', 'sally');

    setThreadLastMcpServer.mockClear();
    await assemble(
      fakeState({ intent: 'mcp', mcpServerScope: 'sally' }),
      deps({ loadMcpCatalog: async () => mcpCatalog() }),
      { threadId: 't1' }
    );
    expect(setThreadLastMcpServer).not.toHaveBeenCalled();
  });

  it('meldet abgedriftete Dienste als Warnung an den Client', async () => {
    const { sse, sent } = fakeSse();
    await assemble(
      fakeState({ intent: 'mcp' }),
      deps({
        loadMcpCatalog: async () => mcpCatalog({ driftedServers: ['Sally hat neue Tools'] }),
      }),
      { sse }
    );
    expect(sent).toEqual([
      { event: 'warning', data: { code: 'mcp_tools_drifted', message: 'Sally hat neue Tools' } },
    ]);
  });

  it('lädt gar nichts, wenn kein Nutzer am Turn hängt', async () => {
    const loadMcpCatalog = vi.fn(async () => mcpCatalog());
    await assemble(
      fakeState({ intent: 'mcp', agentConfig: { identifier: 'x' } }),
      deps({ loadMcpCatalog })
    );
    expect(loadMcpCatalog).not.toHaveBeenCalled();
  });
});

describe('assembleToolCatalog — Rezept-Werkzeug', () => {
  const catalog = [
    { mention: 'presse', title: 'Pressemitteilung', description: 'PM', source: 'system' as const },
  ];
  const withRecipes = (over: Partial<CatalogDeps> = {}) =>
    deps({ buildRecipeCatalog: async () => catalog, ...over });

  it('montiert rezept_laden, wenn nichts die Textform schon festlegt', async () => {
    const assembled = await assemble(fakeState(), withRecipes());
    expect(assembled.tools.rezept_laden).toBeDefined();
    expect(assembled.recipeCatalog).toHaveLength(1);
  });

  it('montiert es NICHT, wenn der Katalog leer ist', async () => {
    const assembled = await assemble(fakeState(), deps({ buildRecipeCatalog: async () => [] }));
    expect(assembled.tools.rezept_laden).toBeUndefined();
    expect(assembled.recipeCatalog).toEqual([]);
  });

  it('fragt den Katalog gar nicht ab, wenn ein Rezept schon erwähnt wurde', async () => {
    const buildRecipeCatalog = vi.fn(async () => catalog);
    const assembled = await assemble(
      fakeState({ activeSkillMention: 'presse' }),
      withRecipes({ buildRecipeCatalog })
    );
    expect(buildRecipeCatalog).not.toHaveBeenCalled();
    expect(assembled.tools.rezept_laden).toBeUndefined();
  });

  it('schweigt bei einem eigenen Thread-Prompt — ausser die Rolle bringt ihn mit', async () => {
    const gesperrt = await assemble(fakeState({ customSystemPrompt: 'Sei knapp.' }), withRecipes());
    expect(gesperrt.tools.rezept_laden).toBeUndefined();

    // Eine Katalog-Rolle ist server-eigen: sie soll ihr Rezept holen dürfen.
    const rolle = await assemble(
      fakeState({ customSystemPrompt: 'Presse & Social-Media', roleBausteinActive: true }),
      withRecipes()
    );
    expect(rolle.tools.rezept_laden).toBeDefined();
  });

  it('respektiert das ausgeschaltete Werkzeug', async () => {
    const assembled = await assemble(
      fakeState({ enabledTools: { rezept_laden: false } }),
      withRecipes()
    );
    expect(assembled.tools.rezept_laden).toBeUndefined();
  });
});

describe('assembleToolCatalog — Montage-Reihenfolge', () => {
  it('montiert intern → MCP → verwaltete Quellen → Rezept, spätere gewinnen', async () => {
    const order: string[] = [];
    const mark = (tag: string) => ({ execute: async () => tag });
    const assembled = await assemble(
      fakeState({ intent: 'mcp', mcpServerScope: 'sally', managedSourceKeys: ['bahn'] }),
      deps({
        buildChatToolCatalog: () => {
          order.push('intern');
          return { tools: { web_search: mark('intern'), geteilt: mark('intern') } };
        },
        loadMcpCatalog: async () => {
          order.push('mcp');
          return mcpCatalog({
            tools: { sally_ticket: mark('mcp'), geteilt: mark('mcp') },
            labels: new Map([['sally_ticket', { serverName: 'Sally', toolName: 'ticket' }]]),
          });
        },
        loadManagedMcpCatalog: async () => {
          order.push('managed');
          return mcpCatalog({
            tools: { bahn_fahrplan: mark('managed'), geteilt: mark('managed') },
            labels: new Map([['bahn_fahrplan', { serverName: 'Bahn', toolName: 'fahrplan' }]]),
          });
        },
        buildRecipeCatalog: async () => {
          order.push('rezept');
          return [{ mention: 'presse', title: 'PM', description: 'd', source: 'system' as const }];
        },
      })
    );

    expect(order).toEqual(['intern', 'mcp', 'managed', 'rezept']);
    expect(Object.keys(assembled.tools)).toEqual([
      'web_search',
      'geteilt',
      'sally_ticket',
      'bahn_fahrplan',
      'rezept_laden',
    ]);
    // Object.assign in Montage-Reihenfolge: der zuletzt montierte Namensvetter
    // gewinnt. Damit entscheidet die Reihenfolge, nicht der Zufall.
    const geteilt = assembled.tools.geteilt as { execute: () => Promise<string> };
    expect(await geteilt.execute()).toBe('managed');
    // Karten-Labels aus BEIDEN Katalogen, nicht nur aus dem ersten.
    expect([...assembled.toolLabels.keys()]).toEqual(['sally_ticket', 'bahn_fahrplan']);
  });
});

describe('wrapAssembledTools — Labels der Verbindungs-Werkzeuge', () => {
  const wrap = (toolLabels: Map<string, { serverName: string; toolName: string }>) => {
    const { sse, sent } = fakeSse();
    const steps: PersistedStep[] = [];
    const wrapped = wrapAssembledTools(
      { sally_ticket: { execute: async () => ({ ok: true }) } } as unknown as ToolSet,
      {
        sse,
        guards: createToolLoopGuards({ searchToolNames: new Set(), getSourceCount: () => 0 }),
        recordStep: (s) => steps.push(s),
        perCallTimeoutMs: 20_000,
        toolLabels,
        getTextOffset: () => null,
        takeNarration: () => null,
      }
    );
    return { wrapped, sent, steps };
  };

  const call = (wrapped: ToolSet) =>
    (wrapped['sally_ticket'] as { execute: (i: unknown, o: unknown) => Promise<unknown> }).execute(
      {},
      { toolCallId: 'c1' }
    );

  it('gibt der Karte Titel und Servernamen, wenn ein Label existiert', async () => {
    const { wrapped, sent, steps } = wrap(
      new Map([['sally_ticket', { serverName: 'Sally', toolName: 'ticket' }]])
    );
    await call(wrapped);
    expect(sent[0].data).toMatchObject({ title: 'Sally · ticket…', serverName: 'Sally' });
    // Der Servername wandert in den Schritt, damit ein späterer Turn weiß,
    // welcher Dienst den Aufruf beantwortet hat.
    expect(steps[0]).toMatchObject({ serverName: 'Sally' });
  });

  it('lässt beide Felder weg, wenn der Turn gar keine Verbindungs-Werkzeuge hat', async () => {
    const { wrapped, sent, steps } = wrap(new Map());
    await call(wrapped);
    expect(sent[0].data).not.toHaveProperty('title');
    expect(sent[0].data).not.toHaveProperty('serverName');
    expect(steps[0]).not.toHaveProperty('serverName');
  });
});
