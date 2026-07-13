import { describe, it, expect, vi, beforeEach } from 'vitest';

import { createSourceRegistry } from '../services/agenticLoop/sourceRegistry.js';

import { buildChatToolCatalog } from './toolCatalog.js';

import type { AgentConfig } from './types.js';
import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';

// createSearchTools is mocked to return the two source-harvest tools with
// controllable executes, so we can assert the harvest decorator against the
// REAL DirectSearch/DirectWebSearch result shape (text in `excerpt`/`snippet`,
// NOT `content`). Mocking it to `{}` (the old test) hid that the decorator read
// the wrong field and silently registered nothing.
const searchExec = vi.hoisted(() => vi.fn<(i: unknown, o: unknown) => Promise<unknown>>());
const webExec = vi.hoisted(() => vi.fn<(i: unknown, o: unknown) => Promise<unknown>>());
vi.mock('./searchTools.js', () => ({
  createSearchTools: () => ({
    gruenerator_search: { description: 'd', inputSchema: {}, execute: searchExec },
    web_search: { description: 'd', inputSchema: {}, execute: webExec },
  }),
}));

const validateUrlForFetch = vi.fn<(u: string) => Promise<unknown>>();
const selectAndCrawlTopUrls = vi.fn<(s: unknown, q: unknown, o: unknown) => Promise<unknown>>();
vi.mock('../../../utils/validation/urlSecurity.js', () => ({
  validateUrlForFetch: (u: string) => validateUrlForFetch(u),
}));
vi.mock('../../../services/search/index.js', () => ({
  selectAndCrawlTopUrls: (seeds: unknown, q: unknown, opts: unknown) =>
    selectAndCrawlTopUrls(seeds, q, opts),
}));

const agentConfig = { identifier: 'test' } as unknown as AgentConfig;

type Exec = (i: unknown, o: { toolCallId: string }) => Promise<unknown>;
function execOf(tool: unknown): Exec {
  return (tool as { execute: Exec }).execute;
}

describe('toolCatalog source harvesting (excerpt/snippet → content)', () => {
  beforeEach(() => {
    searchExec.mockReset();
    webExec.mockReset();
  });

  it('registers document results whose text lives in `excerpt`, not `content`', async () => {
    // Exact executeDirectSearch shape (see DirectSearchResult): items have
    // `excerpt`, no `content`. Regression guard for the sources=0 bug.
    searchExec.mockResolvedValue({
      collection: 'grundsatz',
      query: 'Klima',
      resultsCount: 2,
      results: [
        {
          rank: 1,
          relevance: 'high',
          source: 'Grundsatzprogramm',
          url: 'https://gruene.de/x',
          excerpt: 'Klimaneutralität bis 2045.',
          searchMethod: 'vector',
        },
        {
          rank: 2,
          relevance: 'mid',
          source: 'Grundsatzprogramm',
          excerpt: 'Kohleausstieg bis 2030.',
        },
      ],
    });
    const sourceRegistry = createSourceRegistry();
    const { tools } = buildChatToolCatalog({ agentConfig, sourceRegistry });
    const out = (await execOf(tools.gruenerator_search)(
      { query: 'Klima', collection: 'grundsatz', limit: 5 },
      { toolCallId: 'c1' }
    )) as { resultCount: number; sources: string };

    expect(out.resultCount).toBe(2);
    expect(sourceRegistry.size).toBe(2); // ← was 0 before the fix
    expect(out.sources).toContain('[1]');
    expect(out.sources).toContain('Klimaneutralität'); // the excerpt actually reached the model
  });

  it('registers web results whose text lives in `snippet`', async () => {
    webExec.mockResolvedValue({
      query: 'Tempolimit',
      searchType: 'general',
      resultsCount: 1,
      results: [
        {
          rank: 1,
          title: 'Grüne fordern Tempolimit',
          url: 'https://news.example/t',
          snippet: 'Ein Tempolimit von 130 km/h spart CO₂.',
          domain: 'news.example',
        },
      ],
    });
    const sourceRegistry = createSourceRegistry();
    const { tools } = buildChatToolCatalog({ agentConfig, sourceRegistry });
    const out = (await execOf(tools.web_search)({ query: 'Tempolimit' }, { toolCallId: 'c1' })) as {
      resultCount: number;
      sources: string;
    };

    expect(out.resultCount).toBe(1);
    expect(sourceRegistry.size).toBe(1);
    expect(out.sources).toContain('Tempolimit von 130');
  });

  it('reports 0 sources only when the tool genuinely returned no results', async () => {
    searchExec.mockResolvedValue({
      collection: 'grundsatz',
      query: 'x',
      resultsCount: 0,
      results: [],
    });
    const sourceRegistry = createSourceRegistry();
    const { tools } = buildChatToolCatalog({ agentConfig, sourceRegistry });
    await execOf(tools.gruenerator_search)({ query: 'x' }, { toolCallId: 'c1' });
    expect(sourceRegistry.size).toBe(0);
  });
});

