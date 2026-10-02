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

import {
  assembleToolCatalog,
  buildToolReplay,
  isLookupTool,
  priorToolNames,
  priorTurnRetrieved,
  priorLookups,
  priorTurnRetrievalFailed,
  wrapAssembledTools,
  type CatalogDeps,
} from './catalogAssembly.js';
import { createToolLoopGuards } from './loopGuards.js';
import { createSourceRegistry } from './sourceRegistry.js';
import { createToolActivity } from './toolActivity.js';
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
    resolveRecipe: async () => null,
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
  it('verwirft eine veraltete Klebe-Scope auch auf einem mcp-Turn — kein ungescopter Rückgriff', async () => {
    getThreadLastMcpServer.mockResolvedValue('server-weg');
    const loadMcpCatalog = vi.fn(async () => mcpCatalog({ scopedServerMissing: true }));

    const assembled = await assemble(fakeState({ intent: 'mcp' }), deps({ loadMcpCatalog }), {
      threadId: 't1',
    });

    expect(loadMcpCatalog).toHaveBeenCalledTimes(1);
    expect(loadMcpCatalog).toHaveBeenCalledWith({ userId: 'u1', scope: 'server-weg' });
    expect(assembled.mcpCatalog).toBeNull();
    expect(setThreadLastMcpServer).not.toHaveBeenCalled();
  });

  it('montiert ohne Scope nichts — auch nicht auf einem mcp-Turn', async () => {
    const loadMcpCatalog = vi.fn(async () => mcpCatalog());
    const loadManagedMcpCatalog = vi.fn(async () => mcpCatalog());

    const assembled = await assemble(
      fakeState({ intent: 'mcp' }),
      deps({ loadMcpCatalog, loadManagedMcpCatalog } as never),
      { threadId: 't1' }
    );

    expect(loadMcpCatalog).not.toHaveBeenCalled();
    expect(loadManagedMcpCatalog).not.toHaveBeenCalled();
    expect(assembled.mcpCatalog).toBeNull();
  });

  it('lädt einen verwalteten Scope über den eigenen Lader, nie über den Nutzer-Lader', async () => {
    const loadMcpCatalog = vi.fn(async () => mcpCatalog());
    const loadManagedMcpCatalog = vi.fn(async () =>
      mcpCatalog({
        tools: { wetter__forecast: { execute: async () => ({}) } },
        labels: new Map([['wetter__forecast', { serverName: 'Wetter', toolName: 'forecast' }]]),
      })
    );

    const assembled = await assemble(
      fakeState({ intent: 'mcp', mcpServerScope: 'system-wetter' }),
      deps({ loadMcpCatalog, loadManagedMcpCatalog } as never),
      { threadId: 't1' }
    );

    expect(loadMcpCatalog).not.toHaveBeenCalled();
    expect(loadManagedMcpCatalog).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'wetter', userId: 'u1' })
    );
    expect(Object.keys(assembled.tools)).toContain('wetter__forecast');
    expect(setThreadLastMcpServer).toHaveBeenCalledWith('t1', 'system-wetter');
  });

  it('montiert auf anderen Intents auch mit Klebe-Scope nichts', async () => {
    getThreadLastMcpServer.mockResolvedValue('sally');
    const loadMcpCatalog = vi.fn(async () => mcpCatalog());

    await assemble(fakeState({ intent: 'web' }), deps({ loadMcpCatalog }), { threadId: 't1' });

    expect(loadMcpCatalog).not.toHaveBeenCalled();
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
      fakeState({ intent: 'mcp', mcpServerScope: 'sally' }),
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

  // Gegenprobe zu #2928: dort geht die ausdrückliche Wahl im Prompt-Zweig
  // wieder auf (`resolveEffectiveRecipeMention`) — HIER bleibt sie zu, und das
  // ist richtig. Das Werkzeug lädt ein ZWEITES Rezept; die Wahl steckt längst
  // im Systemprompt. Beide Klauseln greifen, jede für sich.
  it('schweigt bei gewähltem Rezept UND eigenem Thread-Prompt', async () => {
    const buildRecipeCatalog = vi.fn(async () => catalog);
    const assembled = await assemble(
      fakeState({ customSystemPrompt: 'Ich bin …', activeSkillMention: 'presse-hessen-partei' }),
      withRecipes({ buildRecipeCatalog })
    );
    expect(buildRecipeCatalog).not.toHaveBeenCalled();
    expect(assembled.tools.rezept_laden).toBeUndefined();
  });

  it('fragt den Katalog gar nicht ab, wenn ein Rezept per Id gepinnt ist', async () => {
    const buildRecipeCatalog = vi.fn(async () => catalog);
    const assembled = await assemble(
      fakeState({ activeSkillMention: null, activeRecipeId: 'presse' }),
      withRecipes({ buildRecipeCatalog })
    );
    expect(buildRecipeCatalog).not.toHaveBeenCalled();
    expect(assembled.tools.rezept_laden).toBeUndefined();
  });

  it('respektiert das ausgeschaltete Werkzeug', async () => {
    const assembled = await assemble(
      fakeState({ enabledTools: { rezept_laden: false } }),
      withRecipes()
    );
    expect(assembled.tools.rezept_laden).toBeUndefined();
  });
});

