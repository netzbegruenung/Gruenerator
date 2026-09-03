import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { ATTACHED_DOC_SNIPPET_CHARS } from '../services/agenticLoop/attachedDocuments.js';
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
// Die Optionen, mit denen der Katalog die Fabrik aufruft — das Gatter für
// `rerankSearchChunks` ist sonst von aussen nicht beobachtbar.
const searchToolOptions = vi.hoisted(() => ({ last: null as Record<string, unknown> | null }));
vi.mock('./searchTools.js', async (importOriginal) => ({
  createSearchTools: (_agent: unknown, options: Record<string, unknown>) => {
    searchToolOptions.last = options;
    return {
      gruenerator_search: { description: 'd', inputSchema: {}, execute: searchExec },
      web_search: { description: 'd', inputSchema: {}, execute: webExec },
    };
  },
  // Real implementation: the catalog's web gate is what the tests below assert,
  // so stubbing it would make them prove nothing.
  agentAllowsWebSearch: (await importOriginal<typeof import('./searchTools.js')>())
    .agentAllowsWebSearch,
}));

const validateUrlForFetch = vi.fn<(u: string) => Promise<unknown>>();
const crawlAndDistill = vi.fn<(s: unknown, q: unknown, o: unknown) => Promise<unknown>>();
vi.mock('../../../utils/validation/urlSecurity.js', () => ({
  validateUrlForFetch: (u: string) => validateUrlForFetch(u),
}));
vi.mock('../../../services/search/index.js', () => ({
  crawlAndDistill: (seeds: unknown, q: unknown, opts: unknown) => crawlAndDistill(seeds, q, opts),
}));

const fanout = vi.hoisted(() => vi.fn<(...a: unknown[]) => Promise<unknown>>());
vi.mock('../../../agents/langgraph/ChatGraph/nodes/searchNode.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  executeMultiDocFanout: (...a: unknown[]) => fanout(...a),
}));

const documentFullText = vi.hoisted(() => vi.fn<(...a: unknown[]) => Promise<unknown>>());
const documentSearch = vi.hoisted(() => vi.fn<(args: unknown) => Promise<unknown>>());
vi.mock(
  '../../../services/document-services/DocumentSearchService/index.js',
  async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    getQdrantDocumentService: () => ({
      search: documentSearch,
      getMultipleDocumentsFullText: documentFullText,
    }),
  })
);

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
    // Poster/Plakat: der Klassifikator kennt `poster` als Bildnomen, diese Liste
    // kannte es nicht — „Erstell ein Poster" bekam sein Bild, die demotierten
    // Formulierungen daneben nicht. Beide Zeilen halten die Zwillingslisten
    // zusammen.
    expect(catalogFor('agentic', 'Gestalte mir ein Poster zum Klimastreik').toolNames).toContain(
      'generate_image'
    );
    expect(catalogFor('agentic', 'Mach ein Plakat für die Demo').toolNames).toContain(
      'generate_image'
    );
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

describe('toolCatalog recurring_tasks — drei Tore, sonst nicht montiert', () => {
  function catalogFor(state: Record<string, unknown>) {
    const sourceRegistry = createSourceRegistry();
    const sse = { send: () => {} } as unknown as NonNullable<
      Parameters<typeof buildChatToolCatalog>[0]['loop']
    >['sse'];
    return buildChatToolCatalog({
      agentConfig,
      sourceRegistry,
      loop: {
        sse,
        state: { intent: 'agentic', enabledTools: {}, ...state } as unknown as ChatGraphState,
      },
    }).toolNames;
  }
  const withText = (text: string, over: Record<string, unknown> = {}) =>
    catalogFor({ messages: [{ role: 'user', content: text }], ...over });

  it('bleibt bei einem gewöhnlichen Turn weg — das Schema kostet auf jedem Turn', () => {
    expect(withText('Was sagt das Wahlprogramm zum Tempolimit?')).not.toContain('recurring_tasks');
    expect(withText('Leg eine Aufgabe auf dem Board an')).not.toContain('recurring_tasks');
  });

  it('montiert auf den Pin aus Tier 3.4, auch ohne ein Wort aus dem Vokabular', () => {
    expect(withText('mach das bitte', { mentionPinnedTool: 'recurring_tasks' })).toContain(
      'recurring_tasks'
    );
  });

  it('montiert auf den Dauerauftrag selbst (zweiter Weg in die Schleife)', () => {
    expect(withText('Erinnere mich jeden Montag um 9 an den Wochenbericht')).toContain(
      'recurring_tasks'
    );
  });

  it('montiert auf das Verwaltungs-Vokabular', () => {
    expect(withText('Pausier meine Erinnerung für den Newsletter')).toContain('recurring_tasks');
    expect(withText('Welche wiederkehrenden Aufgaben laufen bei mir?')).toContain(
      'recurring_tasks'
    );
  });

  it('liest den Text ohne Erwähnungen, wenn der Router ihn liefert', () => {
    expect(
      catalogFor({
        messages: [{ role: 'user', content: '@irgendwas' }],
        lastUserTextNoMentions: 'pausier die Erinnerung',
      })
    ).toContain('recurring_tasks');
  });

  it('respektiert das Opt-out des Agenten — auch gegen den Pin', () => {
    expect(
      withText('Erinnere mich jeden Montag an den Bericht', {
        enabledTools: { recurring_tasks: false },
        mentionPinnedTool: 'recurring_tasks',
      })
    ).not.toContain('recurring_tasks');
  });
});