describe('toolCatalog domain tool mounting', () => {
  function catalogFor(intent: string) {
    const sourceRegistry = createSourceRegistry();
    const sse = { send: () => {} } as unknown as NonNullable<
      Parameters<typeof buildChatToolCatalog>[0]['loop']
    >['sse'];
    const state = { intent, enabledTools: {} } as unknown as ChatGraphState;
    return buildChatToolCatalog({ agentConfig, sourceRegistry, loop: { sse, state } });
  }

  it('mounts bundestag/abgeordnetenwatch/summarize regardless of the classified intent', () => {
    // The classifier routinely mislabels Bundestag/politician questions as
    // `search`; the loop must still expose those tools so the model can pick.
    const { toolNames } = catalogFor('search');
    expect(toolNames).toEqual(
      expect.arrayContaining(['bundestag', 'abgeordnetenwatch', 'summarize'])
    );
  });

  it('mounts generate_image only for image + demoted agentic turns (expensive + rate-limited)', () => {
    expect(catalogFor('search').toolNames).not.toContain('generate_image');
    expect(catalogFor('image').toolNames).toContain('generate_image');
    // Demoted turns can be image asks the confident heuristic missed.
    expect(catalogFor('agentic').toolNames).toContain('generate_image');
  });

  it('mounts no domain tools without a loop context (unit-test / non-loop path)', () => {
    const sourceRegistry = createSourceRegistry();
    const { toolNames } = buildChatToolCatalog({ agentConfig, sourceRegistry });
    expect(toolNames).not.toContain('bundestag');
    expect(toolNames).not.toContain('summarize');
  });

  // Sharepic fat tool (Phase 3n slice): every leg of the mount gate matters —
  // a wrong mount either breaks the fixed-text contract (mounted on pure
  // sharepic turns) or the compound feature (not mounted when it should be).
  function sharepicCatalog(opts: {
    intent?: string;
    compoundGeneration?: boolean;
    req?: boolean;
    enabledTools?: Record<string, boolean>;
  }) {
    const sourceRegistry = createSourceRegistry();
    const sse = { send: () => {} } as unknown as NonNullable<
      Parameters<typeof buildChatToolCatalog>[0]['loop']
    >['sse'];
    const state = {
      intent: opts.intent ?? 'sharepic',
      enabledTools: opts.enabledTools ?? {},
      compoundGeneration: opts.compoundGeneration,
    } as unknown as ChatGraphState;
    return buildChatToolCatalog({
      agentConfig,
      sourceRegistry,
      loop: {
        sse,
        state,
        ...(opts.req === false ? {} : { req: {} as never }),
        threadId: 't1',
      },
    });
  }

  it('mounts the sharepic fat tool ONLY on compound-generation turns with a req', () => {
    expect(sharepicCatalog({ compoundGeneration: true }).toolNames).toContain('sharepic');
    // Not compound → fixed-text single-pass contract, never mounted.
    expect(sharepicCatalog({ compoundGeneration: false }).toolNames).not.toContain('sharepic');
    expect(sharepicCatalog({}).toolNames).not.toContain('sharepic');
    // Without the Express req the generator cannot run — never mounted.
    expect(sharepicCatalog({ compoundGeneration: true, req: false }).toolNames).not.toContain(
      'sharepic'
    );
    // User disabled the sharepic tool → respected.
    expect(
      sharepicCatalog({ compoundGeneration: true, enabledTools: { sharepic: false } }).toolNames
    ).not.toContain('sharepic');
  });

  it('the fat tool key is exactly `sharepic` (persisted toolName drives card rehydration)', () => {
    const { tools } = sharepicCatalog({ compoundGeneration: true });
    expect(Object.keys(tools)).toContain('sharepic');
    expect(Object.keys(tools)).not.toContain('create_sharepic');
  });

  // Presentation/sheet fat tools mount under the intent-matching key, only on a
  // compound turn with a req, and never cross-mount (a presentation turn must
  // NOT expose the sheet tool or the sharepic tool).
  it('mounts create_presentation / create_sheet only on the matching compound intent', () => {
    expect(
      sharepicCatalog({ intent: 'create_presentation', compoundGeneration: true }).toolNames
    ).toContain('create_presentation');
    expect(
      sharepicCatalog({ intent: 'create_sheet', compoundGeneration: true }).toolNames
    ).toContain('create_sheet');
    // Not compound → single-pass handler owns it, never mounted.
    expect(
      sharepicCatalog({ intent: 'create_presentation', compoundGeneration: false }).toolNames
    ).not.toContain('create_presentation');
    // No req → generator can't run.
    expect(
      sharepicCatalog({ intent: 'create_sheet', compoundGeneration: true, req: false }).toolNames
    ).not.toContain('create_sheet');
    // User disabled → respected.
    expect(
      sharepicCatalog({
        intent: 'create_presentation',
        compoundGeneration: true,
        enabledTools: { create_presentation: false },
      }).toolNames
    ).not.toContain('create_presentation');
  });

  it('generation fat tools never cross-mount across intents', () => {
    const pres = sharepicCatalog({
      intent: 'create_presentation',
      compoundGeneration: true,
    }).toolNames;
    expect(pres).toContain('create_presentation');
    expect(pres).not.toContain('create_sheet');
    expect(pres).not.toContain('sharepic');
    const sheet = sharepicCatalog({ intent: 'create_sheet', compoundGeneration: true }).toolNames;
    expect(sheet).not.toContain('create_presentation');
    expect(sheet).not.toContain('sharepic');
  });
});