describe('assembleToolCatalog — Rezept eines Ein-Rezept-LV-Agenten', () => {
  const buergerBerlin = {
    identifier: 'gruenerator-buergeranfragen-berlin',
    defaultRecipeMention: 'buerger-berlin',
    userId: 'u1',
  };
  const withSearch = (over: Partial<CatalogDeps> = {}) =>
    deps({
      buildChatToolCatalog: () => ({
        tools: { gruenerator_search: { execute: async () => ({}) } },
      }),
      resolveRecipe: async ({ mention }) => ({
        title: `Titel ${mention}`,
        body: 'Rumpf',
        source: 'system',
      }),
      ...over,
    } as Partial<CatalogDeps>);

  it('lädt das Rezept vorab, samt den montierten empfohlenen Werkzeugen', async () => {
    const assembled = await assemble(
      fakeState({
        agentConfig: buergerBerlin,
        lastUserTextNoMentions: 'Frau M. fragt nach der U-Bahn …',
      }),
      withSearch()
    );
    expect(assembled.recipeRegistry.mentions).toEqual(['buerger-berlin']);
    expect(assembled.recipeRegistry.render()).toContain(
      'Für dieses Rezept geeignete Werkzeuge: gruenerator_search.'
    );
  });

  it('lädt nichts, wenn die Person selbst ein Rezept gewählt hat', async () => {
    const resolveRecipe = vi.fn();
    const assembled = await assemble(
      fakeState({
        agentConfig: buergerBerlin,
        activeSkillMention: 'presse',
        lastUserTextNoMentions: 'Schreib eine PM',
      }),
      withSearch({ resolveRecipe } as Partial<CatalogDeps>)
    );
    expect(resolveRecipe).not.toHaveBeenCalled();
    expect(assembled.recipeRegistry.size).toBe(0);
  });

  it('lädt nichts auf einer Plauder- oder Produktfrage', async () => {
    const assembled = await assemble(
      fakeState({ agentConfig: buergerBerlin, lastUserTextNoMentions: 'was kannst du?' }),
      withSearch()
    );
    expect(assembled.recipeRegistry.size).toBe(0);
  });

  it('lässt LV-PR-Agenten beim Selbstladen', async () => {
    const assembled = await assemble(
      fakeState({
        agentConfig: {
          identifier: 'gruenerator-oeffentlichkeitsarbeit-saarland',
          defaultRecipeMention: 'presse-saarland',
          userId: 'u1',
        },
        lastUserTextNoMentions: 'Schreib eine PM zur Saarbahn',
      }),
      withSearch()
    );
    expect(assembled.recipeRegistry.size).toBe(0);
  });
});

describe('assembleToolCatalog — disableMcp (headless, #3221)', () => {
  it('lädt keinen Konnektor — auch nicht bei mcp-Intent mit Scope', async () => {
    const loadMcp = vi.fn(async () => mcpCatalog());
    const loadManaged = vi.fn(async () => mcpCatalog());
    const assembled = await assembleToolCatalog(
      {
        state: fakeState({ intent: 'mcp', mcpServerScope: 'system-bahn' }),
        sourceRegistry: createSourceRegistry(),
        sse: fakeSse().sse,
        disableMcp: true,
        threadId: 't1',
      },
      deps({ loadMcpCatalog: loadMcp, loadManagedMcpCatalog: loadManaged } as never)
    );
    expect(loadMcp).not.toHaveBeenCalled();
    expect(loadManaged).not.toHaveBeenCalled();
    expect(assembled.mcpCatalog).toBeNull();
  });

  it('reicht searchToolKeys an den Werkzeugkatalog durch', async () => {
    const build = vi.fn(() => ({ tools: {} }));
    await assembleToolCatalog(
      {
        state: fakeState(),
        sourceRegistry: createSourceRegistry(),
        sse: fakeSse().sse,
        searchToolKeys: ['search', 'web'],
        threadId: 't1',
      },
      deps({ buildChatToolCatalog: build } as never)
    );
    expect(build).toHaveBeenCalledWith(
      expect.objectContaining({ searchToolKeys: ['search', 'web'] })
    );
  });
});

