/**
 * What the server ADVERTISES, independent of what the tools then do: which
 * collections are reachable, which capabilities are declared, and whether the
 * method is discoverable at all.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { getMcpExposedCollections } from '../../config/systemCollectionsConfig.js';

vi.mock('../../services/notebook/NotebookQAService.js', () => ({
  notebookQAService: { askSingleCollection: vi.fn() },
}));
vi.mock('../../database/services/NotebookQdrantHelper.js', () => ({
  NotebookQdrantHelper: class {},
}));
vi.mock('../../services/user/ProfileService.js', () => ({
  getProfileService: () => ({ getProfileById: vi.fn() }),
}));
vi.mock('../../services/monitor/UmfragenService.js', () => ({ lookupUmfragen: vi.fn() }));
vi.mock('../chat/agents/directSearchExecutors.js', () => ({
  executeDirectSearch: vi.fn(),
  executeDirectExamplesSearch: vi.fn(),
  executeDirectPressemitteilungExamples: vi.fn(),
}));
vi.mock('../chat/services/intentExecutionService.js', () => ({
  runBoardGeneration: vi.fn(),
  runDocGeneration: vi.fn(),
}));

const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js');
const { buildAuthenticatedMcpServer } = await import('./serverFactory.js');

interface Built {
  tools: Map<string, { config: Record<string, unknown> }>;
  prompts: Map<string, { config: Record<string, unknown> }>;
  resources: Map<string, string>;
}

function build(scopes: string[]): Built {
  const out: Built = { tools: new Map(), prompts: new Map(), resources: new Map() };
  const spies = [
    vi.spyOn(McpServer.prototype, 'registerTool').mockImplementation((name, config) => {
      out.tools.set(name as string, { config: config as Record<string, unknown> });
      return {} as never;
    }),
    vi.spyOn(McpServer.prototype, 'registerPrompt').mockImplementation((name, config) => {
      out.prompts.set(name as string, { config: config as Record<string, unknown> });
      return {} as never;
    }),
    vi.spyOn(McpServer.prototype, 'registerResource').mockImplementation((name, uri) => {
      out.resources.set(name as string, uri as string);
      return {} as never;
    }),
  ];
  try {
    buildAuthenticatedMcpServer({
      userId: 'user-1',
      scopes: new Set(scopes),
      req: { app: { locals: {} } } as never,
    });
  } finally {
    spies.forEach((s) => s.mockRestore());
  }
  return out;
}

/** `collection` is an enum behind a `.default()` on one tool and bare on the
 *  other; read the options through the wrapper so both are comparable. */
function enumOptions(built: Built, tool: string, field: string): string[] {
  const shape = built.tools.get(tool)?.config.inputSchema as
    | Record<string, { options?: string[]; removeDefault?: () => { options?: string[] } }>
    | undefined;
  const entry = shape?.[field];
  if (!entry) throw new Error(`${tool}.${field} not registered`);
  const inner = typeof entry.removeDefault === 'function' ? entry.removeDefault() : entry;
  return inner.options ?? [];
}

beforeEach(() => vi.clearAllMocks());

describe('search collections', () => {
  it('offers every mcp-exposed collection, not the chat agent’s narrower list', () => {
    // The chat allow-list has eight entries; the canonical config marks far
    // more as exposed, and v1 has served them all along.
    const expected = getMcpExposedCollections()
      .map((c) => c.key)
      .filter((k) => k !== 'examples')
      .sort();

    expect(enumOptions(build(['search']), 'gruenerator_search', 'collection')).toEqual(expected);
    expect(expected.length).toBeGreaterThan(15);
  });

  it('reaches the Landesverbände, which the chat list omits', () => {
    const options = enumOptions(build(['search']), 'gruenerator_search', 'collection');
    for (const lv of ['hamburg', 'bayern', 'berlin', 'thueringen']) {
      expect(options).toContain(lv);
    }
  });

  it('offers the same collections for filter discovery as for search', () => {
    const built = build(['search']);
    expect(enumOptions(built, 'gruenerator_get_filters', 'collection')).toEqual(
      enumOptions(built, 'gruenerator_search', 'collection')
    );
  });
});

describe('method discovery', () => {
  it('publishes prompts and resources even to a connection with no scopes', () => {
    // A client reads the method before it has anything to search. Die
    // Agenten-Prompts hängen aus demselben Grund an keinem Scope: sie sind
    // reiner Text und geben nichts frei.
    const built = build([]);
    const prompts = [...built.prompts.keys()];
    expect(prompts).toContain('recherche');
    expect(prompts).toContain('notizbuch-antwort');
    expect(built.resources.get('methode')).toBe('gruenerator://methode');
    expect(built.resources.get('sammlungen')).toBe('gruenerator://sammlungen');
  });

  it('trägt die Agenten als Prompts ohne den gruenerator-Präfix', () => {
    const prompts = [...build([]).prompts.keys()];
    // Der Präfix ist eine Registry-Konvention, kein Teil des Prompt-Namens —
    // und die Namen sind F0: eine Client-Konfiguration nennt sie wörtlich.
    expect(prompts.some((p) => p.startsWith('gruenerator-'))).toBe(false);
    expect(prompts).toContain('wahlprogramm');
    expect(prompts).toContain('universal');
  });

  it('points the search tool at the method rather than restating it', () => {
    const description = build(['search']).tools.get('gruenerator_search')!.config
      .description as string;
    expect(description).toContain('gruenerator://methode');
    expect(description).toContain('gruenerator://sammlungen');
  });

  it('registers filter discovery only together with the search scope', () => {
    expect(build(['search']).tools.has('gruenerator_get_filters')).toBe(true);
    expect(build(['content:read']).tools.has('gruenerator_get_filters')).toBe(false);
  });
});
