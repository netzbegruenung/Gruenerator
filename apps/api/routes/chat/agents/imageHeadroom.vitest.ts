/**
 * Whether Linkup counts image entries toward `maxResults` is NOT documented — the
 * reference only promises "the number of results will always be ≤ maxResults",
 * and images arrive inside that same array.
 *
 * If they do count, asking for images silently costs the answer its sources: with
 * `maxResults: 5` and three images returned, the model is left with two text hits
 * while the tier promised five. Nothing would fail; the answers would just get
 * thinner whenever someone asked for pictures. So the image budget is requested on
 * TOP instead of hoped about — free, because Linkup prices a search by
 * `depth` × `outputType` and `maxResults` is not a pricing dimension.
 */

import { describe, it, expect, vi } from 'vitest';

const webSearch = vi.fn<(params: Record<string, unknown>) => Promise<unknown>>();

vi.mock('../../../services/search/LinkupService.js', () => ({
  getLinkupService: () => ({ webSearch }),
}));

const { executeDirectWebSearch } = await import('./directSearchExecutors.js');

/** Mirrors MAX_IMAGE_HITS in directSearchExecutors — module-private there. */
const IMAGE_BUDGET = 8;

describe('image headroom on maxResults', () => {
  it('asks for the image budget on top when images are requested', async () => {
    webSearch.mockResolvedValueOnce({ results: [] });
    await executeDirectWebSearch({ query: 'Fotos der Demo', maxResults: 5, includeImages: true });
    expect(webSearch.mock.calls[0]![0].maxResults).toBe(5 + IMAGE_BUDGET);
  });

  it('leaves an ordinary search untouched', async () => {
    // No images asked for → no headroom. A factual question must not start
    // pulling extra results because of a feature it never used.
    webSearch.mockClear();
    webSearch.mockResolvedValueOnce({ results: [] });
    await executeDirectWebSearch({ query: 'Zahlen zum Ausbau', maxResults: 5 });
    expect(webSearch.mock.calls[0]![0].maxResults).toBe(5);
  });

  it('still hands the answer at most maxResults text sources', async () => {
    // The headroom must not leak out as extra sources — it exists to protect the
    // tier's promise, not to quietly exceed it.
    webSearch.mockClear();
    webSearch.mockResolvedValueOnce({
      results: Array.from({ length: 13 }, (_, i) => ({
        name: `T${i}`,
        url: `https://a.de/${i}`,
        content: 'text',
      })),
    });
    const out = await executeDirectWebSearch({
      query: 'Fotos der Demo',
      maxResults: 5,
      includeImages: true,
    });
    expect(out.results).toHaveLength(5);
  });

  it('keeps the full image budget even when the engine fills the headroom with text', async () => {
    webSearch.mockClear();
    webSearch.mockResolvedValueOnce({
      results: [
        ...Array.from({ length: 10 }, (_, i) => ({
          name: `T${i}`,
          url: `https://a.de/${i}`,
          content: 'text',
        })),
        ...Array.from({ length: 3 }, (_, i) => ({
          name: `B${i}`,
          url: `https://a.de/b${i}.jpg`,
          content: '',
          type: 'image',
        })),
      ],
    });
    const out = await executeDirectWebSearch({
      query: 'Fotos der Demo',
      maxResults: 5,
      includeImages: true,
    });
    expect(out.results).toHaveLength(5);
    expect(out.images).toHaveLength(3);
  });
});