describe('assembleToolCatalog — ask_human (Loop-Rückfrage, #3220)', () => {
  it('montiert ask_human nur mit Thread — ohne Resume-Weg keine Frage', async () => {
    const withThread = await assemble(fakeState(), deps(), { threadId: 't1' });
    expect('ask_human' in withThread.tools).toBe(true);

    const withoutThread = await assemble(fakeState(), deps(), { threadId: null });
    expect('ask_human' in withoutThread.tools).toBe(false);
  });

  it('respektiert den Aus-Schalter CHAT_LOOP_ASK_HUMAN=false', async () => {
    process.env.CHAT_LOOP_ASK_HUMAN = 'false';
    try {
      const assembled = await assemble(fakeState(), deps(), { threadId: 't1' });
      expect('ask_human' in assembled.tools).toBe(false);
    } finally {
      delete process.env.CHAT_LOOP_ASK_HUMAN;
    }
  });
});

describe('assembleToolCatalog — Montage-Reihenfolge', () => {
  it('montiert intern → Konnektor → Rezept, spätere gewinnen', async () => {
    const order: string[] = [];
    const mark = (tag: string) => ({ execute: async () => tag });
    const assembled = await assemble(
      fakeState({ intent: 'mcp', mcpServerScope: 'sally' }),
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
        buildRecipeCatalog: async () => {
          order.push('rezept');
          return [{ mention: 'presse', title: 'PM', description: 'd', source: 'system' as const }];
        },
      })
    );

    expect(order).toEqual(['intern', 'mcp', 'rezept']);
    expect(Object.keys(assembled.tools)).toEqual([
      'web_search',
      'geteilt',
      'sally_ticket',
      'rezept_laden',
    ]);
    // Object.assign in Montage-Reihenfolge: der zuletzt montierte Namensvetter
    // gewinnt. Damit entscheidet die Reihenfolge, nicht der Zufall.
    const geteilt = assembled.tools.geteilt as { execute: () => Promise<string> };
    expect(await geteilt.execute()).toBe('mcp');
    expect([...assembled.toolLabels.keys()]).toEqual(['sally_ticket']);
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
        toolActivity: createToolActivity(),
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

describe('priorTurnRetrieved', () => {
  /**
   * Die Thread-Hälfte des siebten Wegs in `shouldForceFirstToolCall`: hat der
   * vorige Turn etwas GEHOLT, oder nur etwas GEMACHT? Die Trennlinie ist
   * dieselbe Liste, an der auch das Replay entlangschneidet.
   */
  const history = (...toolNames: string[]) => ({
    artifacts: () => [],
    toolSteps: () =>
      toolNames.map((toolName, i): PersistedStep => ({
        toolCallId: `c${i}`,
        toolName,
        args: {},
        result: {},
      })),
    lastTurnToolSteps: () => [],
    lastTurnArtifacts: () => [],
    lastTurnIntent: () => null,
    sources: () => [],
    lastGeneratedImageUrl: () => null,
  });

  it.each(['gruenerator_search', 'web_search', 'bundestag', 'abgeordnetenwatch', 'umfragen'])(
    '%s zählt als Abruf',
    (toolName) => {
      expect(priorTurnRetrieved(history(toolName))).toBe(true);
    }
  );

  it('ein Thread, der nur ERZEUGT hat, hat nichts nachgeschlagen', () => {
    expect(priorTurnRetrieved(history('sharepic', 'create_document', 'generate_image'))).toBe(
      false
    );
  });

  it('ein Abruf neben einer Erzeugung zählt', () => {
    expect(priorTurnRetrieved(history('sharepic', 'web_search'))).toBe(true);
  });

  it('ohne Thread und ohne Schritte ist die Antwort nein', () => {
    expect(priorTurnRetrieved(null)).toBe(false);
    expect(priorTurnRetrieved(undefined)).toBe(false);
    expect(priorTurnRetrieved(history())).toBe(false);
  });

  it('ein Lesefehler der Projektion darf keinen Turn brechen', () => {
    expect(
      priorTurnRetrieved({
        artifacts: () => [],
        toolSteps: () => {
          throw new Error('boom');
        },
        lastTurnToolSteps: () => [],
        lastTurnArtifacts: () => [],
        lastTurnIntent: () => null,
        sources: () => [],
        lastGeneratedImageUrl: () => null,
      })
    ).toBe(false);
  });
});

describe('priorToolNames', () => {
  const history = (steps: PersistedStep[]) => ({
    artifacts: () => [],
    toolSteps: () => steps,
    lastTurnToolSteps: () => [],
    lastTurnArtifacts: () => [],
    lastTurnIntent: () => null,
    sources: () => [],
    lastGeneratedImageUrl: () => null,
  });

  it('lässt Verbindungs-Schritte weg — ihr Anschluss hat einen eigenen Weg', () => {
    expect(
      priorToolNames(
        history([
          { toolCallId: 'c0', toolName: 'gruenerator_search', args: {}, result: {} },
          { toolCallId: 'c1', toolName: 'm1__search', args: {}, result: {}, serverName: 'Notion' },
        ])
      )
    ).toEqual(['gruenerator_search']);
  });

  it('ohne Thread ist die Liste leer', () => {
    expect(priorToolNames(null)).toEqual([]);
  });
});

describe('isLookupTool', () => {
  it('web_search schlägt nach', () => {
    expect(isLookupTool('web_search')).toBe(true);
  });

  it.each(['edit_document', 'gruenerator_examples_search', 'rezept_laden', 'ask_human'])(
    '%s nicht',
    (name) => {
      expect(isLookupTool(name)).toBe(false);
    }
  );
});

describe('priorTurnRetrievalFailed', () => {
  const step = (toolName: string, ok: boolean): PersistedStep => ({
    toolCallId: `c-${toolName}`,
    toolName,
    args: {},
    result: ok ? { results: [] } : { error: 'Notebook nicht gefunden oder kein Zugriff.' },
    ...(ok ? {} : { ok: false as const }),
  });

  it('jeder Abruf gescheitert → true (#3778: zweimal notebooks)', () => {
    expect(priorTurnRetrievalFailed([step('notebooks', false), step('notebooks', false)])).toBe(
      true
    );
  });

  it('ein Abruf gelang → false, der Turn hat etwas zum Mitführen', () => {
    expect(priorTurnRetrievalFailed([step('notebooks', false), step('web_search', true)])).toBe(
      false
    );
  });

  it('nur gescheiterte Aktionen → false, es wurde nichts zu holen versucht', () => {
    expect(priorTurnRetrievalFailed([step('generate_image', false)])).toBe(false);
  });

  it('kein Schritt → false', () => {
    expect(priorTurnRetrievalFailed([])).toBe(false);
  });

  it('ein gelungenes Rezept oder Gerüst verdeckt die gescheiterten Abrufe nicht', () => {
    expect(
      priorTurnRetrievalFailed([
        step('rezept_laden', true),
        step('gruenerator_examples_search', true),
        step('notebooks', false),
      ])
    ).toBe(true);
  });

  it('ein gescheitertes Verbindungs-Werkzeug bleibt dem MCP-Anschluss', () => {
    expect(priorTurnRetrievalFailed([{ ...step('m1__search', false), serverName: 'Notion' }])).toBe(
      false
    );
  });
});

/**
 * Was ein Folge-Turn von den Werkzeugen des vorigen wiedersieht.
 *
 * Die Beispiel-Korpora sind EINMALIGES GERÜST: sechs volle Pressemitteilungen,
 * damit der erste Entwurf den Ton trifft. Ab dem zweiten Turn arbeitet der
 * Nutzer am ENTWURF, nicht an den Vorlagen — die dann bloss das Fenster füllen
 * (live 78.044 Zeichen, am 500er-Cap zu einem JSON-Bruchstück zerschnitten).
 */
describe('buildToolReplay — was wiederkommt und was nicht', () => {
  function step(toolName: string, id = toolName): PersistedStep {
    return { toolCallId: id, toolName, args: {}, result: { ok: true } };
  }

  const catalog = {
    gruenerator_search: {},
    web_search: {},
    gruenerator_examples_search: {},
    gruenerator_pressemitteilung_examples: {},
    create_document: {},
  } as unknown as ToolSet;

  async function replayFor(steps: PersistedStep[]): Promise<string[]> {
    const messages = await buildToolReplay({
      threadId: 't1',
      tools: catalog,
      toolHistory: { toolSteps: () => steps } as never,
      onError: () => {},
    });
    const assistant = messages.find((m) => m.role === 'assistant');
    if (!assistant || !Array.isArray(assistant.content)) return [];
    return assistant.content.map((part) => (part as { toolName: string }).toolName);
  }

  it('lässt die Beispiel-Korpora draussen, echte Recherche aber drin', async () => {
    const names = await replayFor([
      step('gruenerator_pressemitteilung_examples'),
      step('gruenerator_examples_search'),
      step('gruenerator_search'),
      step('web_search'),
    ]);
    expect(names).toEqual(['gruenerator_search', 'web_search']);
  });

  it('baut gar keinen Block, wenn NUR Gerüst-Werkzeuge liefen', async () => {
    // Der Testlauf vom 23.08.: ein Turn, der ausschliesslich Vorlagen holte.
    // Vorher stand hier ein abgeschnittenes JSON-Bruchstück im Kontext.
    expect(await replayFor([step('gruenerator_pressemitteilung_examples')])).toEqual([]);
  });

  it('schliesst erzeugende Aktionen weiterhin aus', async () => {
    expect(await replayFor([step('create_document'), step('gruenerator_search')])).toEqual([
      'gruenerator_search',
    ]);
  });
});

describe('assembleToolCatalog — toolAllowlist', () => {
  it('reicht die Liste an den Katalog durch und montiert nichts daneben', async () => {
    const buildChatToolCatalog = vi.fn(() => ({
      tools: { notebook_quellen: { execute: async () => ({}) } },
      toolNames: ['notebook_quellen'],
    }));
    const buildRecipeCatalog = vi.fn(async () => [
      { mention: 'presse', title: 'PM', description: 'PM', source: 'system' as const },
    ]);
    const assembled = await assembleToolCatalog(
      {
        state: fakeState(),
        sourceRegistry: createSourceRegistry(),
        sse: fakeSse().sse,
        threadId: 't1',
        toolAllowlist: ['notebook_quellen'],
      },
      deps({
        buildChatToolCatalog:
          buildChatToolCatalog as unknown as CatalogDeps['buildChatToolCatalog'],
        buildRecipeCatalog,
      })
    );
    expect(buildChatToolCatalog.mock.calls[0]![0]).toMatchObject({
      toolAllowlist: ['notebook_quellen'],
    });
    expect(Object.keys(assembled.tools)).toEqual(['notebook_quellen']);
    expect(buildRecipeCatalog).not.toHaveBeenCalled();
  });
});

describe('priorLookups (#3931)', () => {
  it('liefert nur eigene Abrufe, mit Begriff, Trefferzahl und Ausgang', () => {
    const steps: PersistedStep[] = [
      {
        toolCallId: 'a',
        toolName: 'find_content',
        args: { action: 'search', query: ' Wärmepumpe ' },
        result: { resultCount: 0, results: [] },
      },
      { toolCallId: 'b', toolName: 'sharepic', args: {}, result: {} },
      { toolCallId: 'c', toolName: 'rezept_laden', args: {}, result: {} },
      {
        toolCallId: 'd',
        toolName: 'm1__search',
        args: { query: 'x' },
        result: {},
        serverName: 'Notion',
      },
      {
        toolCallId: 'e',
        toolName: 'web_search',
        args: { query: 'Solar' },
        result: { error: 'down' },
        ok: false,
      },
      {
        toolCallId: 'f',
        toolName: 'scrape_url',
        args: { url: 'https://example.org' },
        result: { results: [{}, {}] },
      },
    ];
    expect(priorLookups(steps)).toEqual([
      { toolName: 'find_content', query: 'Wärmepumpe', resultCount: 0, failed: false },
      { toolName: 'web_search', query: 'Solar', resultCount: null, failed: true },
      { toolName: 'scrape_url', query: 'https://example.org', resultCount: 2, failed: false },
    ]);
  });
});
