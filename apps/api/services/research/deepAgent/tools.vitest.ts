import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The point of these tests is the failure policy, not the happy path: a tool
 * that throws ends the agent's turn, so every degraded provider must come back
 * as prose instead. GreenPT in particular signals throttling by throwing, and
 * that has to be indistinguishable from "ask Linkup instead".
 */

const greenptWebSearch = vi.fn();
const linkupWebSearch = vi.fn();
// Typed returns rather than bare `vi.fn()`: the forwarding mocks below hand
// their result straight back to the module under test, and an `any` there is an
// unsafe return the type-aware lint rules reject.
const validateUrlForFetch = vi.fn<(url: string) => Promise<unknown>>();
const crawlAndDistill = vi.fn<(...args: unknown[]) => Promise<unknown>>();
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
  return {
    ctx,
    webSuche: byName('web_suche'),
    tiefenSuche: byName('tiefen_suche'),
    seiteLesen: byName('seite_lesen'),
  };
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

  /**
   * The provider policy, which is where this agent parts ways with the chat:
   * GreenPT is waited for and retried, and Linkup is what is left when that
   * fails twice — not a co-equal engine one throttle away.
   */
  it('waits out the GreenPT spacing gate instead of dropping to Linkup', async () => {
    greenptWebSearch.mockResolvedValue([
      { url: 'https://a.example', title: 'A', description: 'x' },
    ]);
    const { webSuche } = setup();

    await webSuche.invoke({ query: 'Wien' });

    expect(greenptWebSearch.mock.calls[0]?.[0]).toMatchObject({ gate: 'wait' });
  });

  it('retries a throttled GreenPT once before paying Linkup', async () => {
    greenptWebSearch
      .mockRejectedValueOnce(new Error('GreenPT returned zero results'))
      .mockResolvedValueOnce([{ url: 'https://a.example', title: 'A', description: 'x' }]);
    const { webSuche } = setup();

    const out = await webSuche.invoke({ query: 'Wien' });

    expect(greenptWebSearch).toHaveBeenCalledTimes(2);
    expect(linkupWebSearch).not.toHaveBeenCalled();
    expect(out).toContain('a.example');
  });

  it('gives Linkup a second attempt too, so one blip does not lose the sub-question', async () => {
    greenptService = null;
    linkupWebSearch.mockRejectedValueOnce(new Error('ECONNRESET')).mockResolvedValueOnce({
      results: [{ url: 'https://b.example', name: 'B', content: 'Inhalt' }],
    });
    const { webSuche } = setup();

    const out = await webSuche.invoke({ query: 'Wien' });

    expect(linkupWebSearch).toHaveBeenCalledTimes(2);
    expect(out).toContain('b.example');
  });

  it('tells the agent to skip the sub-question when both attempts fail', async () => {
    greenptService = null;
    linkupWebSearch.mockRejectedValue(new Error('tot'));
    const { webSuche } = setup();

    const out = await webSuche.invoke({ query: 'Wien' });

    expect(out).toContain('Überspringe');
  });

  /**
   * Der Retry darf die Frist nicht überleben: `LinkupService.webSearch` nimmt
   * selbst kein Signal entgegen, sondern nur seinen eigenen 60-s-Timeout — ein
   * zweiter Versuch nach Fristablauf verbrennt also eine Minute, die für den
   * Bericht gedacht war.
   */
  it('startet nach dem Abbruch keinen zweiten Linkup-Versuch mehr', async () => {
    greenptService = null;
    const controller = new AbortController();
    controller.abort();
    const { webSuche, ctx } = setup();
    (ctx as { signal?: AbortSignal }).signal = controller.signal;

    const out = await webSuche.invoke({ query: 'Wien' });

    expect(linkupWebSearch).not.toHaveBeenCalled();
    expect(out).toContain('Überspringe');
  });

  it('refunds the search unit when no engine exists at all — nothing was asked of anyone', async () => {
    greenptService = null;
    linkupService = null;
    const { webSuche, ctx } = setup();
    const before = ctx.budget.searchesLeft;

    await webSuche.invoke({ query: 'Wien' });

    expect(ctx.budget.searchesLeft).toBe(before);
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

/**
 * The only genuinely expensive call in the run, so the tests here are about the
 * meter rather than the results: a `deep` call that slips past its own budget,
 * or one that is charged for a request that never happened, costs real money.
 */
describe('tiefen_suche', () => {
  it('spends exactly one deep call and asks Linkup at deep depth', async () => {
    linkupWebSearch.mockResolvedValue({
      results: [{ url: 'https://a.example', name: 'A', content: 'Inhalt' }],
    });
    const { tiefenSuche, ctx } = setup();
    const before = ctx.budget.deepSearchesLeft;

    const out = await tiefenSuche.invoke({ frage: 'Wie ambitioniert ist Wiens Klimaziel?' });

    expect(linkupWebSearch).toHaveBeenCalledTimes(1);
    expect(linkupWebSearch.mock.calls[0]?.[0]).toMatchObject({ depth: 'deep' });
    expect(ctx.budget.deepSearchesLeft).toBe(before - 1);
    expect(out).toContain('a.example');
    expect(ctx.sources.has('https://a.example')).toBe(true);
  });

  it('never touches the cheap search budget', async () => {
    linkupWebSearch.mockResolvedValue({ results: [] });
    const { tiefenSuche, ctx } = setup();
    const cheap = ctx.budget.searchesLeft;

    await tiefenSuche.invoke({ frage: 'Wien' });

    expect(ctx.budget.searchesLeft).toBe(cheap);
  });

  it('refuses once the deep budget is spent, without paying Linkup again', async () => {
    const { tiefenSuche, ctx } = setup();
    ctx.budget.deepSearchesLeft = 0;

    const out = await tiefenSuche.invoke({ frage: 'Wien' });

    expect(out).toContain('Tiefensuchen aufgebraucht');
    expect(linkupWebSearch).not.toHaveBeenCalled();
  });

  it('refuses once the soft deadline has passed, before spending anything', async () => {
    const { tiefenSuche, ctx } = setup({ softDeadlineAt: Date.now() - 1 });
    const before = ctx.budget.deepSearchesLeft;

    const out = await tiefenSuche.invoke({ frage: 'Wien' });

    expect(out).toContain('Zeitbudget aufgebraucht');
    expect(linkupWebSearch).not.toHaveBeenCalled();
    expect(ctx.budget.deepSearchesLeft).toBe(before);
  });

  it('points at web_suche instead of throwing when Linkup is absent', async () => {
    linkupService = null;
    const { tiefenSuche, ctx } = setup();
    const before = ctx.budget.deepSearchesLeft;

    const out = await tiefenSuche.invoke({ frage: 'Wien' });

    expect(out).toContain('web_suche');
    // Nothing was asked for, so nothing may be charged.
    expect(ctx.budget.deepSearchesLeft).toBe(before);
  });

  it('returns prose — never throws — when the deep call fails', async () => {
    linkupWebSearch.mockRejectedValue(new Error('timeout'));
    const { tiefenSuche, ctx } = setup();

    await expect(tiefenSuche.invoke({ frage: 'Wien' })).resolves.toContain('fehlgeschlagen');
    // The call was made, so it counts — a retry would cost twice.
    expect(ctx.budget.deepSearchesLeft).toBe(createBudget(Date.now()).deepSearchesLeft - 1);
  });

  it('marks the step failed so the sidebar does not hang on "running"', async () => {
    linkupWebSearch.mockRejectedValue(new Error('timeout'));
    const { tiefenSuche, ctx } = setup();

    await tiefenSuche.invoke({ frage: 'Wien' });

    expect(ctx.onStep).toHaveBeenCalledWith(expect.stringContaining('Tiefensuche'), 'failed');
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

    expect(out).toContain('nicht lesbar');
  });

  it('returns prose — never throws — when the crawler itself blows up', async () => {
    validateUrlForFetch.mockResolvedValue({ isValid: true, url: new URL('https://ok.example/x') });
    crawlAndDistill.mockRejectedValue(new Error('boom'));
    const { seiteLesen } = setup();

    await expect(seiteLesen.invoke({ url: 'https://ok.example/x' })).resolves.toContain(
      'nicht lesbar'
    );
  });

  it('retries a page that failed once, before giving up on it', async () => {
    validateUrlForFetch.mockResolvedValue({ isValid: true, url: new URL('https://ok.example/x') });
    crawlAndDistill
      .mockRejectedValueOnce(new Error('503'))
      .mockResolvedValueOnce([
        { url: 'https://ok.example/x', title: 'Seite', content: 'Der Inhalt', crawled: true },
      ]);
    const { seiteLesen, ctx } = setup();
    const before = ctx.budget.crawlsLeft;

    const out = await seiteLesen.invoke({ url: 'https://ok.example/x' });

    expect(crawlAndDistill).toHaveBeenCalledTimes(2);
    expect(out).toContain('Der Inhalt');
    // One page read, one unit spent — the retry is part of the same read.
    expect(ctx.budget.crawlsLeft).toBe(before - 1);
  });

  it('refunds a failed crawl, so a run of 503s does not spend the reading allowance on nothing', async () => {
    validateUrlForFetch.mockResolvedValue({ isValid: true, url: new URL('https://ok.example/x') });
    crawlAndDistill.mockRejectedValue(new Error('503'));
    const { seiteLesen, ctx } = setup();
    const before = ctx.budget.crawlsLeft;

    await seiteLesen.invoke({ url: 'https://ok.example/x' });

    expect(ctx.budget.crawlsLeft).toBe(before);
    expect(ctx.budget.crawlRefundsLeft).toBe(createBudget(Date.now()).crawlRefundsLeft - 1);
  });

  it('also refunds a page that came back unreadable', async () => {
    validateUrlForFetch.mockResolvedValue({ isValid: true, url: new URL('https://ok.example/x') });
    crawlAndDistill.mockResolvedValue([{ url: 'https://ok.example/x', crawled: false }]);
    const { seiteLesen, ctx } = setup();
    const before = ctx.budget.crawlsLeft;

    await seiteLesen.invoke({ url: 'https://ok.example/x' });

    expect(ctx.budget.crawlsLeft).toBe(before);
  });

  it('stops refunding once the refund cap is spent — failures then cost the run again', async () => {
    validateUrlForFetch.mockResolvedValue({ isValid: true, url: new URL('https://ok.example/x') });
    crawlAndDistill.mockRejectedValue(new Error('503'));
    const { seiteLesen, ctx } = setup();
    ctx.budget.crawlRefundsLeft = 0;
    const before = ctx.budget.crawlsLeft;

    await seiteLesen.invoke({ url: 'https://ok.example/x' });

    expect(ctx.budget.crawlsLeft).toBe(before - 1);
  });

  it('a successful read never touches the refund pool', async () => {
    validateUrlForFetch.mockResolvedValue({ isValid: true, url: new URL('https://ok.example/x') });
    crawlAndDistill.mockResolvedValue([
      { url: 'https://ok.example/x', title: 'Seite', content: 'Der Inhalt', crawled: true },
    ]);
    const { seiteLesen, ctx } = setup();

    await seiteLesen.invoke({ url: 'https://ok.example/x' });

    expect(ctx.budget.crawlRefundsLeft).toBe(createBudget(Date.now()).crawlRefundsLeft);
  });
});
