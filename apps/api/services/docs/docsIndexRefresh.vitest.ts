import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Docs = typeof import('./docsIndex.js');
type Refresh = typeof import('./docsIndexRefresh.js');

const LIVE_ONLY_URL = '/docs/features/nur-auf-der-live-seite';

const liveIndex = {
  version: 1,
  pages: [
    {
      url: LIVE_ONLY_URL,
      title: 'Zebrastreifen-Planer',
      category: 'Features',
      lead: 'Plant Zebrastreifen.',
    },
  ],
  sections: [
    {
      url: LIVE_ONLY_URL,
      pageTitle: 'Zebrastreifen-Planer',
      heading: 'Zebrastreifen-Planer',
      anchor: '',
      category: 'Features',
      text: 'Der Zebrastreifen-Planer plant Zebrastreifen vor Schulen.',
    },
  ],
};

function json(body: unknown, etag = '"v1"'): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { etag } });
}

let docs: Docs;
let refresh: Refresh;
const fetchMock = vi.fn<typeof fetch>();

beforeEach(async () => {
  // Fresh module state (index, etag, failure streak) for every case.
  vi.resetModules();
  vi.stubGlobal('fetch', fetchMock);
  docs = await import('./docsIndex.js');
  refresh = await import('./docsIndexRefresh.js');
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe('refreshDocsIndex', () => {
  it('serves the bundled index until the live one has loaded', () => {
    expect(docs.docsIndexStats().pages).toBeGreaterThan(20);
    expect(docs.searchDocs('Zebrastreifen-Planer').map((hit) => hit.url)).not.toContain(
      `https://doku.gruenerator.eu${LIVE_ONLY_URL}`
    );
  });

  it('swaps in the live index for search, related pages and the page map', async () => {
    docs.buildDocsPageMap(); // warm the cache the swap has to drop
    fetchMock.mockResolvedValueOnce(json(liveIndex));

    await expect(refresh.refreshDocsIndex()).resolves.toBe('updated');

    expect(fetchMock).toHaveBeenCalledWith(refresh.DOCS_INDEX_URL, expect.anything());
    expect(docs.docsIndexStats()).toEqual({ pages: 1, sections: 1 });
    const live = `https://doku.gruenerator.eu${LIVE_ONLY_URL}`;
    expect(docs.searchDocs('Zebrastreifen')[0]?.url).toBe(live);
    expect(docs.relatedDocsPages('Zebrastreifen')).toEqual([
      { url: live, title: 'Zebrastreifen-Planer' },
    ]);
    expect(docs.buildDocsPageMap()).toContain(live);
  });

  it('revalidates with the ETag and keeps the index on 304', async () => {
    fetchMock.mockResolvedValueOnce(json(liveIndex, '"abc"'));
    await refresh.refreshDocsIndex();

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 304 }));
    await expect(refresh.refreshDocsIndex()).resolves.toBe('unchanged');

    const init = fetchMock.mock.calls[1]?.[1];
    expect(init?.headers).toEqual({ 'If-None-Match': '"abc"' });
    expect(docs.docsIndexStats().pages).toBe(1);
  });

  it.each([
    ['an HTTP error', () => new Response('Not Found', { status: 404 })],
    ['an unknown format version', () => json({ ...liveIndex, version: 2 })],
    ['an empty index', () => json({ ...liveIndex, pages: [] })],
    ['a non-docs URL', () => json({ ...liveIndex, pages: [{ ...liveIndex.pages[0], url: '/x' }] })],
  ])('keeps the last good index on %s', async (_label, failure) => {
    fetchMock.mockResolvedValueOnce(json(liveIndex));
    await refresh.refreshDocsIndex();

    fetchMock.mockResolvedValueOnce(failure());
    await expect(refresh.refreshDocsIndex()).resolves.toBe('failed');
    expect(docs.docsIndexStats()).toEqual({ pages: 1, sections: 1 });
  });

  it('keeps the bundled index when the site is unreachable', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));

    await expect(refresh.refreshDocsIndex()).resolves.toBe('failed');
    expect(docs.docsIndexStats().pages).toBeGreaterThan(20);
  });
});
