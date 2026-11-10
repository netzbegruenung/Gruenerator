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
import { jsonSchema, tool } from 'ai';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  assembleToolCatalog,
  buildToolReplay,
  isLookupTool,
  priorToolNames,
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

const stubTool = (execute: () => Promise<unknown>) =>
  tool({ inputSchema: jsonSchema({ type: 'object' }), execute });

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
    buildRecipeCatalog: async () => [],
    resolveRecipe: async () => null,
    ...over,
  } as unknown as CatalogDeps;
}

function assemble(
  state: ChatGraphState,
  d: CatalogDeps,
  opts: { threadId?: string | null; sse?: SSEWriter; resumedSteps?: PersistedStep[] } = {}
) {
  return assembleToolCatalog(
    {
      state,
      sourceRegistry: createSourceRegistry(),
      sse: opts.sse ?? fakeSse().sse,
      threadId: opts.threadId ?? null,
      ...(opts.resumedSteps && { resumedSteps: opts.resumedSteps }),
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
  it('verwirft eine veraltete Klebe-Scope — kein ungescopter Rückgriff', async () => {
    getThreadLastMcpServer.mockResolvedValue('server-weg');
    const loadMcpCatalog = vi.fn(async () => mcpCatalog({ scopedServerMissing: true }));

    const assembled = await assemble(fakeState({ intent: 'agentic' }), deps({ loadMcpCatalog }), {
      threadId: 't1',
    });

    expect(loadMcpCatalog).toHaveBeenCalledTimes(1);
    expect(loadMcpCatalog).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', scope: 'server-weg', threadId: 't1' })
    );
    expect(assembled.mcpCatalog).toBeNull();
    expect(setThreadLastMcpServer).not.toHaveBeenCalled();
  });

  it('montiert ohne Scope nichts', async () => {
    const loadMcpCatalog = vi.fn(async () => mcpCatalog());

    const assembled = await assemble(fakeState({ intent: 'agentic' }), deps({ loadMcpCatalog }), {
      threadId: 't1',
    });

    expect(loadMcpCatalog).not.toHaveBeenCalled();
    expect(assembled.mcpCatalog).toBeNull();
  });

  it('lädt auch einen bekannten Konnektor über den einen Lader und merkt sich die Zeile', async () => {
    // Ein angehefteter Konnektor aus dem localStorage schickt noch den alten
    // Alias; der Klebe-Scope soll danach die Zeilen-ID tragen.
    const loadMcpCatalog = vi.fn(async () =>
      mcpCatalog({
        tools: { wetter__forecast: stubTool(async () => ({})) },
        labels: new Map([['wetter__forecast', { serverName: 'Wetter', toolName: 'forecast' }]]),
        resolvedServerId: 'row-wetter',
      })
    );

    const assembled = await assemble(
      fakeState({ intent: 'agentic', mcpServerScope: 'system-wetter' }),
      deps({ loadMcpCatalog }),
      { threadId: 't1' }
    );

    expect(loadMcpCatalog).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', scope: 'system-wetter', threadId: 't1' })
    );
    expect(Object.keys(assembled.tools)).toContain('wetter__forecast');
    expect(setThreadLastMcpServer).toHaveBeenCalledWith('t1', 'row-wetter');
  });

  it('hängt an den Klebe-Scope-Schreiber ein catch — eine Ablehnung beendet sonst den Prozess', async () => {
    // 10.11.2026: `system-rateo` in einer uuid-Spalte → 22P02, und das nackte
    // `void` beendete den API-Prozess. Vitest fängt unbehandelte Ablehnungen
    // selbst ab, deshalb prüft der Test das catch direkt an der Promise.
    const write = Promise.reject(new Error('22P02'));
    const caught = vi.spyOn(write, 'catch');
    setThreadLastMcpServer.mockReturnValue(write);
    await assemble(
      fakeState({ intent: 'agentic', mcpServerScope: 'system-wetter' }),
      deps({
        loadMcpCatalog: async () =>
          mcpCatalog({
            tools: { wetter__forecast: stubTool(async () => ({})) },
            labels: new Map([['wetter__forecast', { serverName: 'Wetter', toolName: 'forecast' }]]),
          }),
      }),
      { threadId: 't1' }
    );
    expect(setThreadLastMcpServer).toHaveBeenCalledWith('t1', 'system-wetter');
    expect(caught).toHaveBeenCalled();
  });

  it('montiert auf anderen Intents auch mit Klebe-Scope nichts', async () => {
    getThreadLastMcpServer.mockResolvedValue('sally');
    const loadMcpCatalog = vi.fn(async () => mcpCatalog());

    await assemble(fakeState({ intent: 'web' }), deps({ loadMcpCatalog }), { threadId: 't1' });

    expect(loadMcpCatalog).not.toHaveBeenCalled();
  });

  // `mcp` erzeugt seit #4043 niemand mehr, aber ein vor dem Deploy pausierter
  // Freigabe-Zug kommt mit seinem gespeicherten Zustand zurück.
  it('montiert für einen gespeicherten `mcp`-Zustand weiter', async () => {
    const loadMcpCatalog = vi.fn(async () => mcpCatalog());

    await assemble(fakeState({ intent: 'mcp', mcpServerScope: 'sally' }), deps({ loadMcpCatalog }));

    expect(loadMcpCatalog).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', scope: 'sally', threadId: null })
    );
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
      tools: { sally_ticket: stubTool(async () => ({})) },
      labels: new Map([['sally_ticket', { serverName: 'Sally', toolName: 'ticket' }]]),
    });
    await assemble(
      fakeState({ intent: 'agentic', mcpServerScope: 'sally' }),
      deps({ loadMcpCatalog: async () => withTools }),
      { threadId: 't1' }
    );
    expect(setThreadLastMcpServer).toHaveBeenCalledWith('t1', 'sally');

    setThreadLastMcpServer.mockClear();
    await assemble(
      fakeState({ intent: 'agentic', mcpServerScope: 'sally' }),
      deps({ loadMcpCatalog: async () => mcpCatalog() }),
      { threadId: 't1' }
    );
    expect(setThreadLastMcpServer).not.toHaveBeenCalled();
  });

  it('meldet abgedriftete Dienste als Warnung an den Client', async () => {
    const { sse, sent } = fakeSse();
    await assemble(
      fakeState({ intent: 'agentic', mcpServerScope: 'sally' }),
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
      fakeState({ intent: 'agentic', agentConfig: { identifier: 'x' } }),
      deps({ loadMcpCatalog })
    );
    expect(loadMcpCatalog).not.toHaveBeenCalled();
  });
});