describe('toolCatalog user_agents — Vokabular oder User-Agent-Thread, sonst nicht montiert', () => {
  function catalogFor(state: Record<string, unknown>, agent: AgentConfig = agentConfig) {
    const sourceRegistry = createSourceRegistry();
    const sse = { send: () => {} } as unknown as NonNullable<
      Parameters<typeof buildChatToolCatalog>[0]['loop']
    >['sse'];
    return buildChatToolCatalog({
      agentConfig: agent,
      sourceRegistry,
      loop: {
        sse,
        state: {
          intent: 'agentic',
          enabledTools: {},
          agentConfig: agent,
          ...state,
        } as unknown as ChatGraphState,
      },
    }).toolNames;
  }
  const withText = (text: string, over: Record<string, unknown> = {}, agent?: AgentConfig) =>
    catalogFor({ messages: [{ role: 'user', content: text }], ...over }, agent);

  it('bleibt bei einem gewöhnlichen Turn weg', () => {
    expect(withText('Was sagt das Wahlprogramm zum Tempolimit?')).not.toContain('user_agents');
    expect(withText('Schreib eine PM zur Agentur für Arbeit')).not.toContain('user_agents');
  });

  it('montiert auf das Vokabular', () => {
    expect(withText('Bau mir einen Agenten, der Pressemitteilungen schreibt')).toContain(
      'user_agents'
    );
    expect(withText('Welche Grünerator-Agenten habe ich?')).toContain('user_agents');
    expect(withText('Ändere die Systemrolle meines Agenten')).toContain('user_agents');
  });

  it('montiert, wenn der Thread mit einem User-Agent läuft — ohne Stichwort', () => {
    const userAgent = {
      identifier: 'presse-kv-ab12cd',
      isUserAgent: true,
    } as unknown as AgentConfig;
    expect(withText('Antworte ab jetzt kürzer', {}, userAgent)).toContain('user_agents');
    // Ein Registry-Agent montiert nicht — er ist im Werkzeug ohnehin tabu.
    expect(withText('Antworte ab jetzt kürzer')).not.toContain('user_agents');
  });

  it('liest den Text ohne Erwähnungen, wenn der Router ihn liefert', () => {
    expect(
      catalogFor({
        messages: [{ role: 'user', content: '@irgendwas' }],
        lastUserTextNoMentions: 'zeig meine Agenten',
      })
    ).toContain('user_agents');
  });

  it('respektiert das Opt-out des Agenten — auch im User-Agent-Thread', () => {
    const userAgent = {
      identifier: 'presse-kv-ab12cd',
      isUserAgent: true,
    } as unknown as AgentConfig;
    expect(
      withText('Bau mir einen Agenten', { enabledTools: { user_agents: false } }, userAgent)
    ).not.toContain('user_agents');
  });
});

