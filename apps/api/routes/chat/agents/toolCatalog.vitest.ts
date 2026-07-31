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
const crawlAndDistill = vi.fn<(s: unknown, q: unknown, o: unknown) => Promise<unknown>>();
vi.mock('../../../utils/validation/urlSecurity.js', () => ({
  validateUrlForFetch: (u: string) => validateUrlForFetch(u),
}));
vi.mock('../../../services/search/index.js', () => ({
  crawlAndDistill: (seeds: unknown, q: unknown, opts: unknown) => crawlAndDistill(seeds, q, opts),
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
  function catalogFor(intent: string, userText?: string) {
    const sourceRegistry = createSourceRegistry();
    const sse = { send: () => {} } as unknown as NonNullable<
      Parameters<typeof buildChatToolCatalog>[0]['loop']
    >['sse'];
    const state = {
      intent,
      enabledTools: {},
      ...(userText ? { messages: [{ role: 'user', content: userText }] } : {}),
    } as unknown as ChatGraphState;
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

  it('mounts generate_image only for image + explicitly image-phrased agentic turns', () => {
    expect(catalogFor('search').toolNames).not.toContain('generate_image');
    expect(catalogFor('image').toolNames).toContain('generate_image');
    // Demoted turns can be image asks the confident heuristic missed …
    expect(catalogFor('agentic', 'erstelle ein Bild von einem Igel').toolNames).toContain(
      'generate_image'
    );
    // … but a demoted non-image creation must NOT get funneled into an image
    // (seen live: a Tally form request rendered as a FLUX image).
    expect(catalogFor('agentic', 'erstelle ein Anmeldeformular').toolNames).not.toContain(
      'generate_image'
    );
    expect(catalogFor('agentic').toolNames).not.toContain('generate_image');
  });

  it('mounts no domain tools without a loop context (unit-test / non-loop path)', () => {
    const sourceRegistry = createSourceRegistry();
    const { toolNames } = buildChatToolCatalog({ agentConfig, sourceRegistry });
    expect(toolNames).not.toContain('bundestag');
    expect(toolNames).not.toContain('summarize');
  });

  // Compound generation fat tools mount by KIND (state.compoundGenerationKind),
  // not intent — so a demoted `agentic` turn still mounts the right tool. Every
  // leg of the gate matters: wrong mount breaks the single-pass fixed-text
  // contract OR the compound feature.
  function genCatalog(opts: {
    intent?: string;
    kind?: 'sharepic' | 'presentation' | 'sheet' | 'document' | 'board' | null;
    req?: boolean;
    enabledTools?: Record<string, boolean>;
    userText?: string;
  }) {
    const sourceRegistry = createSourceRegistry();
    const sse = { send: () => {} } as unknown as NonNullable<
      Parameters<typeof buildChatToolCatalog>[0]['loop']
    >['sse'];
    const state = {
      intent: opts.intent ?? 'agentic',
      enabledTools: opts.enabledTools ?? {},
      compoundGeneration: opts.kind != null,
      compoundGenerationKind: opts.kind ?? null,
      ...(opts.userText ? { messages: [{ role: 'user', content: opts.userText }] } : {}),
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

  const TOOL_FOR: Record<string, string> = {
    sharepic: 'sharepic',
    presentation: 'create_presentation',
    sheet: 'create_sheet',
    document: 'create_document',
    board: 'create_board',
  };

  it('mounts exactly one fat tool per kind, on a compound turn with a req', () => {
    for (const [kind, toolName] of Object.entries(TOOL_FOR)) {
      const names = genCatalog({ kind: kind as 'sharepic' }).toolNames;
      expect(names, `${kind} mounts ${toolName}`).toContain(toolName);
      // No cross-mount: no OTHER generation tool leaks in.
      for (const other of Object.values(TOOL_FOR)) {
        if (other !== toolName)
          expect(names, `${kind} must not mount ${other}`).not.toContain(other);
      }
    }
  });

  it('the sharepic fat tool key is exactly `sharepic` (persisted toolName drives rehydration)', () => {
    const { tools } = genCatalog({ kind: 'sharepic' });
    expect(Object.keys(tools)).toContain('sharepic');
    expect(Object.keys(tools)).not.toContain('create_sharepic');
  });

  it('mounts by KIND even when the intent was demoted to `agentic` (the sheet bug)', () => {
    // "mach mir eine Tabelle draus" reaches the loop as intent=agentic with
    // kind=sheet — the tool must still mount.
    expect(genCatalog({ intent: 'agentic', kind: 'sheet' }).toolNames).toContain('create_sheet');
    expect(genCatalog({ intent: 'agentic', kind: 'board' }).toolNames).toContain('create_board');
  });

  it('nothing mounts without a kind, without a req, or when disabled', () => {
    // Not compound (no kind) → single-pass contract, nothing mounted.
    expect(genCatalog({ kind: null }).toolNames).not.toContain('create_sheet');
    // No req → generator can't run.
    expect(genCatalog({ kind: 'sheet', req: false }).toolNames).not.toContain('create_sheet');
    // User disabled the specific tool → respected (each key).
    expect(
      genCatalog({ kind: 'presentation', enabledTools: { create_presentation: false } }).toolNames
    ).not.toContain('create_presentation');
    expect(
      genCatalog({ kind: 'document', enabledTools: { create_document: false } }).toolNames
    ).not.toContain('create_document');
    expect(
      genCatalog({ kind: 'board', enabledTools: { create_board: false } }).toolNames
    ).not.toContain('create_board');
  });

  it('editor sidebars NEVER spawn a new artifact (create tools gated off when edit_current_* is on)', () => {
    // A docs/sheets/presentations sidebar (edit_current_doc enabled) editing its
    // open doc must not create a NEW one, even on a compound turn.
    for (const editKey of ['edit_current_doc', 'edit_current_board']) {
      for (const kind of ['sharepic', 'presentation', 'sheet', 'document', 'board'] as const) {
        const names = genCatalog({ kind, enabledTools: { [editKey]: true } }).toolNames;
        expect(names, `${kind} must not mount in an ${editKey} surface`).not.toContain(
          TOOL_FOR[kind]
        );
      }
      // generate_image is also a NEW artifact — gated off in an editor surface
      // even when the phrasing explicitly asks for an image.
      expect(
        genCatalog({
          intent: 'agentic',
          kind: null,
          enabledTools: { [editKey]: true },
          userText: 'erstelle ein Bild von einem Igel',
        }).toolNames
      ).not.toContain('generate_image');
    }
    // Control: outside an editor surface, generate_image still mounts on an
    // explicitly image-phrased agentic turn.
    expect(
      genCatalog({ intent: 'agentic', kind: null, userText: 'erstelle ein Bild von einem Igel' })
        .toolNames
    ).toContain('generate_image');
  });
});

describe('toolCatalog scrape_url', () => {
  beforeEach(() => {
    validateUrlForFetch.mockReset();
    crawlAndDistill.mockReset();
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
    expect(crawlAndDistill).not.toHaveBeenCalled();
  });

  // A named page must never be relevance-filtered — the user pointed at it.
  it('reads a named page faithfully, not query-focused', async () => {
    validateUrlForFetch.mockImplementation(async (u: string) => ({
      isValid: true,
      url: new URL(u),
    }));
    crawlAndDistill.mockResolvedValue([
      { url: 'https://example.com/', crawled: true, content: 'Hallo Welt Inhalt' },
    ]);
    const { execute } = scrapeTool();
    await execute({ urls: ['https://example.com/'] }, { toolCallId: 'c1' });
    const opts = crawlAndDistill.mock.calls[0]?.[2] as { mode?: string };
    expect(opts.mode).toBe('faithful');
  });

  it('crawls validated URLs and registers content as sources', async () => {
    validateUrlForFetch.mockImplementation(async (u: string) => ({
      isValid: true,
      url: new URL(u),
    }));
    crawlAndDistill.mockResolvedValue([
      { url: 'https://example.com/', crawled: true, content: 'Hallo Welt Inhalt' },
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
    crawlAndDistill.mockResolvedValue([
      { url: 'https://example.com/', crawled: false, crawlError: 'timeout' },
    ]);
    const { execute } = scrapeTool();
    const out = (await execute({ urls: ['https://example.com/'] }, { toolCallId: 'c1' })) as {
      error?: string;
    };
    expect(out.error).toMatch(/nicht lesen/);
  });
});

/**
 * "Ohne neue Recherche" enforced by absence.
 *
 * The ban used to lose an argument it should never have been in: four tool
 * descriptions open with "Recherchiere ZUERST", the loop's cardinal rule
 * demands a fresh tool call for any factual follow-up, and
 * `looksLikeCompoundGeneration` reads the word "Recherche" in the ban itself as
 * a research SIGNAL — so the sentence forbidding the search is what mounted the
 * search tools. No wording can win that argument; only an empty catalog can.
 */
describe('research ban (forbidsNewResearch → no search tools)', () => {
  function catalogFor(userText: string): string[] {
    const state = {
      lastUserTextNoMentions: userText,
      messages: [{ role: 'user', content: userText }],
      enabledTools: {},
    } as unknown as ChatGraphState;
    const { toolNames } = buildChatToolCatalog({
      agentConfig,
      sourceRegistry: createSourceRegistry(),
      loop: { sse: { send: () => {}, sendRaw: () => {}, end: () => {} } as never, state },
    });
    return toolNames;
  }

  it('unmounts the whole search family when the user forbids new research', () => {
    const names = catalogFor('Erstelle ohne neue Recherche eine Vergleichstabelle daraus.');
    for (const t of ['gruenerator_search', 'web_search', 'scrape_url']) {
      expect(names, t).not.toContain(t);
    }
  });

  /**
   * scrape_url is the door that would otherwise stay open: "read this page" is
   * new research by any honest reading, and a blocked search reappears as a
   * crawl if only the search tools are removed.
   */
  it('closes scrape_url too, not just the search tools', () => {
    expect(catalogFor('Bitte keine weitere Websuche.')).not.toContain('scrape_url');
  });

  it('leaves everything else mounted — a research ban is not a work ban', () => {
    const names = catalogFor('Ohne neue Recherche bitte.');
    expect(names).toContain('summarize');
    expect(names).toContain('documents');
  });

  it('mounts the full catalog for an ordinary turn', () => {
    const names = catalogFor('Recherchiere die aktuellen Zahlen zum Radverkehr.');
    expect(names).toContain('gruenerator_search');
    expect(names).toContain('web_search');
    expect(names).toContain('scrape_url');
  });
});

/**
 * Image hits on the loop path.
 *
 * The lean `{resultCount, sources}` shape used to swallow them one hop after we
 * had paid Linkup for them: `bilder: true` reached the engine, the images came
 * back, and neither the model nor the client ever saw one. These pin the two
 * halves of the fix — out to the client as their own event, into the model as a
 * count and nothing more.
 */
describe('toolCatalog image hits', () => {
  beforeEach(() => {
    searchExec.mockReset();
    webExec.mockReset();
  });

  const image = { title: 'Windrad', url: 'https://example.test/wind.jpg', domain: 'example.test' };

  function loopCatalog() {
    const send = vi.fn();
    const state = {
      intent: 'web',
      messages: [{ role: 'user', content: 'zeig mir Fotos von Windrädern' }],
      enabledTools: {},
    } as unknown as ChatGraphState;
    const { tools } = buildChatToolCatalog({
      agentConfig,
      sourceRegistry: createSourceRegistry(),
      loop: { sse: { send, sendRaw: () => {}, end: () => {} } as never, state },
    });
    return { tools, send, state };
  }

  it('sends the images to the client and hands the model a count, not a URL', async () => {
    webExec.mockResolvedValue({
      query: 'Windräder',
      resultsCount: 1,
      results: [{ rank: 1, title: 'Windkraft', url: 'https://example.test/a', snippet: 'Text.' }],
      images: [image],
    });
    const { tools, send, state } = loopCatalog();
    const out = (await execOf(tools.web_search)({ query: 'Windräder' }, { toolCallId: 'c1' })) as {
      sources: string;
      bilder?: string;
    };

    const [event, payload] = send.mock.calls.find(([name]) => name === 'search_images') ?? [];
    expect(event).toBe('search_images');
    expect((payload as { images: unknown[] }).images).toHaveLength(1);
    // Carried on the state too, so persistence and the synth note read one field
    // regardless of which path produced the images.
    expect(state.webImageResults).toHaveLength(1);

    expect(out.bilder).toContain('1 Bildtreffer');
    expect(JSON.stringify(out)).not.toContain('wind.jpg');
  });

  /**
   * "Zeig mir Fotos" is the one turn where an empty `results` is a success. The
   * early return used to hand the raw result — image URLs included — straight to
   * the model, which is the one place a hotlink could enter the answer text.
   */
  it('an image-only search returns the note, never the raw result', async () => {
    webExec.mockResolvedValue({ query: 'Fotos', resultsCount: 0, results: [], images: [image] });
    const { tools, send } = loopCatalog();
    const out = (await execOf(tools.web_search)({ query: 'Fotos' }, { toolCallId: 'c1' })) as {
      resultCount: number;
      bilder?: string;
    };

    expect(out.resultCount).toBe(0);
    expect(out.bilder).toContain('1 Bildtreffer');
    expect(JSON.stringify(out)).not.toContain('wind.jpg');
    expect(send.mock.calls.some(([name]) => name === 'search_images')).toBe(true);
  });

  it('stays silent when the search asked for no images', async () => {
    webExec.mockResolvedValue({
      query: 'Windkraft',
      resultsCount: 1,
      results: [{ rank: 1, title: 'T', url: 'https://example.test/a', snippet: 'Text.' }],
    });
    const { tools, send, state } = loopCatalog();
    const out = (await execOf(tools.web_search)({ query: 'Windkraft' }, { toolCallId: 'c1' })) as {
      bilder?: string;
    };

    expect(out.bilder).toBeUndefined();
    expect(send.mock.calls.some(([name]) => name === 'search_images')).toBe(false);
    expect(state.webImageResults).toBeUndefined();
  });
});