describe('toolCatalog scrape_url', () => {
  beforeEach(() => {
    validateUrlForFetch.mockReset();
    selectAndCrawlTopUrls.mockReset();
  });

  function scrapeTool() {
    const sourceRegistry = createSourceRegistry();
    const { tools } = buildChatToolCatalog({ agentConfig, sourceRegistry });
    return { execute: execOf(tools.scrape_url), sourceRegistry };
  }

  it('rejects when no URL passes SSRF validation (never crawls)', async () => {
    validateUrlForFetch.mockResolvedValue({ isValid: false, error: 'Host is blocked' });
    const { execute } = scrapeTool();
    const out = (await execute({ urls: ['http://169.254.169.254/'] }, { toolCallId: 'c1' })) as {
      error?: string;
    };
    expect(out.error).toBeTruthy();
    expect(selectAndCrawlTopUrls).not.toHaveBeenCalled();
  });

  it('crawls validated URLs and registers content as sources', async () => {
    validateUrlForFetch.mockImplementation(async (u: string) => ({
      isValid: true,
      url: new URL(u),
    }));
    selectAndCrawlTopUrls.mockResolvedValue([
      { url: 'https://example.com/', crawled: true, fullContent: 'Hallo Welt Inhalt' },
    ]);
    const { execute, sourceRegistry } = scrapeTool();
    const out = (await execute({ urls: ['https://example.com/'] }, { toolCallId: 'c1' })) as {
      resultCount?: number;
      sources?: string;
    };
    expect(out.resultCount).toBe(1);
    expect(out.sources).toMatch(/^\[1\]/);
    expect(sourceRegistry.size).toBe(1);
  });

  it('returns an error result when nothing could be crawled', async () => {
    validateUrlForFetch.mockImplementation(async (u: string) => ({
      isValid: true,
      url: new URL(u),
    }));
    selectAndCrawlTopUrls.mockResolvedValue([
      { url: 'https://example.com/', crawled: false, crawlError: 'timeout' },
    ]);
    const { execute } = scrapeTool();
    const out = (await execute({ urls: ['https://example.com/'] }, { toolCallId: 'c1' })) as {
      error?: string;
    };
    expect(out.error).toMatch(/nicht lesen/);
  });
});