describe('toolCatalog recipes — nur Vokabular, sonst nicht montiert', () => {
  function catalogFor(state: Record<string, unknown>) {
    const sourceRegistry = createSourceRegistry();
    const sse = { send: () => {} } as unknown as NonNullable<
      Parameters<typeof buildChatToolCatalog>[0]['loop']
    >['sse'];
    return buildChatToolCatalog({
      agentConfig,
      sourceRegistry,
      loop: {
        sse,
        state: {
          intent: 'agentic',
          enabledTools: {},
          agentConfig,
          ...state,
        } as unknown as ChatGraphState,
      },
    }).toolNames;
  }
  const withText = (text: string, over: Record<string, unknown> = {}) =>
    catalogFor({ messages: [{ role: 'user', content: text }], ...over });

  it('bleibt bei einem gewöhnlichen Turn weg — auch bei einem Schreibauftrag „im Stil von"', () => {
    expect(withText('Was sagt das Wahlprogramm zum Tempolimit?')).not.toContain('recipes');
    expect(withText('Schreib eine PM im Stil der Grünen Hessen')).not.toContain('recipes');
    expect(withText('Das Medikament ist rezeptfrei')).not.toContain('recipes');
  });

  it('montiert auf das Vokabular', () => {
    expect(withText('Welche Rezepte gibt es?')).toContain('recipes');
    expect(withText('Lern meinen Schreibstil aus diesen drei Texten')).toContain('recipes');
    expect(withText('Lösch meine Textform für Einladungen')).toContain('recipes');
  });

  it('liest den Text ohne Erwähnungen, wenn der Router ihn liefert', () => {
    expect(
      catalogFor({
        messages: [{ role: 'user', content: '@irgendwas' }],
        lastUserTextNoMentions: 'zeig meine Textformen',
      })
    ).toContain('recipes');
  });

  it('respektiert das Opt-out des Agenten', () => {
    expect(withText('Welche Rezepte gibt es?', { enabledTools: { recipes: false } })).not.toContain(
      'recipes'
    );
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
 * Die Formularwerkzeuge dürfen nur erscheinen, wenn ein FORMULAR erreichbar ist.
 * Ob ein PDF eines ist, entscheidet der Upload (`isFillablePdf`) und hinterlässt
 * die Antwort als `file_data` — `hasFileData` ist genau diese Spalte.
 *
 * Ohne das Gitter montete jedes PDF im Thread zwei Werkzeuge, die nicht
 * gelingen KONNTEN: `getThreadPdfFiles` filtert auf `file_data IS NOT NULL` und
 * lieferte nichts, das Werkzeug meldete „Es ist kein PDF-Formular angehängt" —
 * während eines angehängt war. Live am 24.08.2026 kostete das einen Loop-Schritt
 * auf einer Datenschutzerklärung.
 */
describe('toolCatalog: Formularwerkzeuge hängen am Formular, nicht am MIME-Typ', () => {
  const catalogFor = (state: Record<string, unknown>) => {
    const sourceRegistry = createSourceRegistry();
    const sse = { send: () => {} } as unknown as NonNullable<
      Parameters<typeof buildChatToolCatalog>[0]['loop']
    >['sse'];
    const { toolNames } = buildChatToolCatalog({
      agentConfig,
      sourceRegistry,
      loop: { sse, state: { intent: 'search', ...state } as unknown as ChatGraphState },
    });
    return toolNames;
  };

  const pdf = (over: Record<string, unknown> = {}) => ({
    id: 'a1',
    name: 'Datenschutzerklaerung.pdf',
    mimeType: 'application/pdf',
    hasFileData: false,
    ...over,
  });

  it('lässt sie weg, wenn das PDF beim Upload als Nicht-Formular erkannt wurde', () => {
    const names = catalogFor({ threadAttachments: [pdf()] });
    expect(names).not.toContain('read_pdf_form');
    expect(names).not.toContain('fill_pdf_form');
  });

  it('montiert sie für ein PDF aus einem FRÜHEREN Turn, dessen Bytes liegen', () => {
    // Die Regression, gegen die das Gitter nicht schiessen darf: ein Formular,
    // das im Upload-Turn kam, steht später nur noch in `threadAttachments`.
    const names = catalogFor({ threadAttachments: [pdf({ hasFileData: true })] });
    expect(names).toContain('read_pdf_form');
    expect(names).toContain('fill_pdf_form');
  });

  it('montiert sie für ein Formular DIESES Turns', () => {
    const names = catalogFor({
      pdfFormAttachments: [{ name: 'Antrag.pdf', data: 'AAAA' }],
      threadAttachments: [],
    });
    expect(names).toContain('read_pdf_form');
  });

  it('lässt sie weg, wenn gar kein PDF im Spiel ist', () => {
    const names = catalogFor({
      threadAttachments: [pdf({ mimeType: 'text/plain', hasFileData: true })],
    });
    expect(names).not.toContain('read_pdf_form');
  });
});

describe('toolCatalog expand_attachment (M4)', () => {
  beforeEach(() => {
    documentSearch.mockReset();
  });

  function catalogWithAttachments(threadAttachments: unknown[]) {
    const sourceRegistry = createSourceRegistry();
    const sse = { send: () => {} } as unknown as NonNullable<
      Parameters<typeof buildChatToolCatalog>[0]['loop']
    >['sse'];
    const state = { intent: 'search', threadAttachments } as unknown as ChatGraphState;
    const { tools } = buildChatToolCatalog({ agentConfig, sourceRegistry, loop: { sse, state } });
    return { execute: execOf(tools.expand_attachment), sourceRegistry };
  }

  it('is not mounted outside a loop context', () => {
    const sourceRegistry = createSourceRegistry();
    const { toolNames } = buildChatToolCatalog({ agentConfig, sourceRegistry });
    expect(toolNames).not.toContain('expand_attachment');
  });

  it('errors on an unknown attachment name instead of guessing', async () => {
    const { execute } = catalogWithAttachments([
      { id: 'a1', name: 'Bekannt.pdf', extractedText: 'Text', documentId: null },
    ]);
    const out = (await execute({ attachmentName: 'Unbekannt.pdf' }, { toolCallId: 'c1' })) as {
      error?: string;
    };
    expect(out.error).toMatch(/Keine Datei/);
    expect(documentSearch).not.toHaveBeenCalled();
  });

  it('registers the full inline text of a small (non-vectorized) attachment', async () => {
    const { execute, sourceRegistry } = catalogWithAttachments([
      {
        id: 'a1',
        name: 'Klein.pdf',
        extractedText: 'Der volle Text von Klein.pdf',
        documentId: null,
      },
    ]);
    const out = (await execute({ attachmentName: 'klein.pdf' }, { toolCallId: 'c1' })) as {
      resultCount?: number;
      sources?: string;
    };
    expect(out.resultCount).toBe(1);
    expect(sourceRegistry.size).toBe(1);
    expect(documentSearch).not.toHaveBeenCalled();
  });

  it('queries the vector store scoped to the attachment for a large (vectorized) attachment', async () => {
    // Eine Antwort, ein Dokument: `search()` gruppiert die Chunks vor der
    // Rückgabe nach `document_id` (`groupAndRankHybridResults`), und gefiltert
    // wird hier auf genau eine Datei. Die frühere Fassung dieses Tests liess
    // zwei Treffer für dieselbe Datei kommen — einen Zustand, den die Suche
    // nicht erzeugt.
    documentSearch.mockResolvedValue({
      results: [
        {
          document_id: 'doc-123',
          title: 'Groß.pdf',
          relevant_content: 'Mehr Inhalt',
          similarity_score: 0.7,
        },
      ],
    });
    const { execute, sourceRegistry } = catalogWithAttachments([
      { id: 'a2', name: 'Groß.pdf', extractedText: null, documentId: 'doc-123' },
    ]);
    const out = (await execute({ attachmentName: 'Groß.pdf' }, { toolCallId: 'c1' })) as {
      resultCount?: number;
    };
    expect(documentSearch).toHaveBeenCalledTimes(1);
    const call = documentSearch.mock.calls[0]?.[0] as { filters?: { documentIds?: string[] } };
    expect(call.filters?.documentIds).toEqual(['doc-123']);
    expect(out.resultCount).toBe(1);
    expect(sourceRegistry.size).toBe(1);
  });

  /**
   * Der Befund aus dem Review zu PR #2827: Nachladen ist ein zweiter Weg zu
   * derselben Datei. Ohne `documentId` an den hier gebauten Treffern fällt er
   * auf den Inhalts-Schlüssel zurück, findet den mitgeführten Eintrag nicht und
   * legt einen zweiten Quellenplatz an — also genau die Verdopplung aus #2817,
   * nur über den Werkzeugpfad statt über den Fan-out.
   */
  it('lädt in den mitgeführten Eintrag derselben Datei nach, statt einen zweiten anzulegen', async () => {
    documentSearch.mockResolvedValue({
      results: [
        {
          document_id: 'doc-123',
          title: 'Groß.pdf',
          relevant_content: 'Frisch nachgeladener Abschnitt',
          similarity_score: 0.7,
        },
      ],
    });
    const { execute, sourceRegistry } = catalogWithAttachments([
      { id: 'a2', name: 'Groß.pdf', extractedText: null, documentId: 'doc-123' },
    ]);
    // Was der Vorturn hinterlassen hat: dieselbe Datei, anderer Inhaltsanfang.
    sourceRegistry.seedCarried([
      {
        source: 'documentchat:doc-123',
        title: 'Groß.pdf',
        content: 'Abschnitt aus dem Vorturn',
        relevance: 0.6,
        documentId: 'doc-123',
      },
    ]);
    expect(sourceRegistry.size).toBe(1);

    await execute({ attachmentName: 'Groß.pdf' }, { toolCallId: 'c1' });

    expect(sourceRegistry.size).toBe(1);
  });

  it('errors when a matched attachment has neither vectorized id nor extracted text', async () => {
    const { execute } = catalogWithAttachments([
      { id: 'a3', name: 'Leer.pdf', extractedText: null, documentId: null },
    ]);
    const out = (await execute({ attachmentName: 'Leer.pdf' }, { toolCallId: 'c1' })) as {
      error?: string;
    };
    expect(out.error).toMatch(/keinen nachladbaren Text/);
  });
});

/**
 * The loop reads pages on `tiefenrecherche` and on nothing else.
 *
 * The gate is the whole feature: crawling costs seconds inside a loop that has a
 * wall-clock budget, and the tier is the only place the user's own consent to
 * spend them is recorded. It keys off the tier the executor reports having SPENT
 * — never off the `tiefe` argument, which is the model's request.
 */
describe('toolCatalog deep crawl', () => {
  beforeEach(() => {
    webExec.mockReset();
    validateUrlForFetch.mockReset();
    crawlAndDistill.mockReset();
    validateUrlForFetch.mockImplementation(async (u: string) => ({
      isValid: true,
      url: new URL(u),
    }));
  });

  function webResults(count: number, tier: string | undefined) {
    return {
      query: 'Wärmepumpen Förderung',
      searchType: 'general',
      ...(tier ? { tier } : {}),
      resultsCount: count,
      results: Array.from({ length: count }, (_, i) => ({
        rank: i + 1,
        title: `Treffer ${i + 1}`,
        url: `https://example.com/${i + 1}`,
        snippet: `Schnipsel ${i + 1}`,
        domain: 'example.com',
      })),
    };
  }

  function webTool() {
    const sourceRegistry = createSourceRegistry();
    const { tools } = buildChatToolCatalog({ agentConfig, sourceRegistry });
    return { execute: execOf(tools.web_search), sourceRegistry };
  }

  for (const tier of ['standard', 'gruendlich', undefined]) {
    it(`does not crawl on tier=${tier ?? 'absent'} — every ordinary turn stays untouched`, async () => {
      webExec.mockResolvedValue(webResults(5, tier));
      const { execute, sourceRegistry } = webTool();
      await execute({ query: 'q' }, { toolCallId: 'c1' });
      expect(crawlAndDistill).not.toHaveBeenCalled();
      expect(sourceRegistry.size).toBe(5);
    });
  }

  it('reads the top 3 hits query-focused on tiefenrecherche', async () => {
    webExec.mockResolvedValue(webResults(20, 'tiefenrecherche'));
    crawlAndDistill.mockResolvedValue([
      {
        url: 'https://example.com/1',
        crawled: true,
        content: 'Gelesener Volltext eins',
        distilled: true,
      },
    ]);
    const { execute, sourceRegistry } = webTool();
    await execute({ query: 'q' }, { toolCallId: 'c1' });

    const [seeds, query, opts] = crawlAndDistill.mock.calls[0] as [
      Array<{ url: string }>,
      string,
      { mode?: string; maxUrls?: number },
    ];
    expect(seeds).toHaveLength(3);
    expect(seeds.map((s) => s.url)).toEqual([
      'https://example.com/1',
      'https://example.com/2',
      'https://example.com/3',
    ]);
    // The question must reach the distiller — without it, "query-focused"
    // selects against an empty string and degrades to a head cut.
    expect(query).toBe('Wärmepumpen Förderung');
    expect(opts.mode).toBe('query-focused');
    // All 20 hits keep their number; only 3 got longer.
    expect(sourceRegistry.size).toBe(20);
    expect(sourceRegistry.renderAll()).toContain('Gelesener Volltext eins');
  });

  /**
   * The raw page must not ride along. `fullContent` is what the crawler produces
   * and what `postResponseService` would persist into `chat_messages` — two
   * crawled pages are ~160k chars of JSON per turn (see forPersistence).
   */
  it('merges the distilled text without dragging fullContent into the registry', async () => {
    webExec.mockResolvedValue(webResults(3, 'tiefenrecherche'));
    crawlAndDistill.mockResolvedValue([
      {
        url: 'https://example.com/1',
        crawled: true,
        content: 'Destillat',
        fullContent: 'X'.repeat(50_000),
        distilled: true,
        sourceChars: 50_000,
      },
    ]);
    const { execute, sourceRegistry } = webTool();
    await execute({ query: 'q' }, { toolCallId: 'c1' });
    const first = sourceRegistry.getResults(10)[0] as Record<string, unknown>;
    expect(first.content).toBe('Destillat');
    expect(first.crawled).toBe(true);
    expect(first.fullContent).toBeUndefined();
  });

  it('keeps the snippets when the crawl throws', async () => {
    webExec.mockResolvedValue(webResults(5, 'tiefenrecherche'));
    crawlAndDistill.mockRejectedValue(new Error('crawler down'));
    const { execute, sourceRegistry } = webTool();
    const out = (await execute({ query: 'q' }, { toolCallId: 'c1' })) as { resultCount?: number };
    expect(out.resultCount).toBe(5);
    expect(sourceRegistry.renderAll()).toContain('Schnipsel 1');
  });

  it('keeps the snippets when no page could be read', async () => {
    webExec.mockResolvedValue(webResults(5, 'tiefenrecherche'));
    crawlAndDistill.mockResolvedValue([
      { url: 'https://example.com/1', crawled: false, crawlError: 'timeout' },
    ]);
    const { execute, sourceRegistry } = webTool();
    await execute({ query: 'q' }, { toolCallId: 'c1' });
    expect(sourceRegistry.renderAll()).toContain('Schnipsel 1');
  });

  it('skips URLs that fail SSRF validation and crawls the rest', async () => {
    webExec.mockResolvedValue(webResults(5, 'tiefenrecherche'));
    validateUrlForFetch.mockImplementation(async (u: string) =>
      u.endsWith('/1')
        ? { isValid: false, error: 'Host is blocked' }
        : { isValid: true, url: new URL(u) }
    );
    crawlAndDistill.mockResolvedValue([]);
    const { execute } = webTool();
    await execute({ query: 'q' }, { toolCallId: 'c1' });
    const [seeds] = crawlAndDistill.mock.calls[0] as [Array<{ url: string }>];
    expect(seeds.map((s) => s.url)).toEqual([
      'https://example.com/2',
      'https://example.com/3',
      'https://example.com/4',
    ]);
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
 * Corpus-bound agents (the Landesverband families) declare no web capability.
 * Their prompt said so all along, but the catalog mounted `web_search` for
 * every agent regardless — so the model searched the open web anyway. Only the
 * two web doors close; the party corpora stay reachable.
 */
describe('agent web capability (agentAllowsWebSearch → no web doors)', () => {
  function catalogForAgent(enabledTools?: string[]): string[] {
    const state = {
      lastUserTextNoMentions: 'Was sagt der Landesverband zur Stadtentwicklung?',
      messages: [{ role: 'user', content: 'Was sagt der Landesverband zur Stadtentwicklung?' }],
      enabledTools: {},
    } as unknown as ChatGraphState;
    const { toolNames } = buildChatToolCatalog({
      agentConfig: { identifier: 'lv-test', enabledTools } as unknown as AgentConfig,
      sourceRegistry: createSourceRegistry(),
      loop: { sse: { send: () => {}, sendRaw: () => {}, end: () => {} } as never, state },
    });
    return toolNames;
  }

  it('unmounts both web doors for an agent without web capability', () => {
    const names = catalogForAgent(['search', 'memory', 'self_review']);
    expect(names).not.toContain('web_search');
    expect(names).not.toContain('scrape_url');
  });

  it('keeps the party corpora reachable — no web is not no search', () => {
    expect(catalogForAgent(['search', 'memory', 'self_review'])).toContain('gruenerator_search');
  });

  it('leaves an agent declaring raw tool names untouched', () => {
    const names = catalogForAgent(['gruenerator_search', 'web_search']);
    expect(names).toContain('web_search');
    expect(names).toContain('scrape_url');
  });

  it('leaves an agent without any declaration untouched', () => {
    const names = catalogForAgent();
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

/**
 * `dokumente_lesen` — das Nachfass-Werkzeug für die Dokumente DIESES Turns.
 *
 * Gegated an den Dokumenten selbst, nicht an einer Konfiguration daneben: das
 * ist der Unterschied zu LobeHub, dessen Gegenstück nur montiert wird, wenn der
 * Agent zufällig eine Wissensdatenbank hat — und das Modell eine gerade
 * hochgeladene Datei dann nicht mehr befragen kann.
 */
describe('toolCatalog dokumente_lesen', () => {
  beforeEach(() => {
    fanout.mockReset();
    documentFullText.mockReset();
  });

  function catalogWithDocs(documentSources: unknown[]) {
    const sourceRegistry = createSourceRegistry();
    const sse = { send: () => {} } as unknown as NonNullable<
      Parameters<typeof buildChatToolCatalog>[0]['loop']
    >['sse'];
    const state = {
      intent: 'search',
      documentSources,
      searchQuery: 'Radverkehr',
      agentConfig: { userId: 'u1' },
    } as unknown as ChatGraphState;
    const { tools, toolNames } = buildChatToolCatalog({
      agentConfig,
      sourceRegistry,
      loop: { sse, state },
    });
    return { tools, toolNames, sourceRegistry };
  }

  const pdf = { kind: 'document_chat', id: 'doc-1', label: 'Beschlusspapier.pdf' };

  it('ist montiert, sobald ein Dokument am Turn hängt', () => {
    expect(catalogWithDocs([pdf]).toolNames).toContain('dokumente_lesen');
  });

  it('fehlt ohne angehängte Dokumente', () => {
    expect(catalogWithDocs([]).toolNames).not.toContain('dokumente_lesen');
  });

  it('fehlt, wenn nur ein Notebook im Spiel ist', () => {
    const { toolNames } = catalogWithDocs([{ kind: 'notebook', id: 'berlin', label: 'Berlin' }]);
    expect(toolNames).not.toContain('dokumente_lesen');
  });

  it('sucht mit `query` über den Fan-out und trägt die Treffer als Quellen ein', async () => {
    fanout.mockResolvedValue({
      perSourceResults: {
        'doc-1': [
          {
            source: 'documentchat:doc-1',
            title: 'Beschlusspapier.pdf',
            content: 'Der Radverkehr wird ausgebaut.',
            relevance: 0.9,
          },
        ],
      },
      searchedCollections: [],
      errors: [],
    });
    const { tools, sourceRegistry } = catalogWithDocs([pdf]);

    const out = (await execOf(tools.dokumente_lesen)(
      { query: 'Radverkehr' },
      { toolCallId: 'c1' }
    )) as { resultCount: number; sources: string };

    expect(out.resultCount).toBe(1);
    expect(sourceRegistry.size).toBe(1);
    expect(out.sources).toContain('Der Radverkehr wird ausgebaut.');
    expect(documentFullText).not.toHaveBeenCalled();
  });

  /**
   * Suchmodus und Vorab-Abruf fragen dieselben Anhänge über dieselbe Bauform ab.
   * Liefen sie mit verschiedenen Deckeln, wäre dasselbe Ergebnis je nach
   * Aufrufer unterschiedlich lang — und welcher gewinnt, hinge daran, wer
   * zuerst registriert.
   */
  it('gibt der Passagensuche denselben Platz wie dem Vorab-Abruf', async () => {
    const long = 'z'.repeat(ATTACHED_DOC_SNIPPET_CHARS - 100);
    fanout.mockResolvedValue({
      perSourceResults: {
        'doc-1': [
          {
            source: 'documentchat:doc-1',
            title: 'Beschlusspapier.pdf',
            content: long,
            relevance: 0.9,
          },
        ],
      },
      searchedCollections: [],
      errors: [],
    });
    const { tools } = catalogWithDocs([pdf]);

    const out = (await execOf(tools.dokumente_lesen)(
      { query: 'Radverkehr' },
      { toolCallId: 'c1' }
    )) as { sources: string };

    expect(out.sources).toContain(long);
  });

  it('liest mit `abschnitt` den Volltext in Scheiben', async () => {
    documentFullText.mockResolvedValue({
      documents: [{ id: 'doc-1', fullText: `Anfang. ${'x'.repeat(30_000)}` }],
    });
    const { tools } = catalogWithDocs([pdf]);

    const out = (await execOf(tools.dokumente_lesen)(
      { abschnitt: { von: 0 } },
      { toolCallId: 'c1' }
    )) as { resultCount: number; sources: string };

    expect(out.resultCount).toBe(1);
    expect(out.sources).toContain('Anfang.');
    // Der Wegweiser steht vor dem Text, nicht dahinter: gekappt wird der
    // Schwanz, und am Ende wäre er genau dann weg, wenn er gebraucht wird.
    expect(out.sources).toContain('[Zeichen 0–10000 von 30008 — weiter mit abschnitt.von=10000]');
    expect(fanout).not.toHaveBeenCalled();
  });

  /**
   * Die Scheibe wurde live nie gewählt: bei drei Turns zu derselben angehängten
   * PDF griff der Planer dreimal zur Ähnlichkeitssuche, einmal davon mit exakt
   * der Anfrage des Vorab-Abrufs. Das Tor war nur als „die Frage gibt keinen
   * Suchbegriff her" formuliert — eine Aufzählungsfrage („nenne alle
   * Löschfristen") gibt einen exzellenten Suchbegriff her und landete deshalb
   * bei `query`, das nach Relevanz ordnet statt vollständig zu sein.
   */
  it('nennt Vollständigkeitsfragen als zweiten Grund für `abschnitt`', () => {
    const { tools } = catalogWithDocs([pdf]);
    const description = tools.dokumente_lesen?.description ?? '';

    expect(description).toMatch(/Vollständigkeit/);
    expect(description).toMatch(/nur die besten Treffer/);
    // Die Abgrenzung zu `summarize` bleibt stehen: die Scheibe ist der Weg zu
    // ALLEN Einträgen, nicht ein zweiter Weg zur Zusammenfassung.
    expect(description).toContain('NICHT für eine Zusammenfassung');
  });

  /**
   * Ohne Suchbegriff UND ohne Abschnitt bei genau einer Datei: der Anfang ist
   * die ehrlichere Antwort als eine Ähnlichkeitssuche nach der Frage selbst —
   * die trifft bei „worum geht es hier" nur Zufälliges.
   */
  it('liest den Anfang, wenn weder Suchbegriff noch Abschnitt kommen', async () => {
    documentFullText.mockResolvedValue({ documents: [{ id: 'doc-1', fullText: 'Kurzer Text.' }] });
    const { tools } = catalogWithDocs([pdf]);

    const out = (await execOf(tools.dokumente_lesen)({}, { toolCallId: 'c1' })) as {
      sources: string;
    };

    expect(out.sources).toContain('Kurzer Text.');
    expect(fanout).not.toHaveBeenCalled();
  });

  it('grenzt über `dateiname` ein und sagt es, wenn der Name nicht passt', async () => {
    const zweite = { kind: 'document_chat', id: 'doc-2', label: 'Antrag.docx' };
    fanout.mockResolvedValue({ perSourceResults: {}, searchedCollections: [], errors: [] });
    const { tools } = catalogWithDocs([pdf, zweite]);

    await execOf(tools.dokumente_lesen)(
      { query: 'Rad', dateiname: 'Antrag.docx' },
      { toolCallId: 'c1' }
    );
    const [, sources] = fanout.mock.calls[0] as [string, { id: string }[]];
    expect(sources.map((s) => s.id)).toEqual(['doc-2']);

    const out = (await execOf(tools.dokumente_lesen)(
      { query: 'Rad', dateiname: 'gibtsnicht.pdf' },
      { toolCallId: 'c2' }
    )) as { error: string };
    // Die Fehlermeldung nennt, was es GIBT — sonst rät das Modell weiter.
    expect(out.error).toContain('Beschlusspapier.pdf');
    expect(out.error).toContain('Antrag.docx');
  });
});

describe('cloud_files mounting gate', () => {
  function catalogWithCloud(opts: {
    connections?: number;
    userText?: string;
    wolkeFiles?: number;
    enabled?: boolean;
    attachedWebpageUrls?: string[];
  }) {
    const sourceRegistry = createSourceRegistry();
    const sse = { send: () => {} } as unknown as NonNullable<
      Parameters<typeof buildChatToolCatalog>[0]['loop']
    >['sse'];
    const state = {
      intent: 'agentic',
      enabledTools: opts.enabled === false ? { cloud_files: false } : {},
      cloudConnectionCount: opts.connections ?? 0,
      ...(opts.wolkeFiles
        ? { wolkeFiles: Array.from({ length: opts.wolkeFiles }, () => ({ shareLinkId: 'l1' })) }
        : {}),
      ...(opts.userText ? { messages: [{ role: 'user', content: opts.userText }] } : {}),
      ...(opts.attachedWebpageUrls ? { attachedWebpageUrls: opts.attachedWebpageUrls } : {}),
    } as unknown as ChatGraphState;
    return buildChatToolCatalog({
      agentConfig,
      sourceRegistry,
      loop: { sse, state, threadId: 't1' },
    });
  }

  // Das primäre Tor. Wer eine Wolke hat, bekommt das Werkzeug auf JEDEM Turn —
  // "Welche Ordner gibt es?" nennt die Wolke nicht, und eine erfundene
  // Fehlanzeige sieht aus wie eine geprüfte Antwort.
  it('mounts whenever the account has a connection, whatever the text says', () => {
    const { toolNames } = catalogWithCloud({ connections: 1, userText: 'Was steht dazu an?' });
    expect(toolNames).toContain('cloud_files');
  });

  // Ein Konto ohne Wolke zahlt nur, wenn es selbst davon anfängt.
  it('stays out of the catalog for an account without a connection', () => {
    const { toolNames } = catalogWithCloud({ userText: 'Schreib mir eine Pressemitteilung' });
    expect(toolNames).not.toContain('cloud_files');
  });

  it('mounts on cloud vocabulary so a first connection can be added by chat', () => {
    const { toolNames } = catalogWithCloud({
      userText: 'Kannst du diesen Wolke-Link hinzufügen?',
    });
    expect(toolNames).toContain('cloud_files');
  });

  it('matches the vocabulary at the start of a sentence, umlauts and all', () => {
    // `\b(Öffne)` scheitert am Satzanfang — deshalb Lookarounds. Hier zählt,
    // dass ein Treffer am Wortanfang nach einem Umlaut-Wort noch greift.
    const { toolNames } = catalogWithCloud({ userText: 'Öffne bitte die Nextcloud-Freigabe' });
    expect(toolNames).toContain('cloud_files');
  });

  it('mounts when a Wolke file rides along without being named in the text', () => {
    const { toolNames } = catalogWithCloud({ wolkeFiles: 1, userText: 'Fasse das zusammen' });
    expect(toolNames).toContain('cloud_files');
  });

  // Ein über `@link` angehängter Freigabe-Link steht nur in den Anhangsdaten,
  // nie im Text — das Vokabular-Tor sieht ihn also nicht. Ohne diesen Zweig
  // wäre er seit dem `scrape_url`-Ausschluss ein stiller Blindgänger.
  it('mounts on an @link-attached share link that the text never names', () => {
    const { toolNames } = catalogWithCloud({
      userText: 'Kannst du das hinzufügen?',
      attachedWebpageUrls: ['https://wolke.netzbegruenung.de/s/AbCdEf'],
    });
    expect(toolNames).toContain('cloud_files');
  });

  it('stays out for an ordinary attached web page', () => {
    const { toolNames } = catalogWithCloud({
      userText: 'Fasse das zusammen',
      attachedWebpageUrls: ['https://gruene.de/programm'],
    });
    expect(toolNames).not.toContain('cloud_files');
  });

  it('respects an agent that switched the tool off', () => {
    const { toolNames } = catalogWithCloud({ connections: 2, enabled: false });
    expect(toolNames).not.toContain('cloud_files');
  });

  // Live-Ausfall 29.08.2026 (test-Instanz): „welche wolke links sind verbunden“
  // — beide Werkzeuge montiert, der Planer griff zu product_knowledge und
  // antwortete mit der MCP-Doku. Die Abgrenzung muss in den BESCHREIBUNGEN
  // stehen, denn dort trifft der Planer seine Wahl.
  it('pairs cloud_files with a product_knowledge description that defers to it', () => {
    const { tools, toolNames } = catalogWithCloud({
      userText: 'welche wolke links sind verbunden',
    });
    expect(toolNames).toContain('cloud_files');
    expect(toolNames).toContain('product_knowledge');
    expect(tools.product_knowledge?.description ?? '').toContain('cloud_files');
    expect(tools.cloud_files?.description ?? '').toContain('verbunden');
  });

  // Zweites Netz: greift der Planer trotzdem zuerst zu product_knowledge,
  // verweist das ERGEBNIS auf cloud_files, und der nächste Schritt fängt sich.
  it('appends the cloud_files redirect to a product_knowledge answer when mounted', async () => {
    const { tools } = catalogWithCloud({ userText: 'welche wolke links sind verbunden' });
    const out = (await execOf(tools.product_knowledge)({ topic: '' }, { toolCallId: 'c1' })) as {
      knowledge: string;
    };
    expect(out.knowledge).toContain('cloud_files');
    expect(out.knowledge).toContain('list_connections');
  });

  // Ein Konto MIT Wolke montiert cloud_files auf jedem Turn — der Verweis
  // darf trotzdem nur auf Turns reiten, die die Wolke selbst nennen, sonst
  // trägt jede Produktantwort dieser Konten einen fachfremden Fußnotensatz.
  it('keeps the redirect off product answers that never name the Wolke', async () => {
    const { tools, toolNames } = catalogWithCloud({
      connections: 1,
      userText: 'erzähl mir etwas über die notebooks funktion',
    });
    expect(toolNames).toContain('cloud_files');
    const out = (await execOf(tools.product_knowledge)({ topic: '' }, { toolCallId: 'c1' })) as {
      knowledge: string;
    };
    expect(out.knowledge).not.toContain('cloud_files');
  });

  // …aber nie auf ein Werkzeug, das dieser Turn gar nicht trägt.
  it('keeps the redirect out when cloud_files is not mounted', async () => {
    const { tools, toolNames } = catalogWithCloud({
      userText: 'erzähl mir etwas über die notebooks funktion',
    });
    expect(toolNames).not.toContain('cloud_files');
    const out = (await execOf(tools.product_knowledge)({ topic: '' }, { toolCallId: 'c1' })) as {
      knowledge: string;
    };
    expect(out.knowledge).not.toContain('cloud_files');
  });
});

describe('toolCatalog — Gatter des Chunk-Reranks', () => {
  const originalFlag = process.env.LOOP_RERANK_ENABLED;

  function buildLoopCatalog() {
    const sourceRegistry = createSourceRegistry();
    const sse = { send: () => {} } as unknown as NonNullable<
      Parameters<typeof buildChatToolCatalog>[0]['loop']
    >['sse'];
    const state = { intent: 'search', enabledTools: {} } as unknown as ChatGraphState;
    return buildChatToolCatalog({ agentConfig, sourceRegistry, loop: { sse, state } });
  }

  beforeEach(() => {
    searchToolOptions.last = null;
  });

  afterEach(() => {
    if (originalFlag === undefined) delete process.env.LOOP_RERANK_ENABLED;
    else process.env.LOOP_RERANK_ENABLED = originalFlag;
  });

  it('setzt die Option im Loop, wenn der Schalter an ist', () => {
    process.env.LOOP_RERANK_ENABLED = 'true';
    buildLoopCatalog();
    expect(searchToolOptions.last).toMatchObject({ rerankSearchChunks: true });
  });

  it('setzt sie nicht, wenn der Schalter aus ist', () => {
    delete process.env.LOOP_RERANK_ENABLED;
    buildLoopCatalog();
    expect(searchToolOptions.last).not.toHaveProperty('rerankSearchChunks');
  });

  it('setzt sie ausserhalb des Loops nie — auch nicht mit gesetztem Schalter', () => {
    process.env.LOOP_RERANK_ENABLED = 'true';
    buildChatToolCatalog({ agentConfig, sourceRegistry: createSourceRegistry() });
    expect(searchToolOptions.last).not.toHaveProperty('rerankSearchChunks');
  });
});

describe('toolCatalog memory tool mounting', () => {
  function catalogWith(state: Partial<ChatGraphState>) {
    const sourceRegistry = createSourceRegistry();
    const sse = { send: () => {} } as unknown as NonNullable<
      Parameters<typeof buildChatToolCatalog>[0]['loop']
    >['sse'];
    const full = { intent: 'search', enabledTools: {}, ...state } as unknown as ChatGraphState;
    return buildChatToolCatalog({ agentConfig, sourceRegistry, loop: { sse, state: full } });
  }

  it('mounts `memory` only when the profile switch is on', () => {
    // Off: the prompt carries no GEDÄCHTNIS block, so a tool that could save
    // into a store nobody reads would be the same lie in the other direction.
    expect(catalogWith({ memoryEnabled: false }).toolNames).not.toContain('memory');
    expect(catalogWith({}).toolNames).not.toContain('memory');
    expect(catalogWith({ memoryEnabled: true }).toolNames).toContain('memory');
  });

  it('honours an agent opting out via enabledTools', () => {
    expect(
      catalogWith({ memoryEnabled: true, enabledTools: { memory: false } }).toolNames
    ).not.toContain('memory');
  });
});
