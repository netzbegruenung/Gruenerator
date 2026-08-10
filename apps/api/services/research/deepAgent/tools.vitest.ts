import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The point of these tests is the failure policy, not the happy path: a tool
 * that throws ends the agent's turn, so every degraded provider must come back
 * as prose instead. GreenPT in particular signals throttling by throwing, and
 * that has to be indistinguishable from "ask Linkup instead".
 */

const greenptWebSearch = vi.fn();
const linkupWebSearch = vi.fn();
const validateUrlForFetch = vi.fn();
const crawlAndDistill = vi.fn();
let greenptService: unknown = null;
let linkupService: unknown = null;

vi.mock('../../search/GreenPTSearchService.js', () => ({
  getGreenPTSearchService: () => greenptService,
}));
vi.mock('../../search/LinkupService.js', () => ({
  getLinkupService: () => linkupService,
}));
vi.mock('../../../utils/validation/urlSecurity.js', () => ({
  validateUrlForFetch: (url: string) => validateUrlForFetch(url),
}));
vi.mock('../../search/CrawlingService.js', () => ({
  crawlAndDistill: (...args: unknown[]) => crawlAndDistill(...args),
}));

const { createResearchTools } = await import('./tools.js');
const { createBudget } = await import('./types.js');

interface RunnableTool {
  name: string;
  invoke: (input: unknown) => Promise<string>;
}

function setup(overrides: { softDeadlineAt?: number } = {}) {
  const ctx = {
    budget: { ...createBudget(Date.now()), ...overrides },
    locale: 'de-DE' as const,
    sources: new Map<string, { url: string; title: string }>(),
    onStep: vi.fn(),
  };
  const tools = createResearchTools(ctx) as unknown as RunnableTool[];
  const byName = (name: string): RunnableTool => {
    const found = tools.find((t) => t.name === name);
    if (!found) throw new Error(`tool ${name} missing`);
    return found;
  };
  return { ctx, webSuche: byName('web_suche'), seiteLesen: byName('seite_lesen') };
}

beforeEach(() => {
  vi.clearAllMocks();
  greenptService = { webSearch: greenptWebSearch };
  linkupService = { webSearch: linkupWebSearch };
});