describe('assembleToolCatalog — Rezept-Werkzeug', () => {
  const catalog = [
    {
      key: 'presse',
      mention: 'presse',
      title: 'Pressemitteilung',
      description: 'PM',
      source: 'system' as const,
      id: null,
      origin: 'system' as const,
      ownerName: null,
    },
  ];
  const withRecipes = (over: Partial<CatalogDeps> = {}) =>
    deps({ buildRecipeCatalog: async () => catalog, ...over });

  it('montiert rezept_laden, wenn nichts die Textform schon festlegt', async () => {
    const assembled = await assemble(fakeState(), withRecipes());
    expect(assembled.tools.rezept_laden).toBeDefined();
    expect(assembled.recipeCatalog).toHaveLength(1);
  });

  // Ein Methoden-Rezept (`@bundestag`) gibt keine Form vor — die Textsorte
  // bleibt offen, und das Modell muss sie selbst laden können.
  it('montiert methode_laden nur, wenn der Katalog eine Methode trägt, und scoped es aus späteren Schritten', async () => {
    const without = await assemble(fakeState(), withRecipes());
    expect(without.tools.methode_laden).toBeUndefined();

    const rechtsstand = { ...catalog[0]!, key: 'rechtsstand', mention: 'rechtsstand' };
    const assembled = await assemble(
      fakeState(),
      withRecipes({ buildRecipeCatalog: async () => [...catalog, rechtsstand] })
    );
    expect(assembled.tools.methode_laden).toBeDefined();
    // Nur der erzwungene erste Schritt wählt es selbst; sonst fehlt es im Umfang.
    expect(assembled.toolScope.activeTools([])).not.toContain('methode_laden');
    expect(assembled.toolScope.activeTools([])).toContain('rezept_laden');
  });

  it('montiert rezept_laden weiter, wenn nur ein Methoden-Rezept aktiv ist', async () => {
    const assembled = await assemble(
      fakeState({ methodSkillMentions: ['bundestagsrecherche'] }),
      withRecipes({
        resolveRecipe: async ({ mention }) => ({
          title: `Titel ${mention}`,
          body: 'Methodenrumpf',
          source: 'system',
        }),
      } as Partial<CatalogDeps>)
    );
    expect(assembled.tools.rezept_laden).toBeDefined();
    expect(assembled.recipeRegistry.mentions).toEqual(['bundestagsrecherche']);
    expect(assembled.recipeRegistry.render()).toContain(
      '## RECHERCHE-METHODE: Titel bundestagsrecherche'
    );
  });

  it('legt die Methode neben eine gewählte Textsorte und lässt rezept_laden offen', async () => {
    const assembled = await assemble(
      fakeState({ activeSkillMention: 'presse', methodSkillMentions: ['bundestagsrecherche'] }),
      withRecipes({
        buildRecipeCatalog: async () => [
          ...catalog,
          { ...catalog[0]!, mention: 'instagram', title: 'Instagram' },
        ],
        resolveRecipe: async ({ mention }) => ({
          id: null,
          mention,
          title: `Titel ${mention}`,
          body: 'Methodenrumpf',
          source: 'system',
        }),
      } as Partial<CatalogDeps>)
    );
    expect(assembled.tools.rezept_laden).toBeDefined();
    expect(assembled.recipeRegistry.mentions).toEqual(['presse', 'bundestagsrecherche']);
  });

  // #5479: nach einer ask_human-Rückfrage schrieb die Fortsetzung ohne das
  // Rezept, das der pausierte Zug geladen hatte — „Lücke lassen" ergab dann
  // „Wir prüfen derzeit …" statt eines Platzhalters.
  it('lädt die Rezepte des pausierten Zuges bei der Fortsetzung wieder', async () => {
    const step = (result: Record<string, unknown>): PersistedStep => ({
      toolCallId: 'c1',
      toolName: 'rezept_laden',
      args: { rezept: 'buergermail' },
      result,
    });
    const assembled = await assemble(
      fakeState(),
      withRecipes({
        resolveRecipe: async ({ mention }) => ({
          title: `Titel ${mention}`,
          body: 'Rezeptrumpf',
          source: 'system',
        }),
      } as Partial<CatalogDeps>),
      {
        resumedSteps: [
          step({ rezept: 'buergermail', geladen: true }),
          step({ rezept: 'presse', geladen: false, grund: 'abgelehnt' }),
        ],
      }
    );
    expect(assembled.recipeRegistry.mentions).toEqual(['buergermail']);
    expect(assembled.recipeRegistry.render()).toContain('Rezeptrumpf');
  });

  it('lädt ein gespeichertes fremdes Rezept über Zeilen-id statt über die Mention neu', async () => {
    const LIB_ID = 'aaaaaaaa-1111-4111-8111-111111111111';
    const resolveRecipe = vi.fn(
      async ({ mention, recipeId }: { mention: string | null; recipeId?: string | null }) =>
        recipeId === LIB_ID
          ? {
              id: LIB_ID,
              mention: mention ?? 'presse',
              title: 'Fremd',
              body: 'Fremdrumpf',
              source: 'user' as const,
            }
          : {
              id: null,
              mention: mention ?? 'presse',
              title: 'Sys',
              body: 'Sysrumpf',
              source: 'system' as const,
            }
    );
    const assembled = await assemble(
      fakeState(),
      withRecipes({ resolveRecipe } as unknown as Partial<CatalogDeps>),
      {
        resumedSteps: [
          {
            toolCallId: 'c1',
            toolName: 'rezept_laden',
            args: { rezept: 'presse-aaaaaa' },
            // Doppelt: zweimal dasselbe geladene Rezept darf nur einmal landen.
            result: { rezept: 'presse-aaaaaa', mention: 'presse', rezeptId: LIB_ID, geladen: true },
          },
          {
            toolCallId: 'c2',
            toolName: 'rezept_laden',
            args: { rezept: 'presse-aaaaaa' },
            result: { rezept: 'presse-aaaaaa', mention: 'presse', rezeptId: LIB_ID, geladen: true },
          },
        ],
      }
    );
    expect(resolveRecipe).toHaveBeenCalledTimes(1);
    expect(resolveRecipe).toHaveBeenCalledWith(
      expect.objectContaining({ mention: 'presse', recipeId: LIB_ID })
    );
    expect(assembled.recipeRegistry.size).toBe(1);
    expect(assembled.recipeRegistry.has(LIB_ID)).toBe(true);
    expect(assembled.recipeRegistry.render()).toContain('Fremdrumpf');
  });

  it('montiert es NICHT, wenn der Katalog leer ist', async () => {
    const assembled = await assemble(fakeState(), deps({ buildRecipeCatalog: async () => [] }));
    expect(assembled.tools.rezept_laden).toBeUndefined();
    expect(assembled.recipeCatalog).toEqual([]);
  });

  const resolvePinned = async ({
    mention,
    recipeId,
  }: {
    mention: string | null;
    recipeId?: string | null;
  }) => ({
    id: recipeId ?? null,
    mention: mention ?? 'presse',
    title: 'Pressemitteilung',
    body: 'Pinnrumpf',
    source: 'system' as const,
  });

  it('montiert rezept_laden neben einem erwähnten Rezept und lässt es aus dem Katalog', async () => {
    const buildRecipeCatalog = vi.fn(async () => [
      ...catalog,
      {
        key: 'instagram',
        mention: 'instagram',
        title: 'Instagram',
        description: 'Post',
        source: 'system' as const,
        id: null,
        origin: 'system' as const,
        ownerName: null,
      },
    ]);
    const assembled = await assemble(
      fakeState({ activeSkillMention: 'presse' }),
      withRecipes({ buildRecipeCatalog, resolveRecipe: resolvePinned } as Partial<CatalogDeps>)
    );
    expect(buildRecipeCatalog).toHaveBeenCalled();
    expect(assembled.tools.rezept_laden).toBeDefined();
    expect(assembled.recipeCatalog.map((e) => e.mention)).toEqual(['instagram']);
  });

  it('registriert das erwähnte Rezept gepinnt', async () => {
    const assembled = await assemble(
      fakeState({ activeSkillMention: 'presse' }),
      withRecipes({ resolveRecipe: resolvePinned } as Partial<CatalogDeps>)
    );
    expect(assembled.recipeRegistry.mentions).toEqual(['presse']);
    expect(assembled.recipeRegistry.pinnedTitle).toBe('Pressemitteilung');
    expect(assembled.recipeRegistry.render()).toContain('Pinnrumpf');
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

  it('montiert rezept_laden neben einem per Id gepinnten Rezept und lässt es aus dem Katalog', async () => {
    const assembled = await assemble(
      fakeState({ activeSkillMention: null, activeRecipeId: 'row-1' }),
      withRecipes({
        buildRecipeCatalog: async () => [
          { ...catalog[0]!, key: 'mein-stil', mention: 'mein-stil', id: 'row-1' },
        ],
        resolveRecipe: resolvePinned,
      } as Partial<CatalogDeps>)
    );
    expect(assembled.recipeRegistry.pinnedTitle).toBe('Pressemitteilung');
    expect(assembled.recipeCatalog).toEqual([]);
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

  // Review #5486: die Fortsetzung registriert die Wahl des Modells nicht als
  // `preloaded` — sonst stünden Default und gewählte Textsorte nebeneinander.
  it('lässt eine im pausierten Zug gewählte Textsorte den Default wieder verdrängen', async () => {
    const assembled = await assemble(
      fakeState({
        agentConfig: buergerBerlin,
        lastUserTextNoMentions: 'Frau M. fragt nach der U-Bahn …',
      }),
      withSearch(),
      {
        resumedSteps: [
          {
            toolCallId: 'c1',
            toolName: 'rezept_laden',
            args: { rezept: 'presse' },
            result: { rezept: 'presse', geladen: true },
          },
        ],
      }
    );
    expect(assembled.recipeRegistry.mentions).toEqual(['presse']);
  });

  it('lädt den Agent-Default nicht, wenn die Person selbst ein Rezept gewählt hat', async () => {
    const resolveRecipe = vi.fn();
    const assembled = await assemble(
      fakeState({
        agentConfig: buergerBerlin,
        activeSkillMention: 'presse',
        lastUserTextNoMentions: 'Schreib eine PM',
      }),
      withSearch({ resolveRecipe } as Partial<CatalogDeps>)
    );
    // Nur die Wahl wird aufgelöst, nie der Default `buerger-berlin`.
    expect(resolveRecipe).toHaveBeenCalledTimes(1);
    expect(resolveRecipe).toHaveBeenCalledWith(expect.objectContaining({ mention: 'presse' }));
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
    const assembled = await assembleToolCatalog(
      {
        state: fakeState({ intent: 'agentic', mcpServerScope: 'system-bahn' }),
        sourceRegistry: createSourceRegistry(),
        sse: fakeSse().sse,
        disableMcp: true,
        threadId: 't1',
      },
      deps({ loadMcpCatalog: loadMcp })
    );
    expect(loadMcp).not.toHaveBeenCalled();
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
    const mark = (tag: string) => stubTool(async () => tag);
    const assembled = await assemble(
      fakeState({ intent: 'agentic', mcpServerScope: 'sally' }),
      deps({
        buildChatToolCatalog: () => {
          order.push('intern');
          return {
            tools: { web_search: mark('intern'), geteilt: mark('intern') },
            toolNames: ['web_search', 'geteilt'],
          };
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
          return [
            {
              key: 'presse',
              mention: 'presse',
              title: 'PM',
              description: 'd',
              source: 'system' as const,
              id: null,
              origin: 'system' as const,
              ownerName: null,
            },
          ];
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
        getTextOffset: () => 0,
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

describe('priorToolNames', () => {
  const history = (steps: PersistedStep[]) => ({
    artifacts: () => [],
    toolSteps: () => steps,
    lastTurnToolSteps: () => [],
    lastTurnArtifacts: () => [],
    lastTurnIntent: () => null,
    lastTurnOffer: () => null,
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

  it.each([
    'edit_document',
    'gruenerator_examples_search',
    'rezept_laden',
    'ask_human',
    'meine_inhalte_laden',
    'website_werkzeug_laden',
    'parlament_werkzeuge_laden',
  ])('%s nicht', (name) => {
    expect(isLookupTool(name)).toBe(false);
  });
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

  it('ein gelungener toolScope-Lader verdeckt die gescheiterten Abrufe nicht (#3884)', () => {
    expect(
      priorTurnRetrievalFailed([
        step('meine_inhalte_laden', true),
        step('notebooks', false),
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

  it('fills the replay window with replayable steps only', async () => {
    // Oldest to newest: seven replayable steps, then the three newest are memory.
    const persisted = [
      ...[1, 2, 3, 4, 5, 6, 7].map((i) => step('web_search', `w${i}`)),
      ...[1, 2, 3].map((i) => step('memory', `m${i}`)),
    ];
    const messages = await buildToolReplay({
      threadId: 't1',
      tools: { ...catalog, memory: {} } as unknown as ToolSet,
      // Like the real projection: the newest `limit` steps, oldest first.
      toolHistory: { toolSteps: (limit = 6) => persisted.slice(-limit) } as never,
      onError: () => {},
    });
    const assistant = messages.find((m) => m.role === 'assistant');
    const ids = (assistant!.content as { toolCallId: string }[]).map((p) => p.toolCallId);
    expect(ids).toEqual(['w2', 'w3', 'w4', 'w5', 'w6', 'w7']);
  });

  it('spielt erzeugende Aktionen als Digest ein, memory bleibt draussen', async () => {
    expect(
      await replayFor([step('create_document'), step('memory'), step('gruenerator_search')])
    ).toEqual(['create_document', 'gruenerator_search']);
  });
});

describe('assembleToolCatalog — toolAllowlist', () => {
  it('reicht die Liste an den Katalog durch und montiert nichts daneben', async () => {
    const buildChatToolCatalog = vi.fn(
      (_params: Parameters<CatalogDeps['buildChatToolCatalog']>[0]) => ({
        tools: { notebook_quellen: { execute: async () => ({}) } },
        toolNames: ['notebook_quellen'],
      })
    );
    const buildRecipeCatalog = vi.fn(async () => [
      {
        key: 'presse',
        mention: 'presse',
        title: 'PM',
        description: 'PM',
        source: 'system' as const,
        origin: 'system' as const,
        id: null,
        ownerName: null,
      },
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
