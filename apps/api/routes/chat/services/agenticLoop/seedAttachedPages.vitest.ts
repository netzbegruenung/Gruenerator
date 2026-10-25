/**
 * Der Vorab-Abruf der @link-Seiten (#4896): ein Chip schickt seine Adresse in
 * `webpageUrls`, nie im Text — ohne Seed hatte der Planer ein Lesewerkzeug
 * ohne Ziel.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { seedAttachedPages } from './catalogAssembly.js';
import { createSourceRegistry } from './sourceRegistry.js';

import type { ChatGraphState } from '../../../../agents/langgraph/ChatGraph/types.js';

const crawl = vi.hoisted(() => vi.fn<(...a: unknown[]) => Promise<unknown>>());
vi.mock('../../../../services/search/index.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  crawlAndDistill: (...a: unknown[]) => crawl(...a),
}));
const validate = vi.hoisted(() =>
  vi.fn(async (raw: string) =>
    raw.includes('127.0.0.1')
      ? { isValid: false, error: 'private' }
      : { isValid: true, url: new URL(raw) }
  )
);
vi.mock('../../../../utils/validation/urlSecurity.js', () => ({
  validateUrlForFetch: (raw: string) => validate(raw),
}));

const PAGE = 'https://example.org/radweg';

describe('seedAttachedPages', () => {
  const stateWith = (over: Record<string, unknown> = {}) =>
    ({
      attachedWebpageUrls: [PAGE],
      carriedWebpageUrls: [],
      lastUserTextNoMentions: 'Wann wird der Radweg gebaut?',
      agentConfig: { userId: 'u1' },
      ...over,
    }) as unknown as ChatGraphState;

  const run = (state: ChatGraphState, isMounted = true) => {
    const sourceRegistry = createSourceRegistry();
    return seedAttachedPages({
      state,
      sourceRegistry,
      isMounted,
      onInfo: () => {},
      onError: () => {},
    }).then((seeded) => ({ ...seeded, sourceRegistry }));
  };

  beforeEach(() => {
    crawl.mockReset();
    crawl.mockImplementation(async (seeds) =>
      (seeds as { url: string }[]).map((s) => ({
        url: s.url,
        title: 'Radweg-Planung',
        content: 'Baubeginn ist im Frühjahr 2027.',
        crawled: true,
      }))
    );
    validate.mockClear();
  });

  it('liest die @link-Seite dieses Turns und zeigt sie dem Planer als scrape_url-Aufruf', async () => {
    const { replay, delivered, sourceRegistry } = await run(stateWith());

    expect(delivered).toBe(true);
    expect(sourceRegistry.renderAll()).toContain('Baubeginn ist im Frühjahr 2027.');
    expect(sourceRegistry.freshSize).toBe(0);
    const call = (replay[0]?.content as { toolName: string; input: unknown }[])[0];
    expect(call?.toolName).toBe('scrape_url');
    expect(call?.input).toEqual({ urls: [PAGE] });
  });

  it('liest mitgeführte Seiten früherer Turns, wenn dieser Turn keine eigene nennt', async () => {
    const { delivered } = await run(
      stateWith({ attachedWebpageUrls: [], carriedWebpageUrls: [PAGE] })
    );

    expect(delivered).toBe(true);
    expect(crawl).toHaveBeenCalledTimes(1);
  });

  it('lässt mitgeführte Seiten liegen, wenn der Text selbst eine Adresse nennt', async () => {
    const { delivered } = await run(
      stateWith({
        attachedWebpageUrls: [],
        carriedWebpageUrls: [PAGE],
        lastUserTextNoMentions: 'Und was steht auf https://example.com/neu?',
      })
    );

    expect(delivered).toBe(false);
    expect(crawl).not.toHaveBeenCalled();
  });

  it('geht nicht ins Netz, wenn scrape_url nicht montiert ist', async () => {
    const { delivered } = await run(stateWith(), false);

    expect(delivered).toBe(false);
    expect(crawl).not.toHaveBeenCalled();
  });

  it('respektiert den abgeschalteten Scrape-Schalter im Composer', async () => {
    const { delivered } = await run(stateWith({ enabledTools: { scrape: false } }));

    expect(delivered).toBe(false);
    expect(crawl).not.toHaveBeenCalled();
  });

  it('läuft durch dieselbe SSRF-Prüfung wie das Werkzeug', async () => {
    const { delivered } = await run(stateWith({ attachedWebpageUrls: ['http://127.0.0.1/admin'] }));

    expect(validate).toHaveBeenCalledWith('http://127.0.0.1/admin');
    expect(delivered).toBe(false);
    expect(crawl).not.toHaveBeenCalled();
  });

  it('übergeht einen Wolke-Freigabe-Link — der liefert beim Crawlen nur die SPA-Hülle', async () => {
    const { delivered } = await run(
      stateWith({ attachedWebpageUrls: ['https://wolke.netzbegruenung.de/s/AbCdEf123'] })
    );

    expect(delivered).toBe(false);
    expect(crawl).not.toHaveBeenCalled();
  });
});