describe('web_suche', () => {
  it('uses GreenPT when it answers, and never pays Linkup', async () => {
    greenptWebSearch.mockResolvedValue([
      { url: 'https://a.example', title: 'A', description: 'Ein Treffer' },
    ]);
    const { webSuche, ctx } = setup();

    const out = await webSuche.invoke({ query: 'Wien Klimaziel' });

    expect(out).toContain('https://a.example');
    expect(linkupWebSearch).not.toHaveBeenCalled();
    expect(ctx.sources.get('https://a.example')?.title).toBe('A');
  });

  it.each([
    ['throttled (empty result set)', new Error('GreenPT returned zero results')],
    ['rate-gated', new Error('GreenPT rate gate — 1200ms since last call')],
    ['circuit open', new Error('GreenPT circuit open')],
  ])('falls back to Linkup when GreenPT is %s', async (_label, error) => {
    greenptWebSearch.mockRejectedValue(error);
    linkupWebSearch.mockResolvedValue({
      results: [{ url: 'https://b.example', name: 'B', content: 'Inhalt' }],
    });
    const { webSuche } = setup();

    const out = await webSuche.invoke({ query: 'Wien' });

    expect(linkupWebSearch).toHaveBeenCalledOnce();
    expect(out).toContain('https://b.example');
  });

  it('falls back to Linkup when GreenPT is not configured at all', async () => {
    greenptService = null;
    linkupWebSearch.mockResolvedValue({
      results: [{ url: 'https://b.example', name: 'B', content: 'Inhalt' }],
    });
    const { webSuche } = setup();

    await webSuche.invoke({ query: 'Wien' });

    expect(linkupWebSearch).toHaveBeenCalledOnce();
  });

  it('returns prose — never throws — when both engines are down', async () => {
    greenptWebSearch.mockRejectedValue(new Error('kaputt'));
    linkupWebSearch.mockRejectedValue(new Error('auch kaputt'));
    const { webSuche } = setup();

    await expect(webSuche.invoke({ query: 'Wien' })).resolves.toContain('fehlgeschlagen');
  });

  it('refuses once the search budget is spent, without calling any engine', async () => {
    const { webSuche, ctx } = setup();
    ctx.budget.searchesLeft = 0;

    const out = await webSuche.invoke({ query: 'Wien' });

    expect(out).toContain('Suchbudget aufgebraucht');
    expect(greenptWebSearch).not.toHaveBeenCalled();
    expect(linkupWebSearch).not.toHaveBeenCalled();
  });

  it('refuses once the soft deadline has passed, telling the agent to write', async () => {
    const { webSuche } = setup({ softDeadlineAt: Date.now() - 1 });

    const out = await webSuche.invoke({ query: 'Wien' });

    expect(out).toContain('Zeitbudget aufgebraucht');
    expect(greenptWebSearch).not.toHaveBeenCalled();
  });

  it('drops Linkup image entries, which carry no content to cite', async () => {
    greenptService = null;
    linkupWebSearch.mockResolvedValue({
      results: [
        { url: 'https://img.example', name: 'Bild', content: '', type: 'image' },
        { url: 'https://text.example', name: 'Text', content: 'Inhalt' },
      ],
    });
    const { webSuche, ctx } = setup();

    const out = await webSuche.invoke({ query: 'Wien' });

    expect(out).not.toContain('img.example');
    expect(ctx.sources.has('https://img.example')).toBe(false);
    expect(ctx.sources.has('https://text.example')).toBe(true);
  });
});

describe('seite_lesen', () => {
  it('rejects an SSRF-invalid URL without ever reaching the crawler', async () => {
    validateUrlForFetch.mockResolvedValue({ isValid: false, error: 'private address' });
    const { seiteLesen, ctx } = setup();

    const out = await seiteLesen.invoke({ url: 'http://169.254.169.254/' });

    expect(out).toContain('nicht erlaubt');
    expect(crawlAndDistill).not.toHaveBeenCalled();
    // The refusal must not cost the run one of its crawls.
    expect(ctx.budget.crawlsLeft).toBe(createBudget(Date.now()).crawlsLeft);
  });

  it('returns the distilled page content on success', async () => {
    validateUrlForFetch.mockResolvedValue({ isValid: true, url: new URL('https://ok.example/x') });
    crawlAndDistill.mockResolvedValue([
      { url: 'https://ok.example/x', title: 'Seite', content: 'Der Inhalt', crawled: true },
    ]);
    const { seiteLesen, ctx } = setup();

    const out = await seiteLesen.invoke({ url: 'https://ok.example/x' });

    expect(out).toContain('Der Inhalt');
    expect(ctx.sources.has('https://ok.example/x')).toBe(true);
  });

  it('reports an unreadable page as prose and suggests another source', async () => {
    validateUrlForFetch.mockResolvedValue({ isValid: true, url: new URL('https://ok.example/x') });
    crawlAndDistill.mockResolvedValue([{ url: 'https://ok.example/x', crawled: false }]);
    const { seiteLesen } = setup();

    const out = await seiteLesen.invoke({ url: 'https://ok.example/x' });

    expect(out).toContain('konnte nicht gelesen werden');
  });

  it('returns prose — never throws — when the crawler itself blows up', async () => {
    validateUrlForFetch.mockResolvedValue({ isValid: true, url: new URL('https://ok.example/x') });
    crawlAndDistill.mockRejectedValue(new Error('boom'));
    const { seiteLesen } = setup();

    await expect(seiteLesen.invoke({ url: 'https://ok.example/x' })).resolves.toContain(
      'konnte nicht gelesen werden'
    );
  });
});
