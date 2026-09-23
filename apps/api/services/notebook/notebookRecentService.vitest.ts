/**
 * „Zuletzt hinzugefügt" verlinkt jede Karte — eine Wolke-Datei steht als
 * `wolke://<key>/<pfad>` in der Nutzlast und muss als Freigabe-Link ankommen.
 */
import { describe, expect, it, vi } from 'vitest';

const scrollDocuments = vi.fn();
vi.mock('../../database/services/QdrantService/index.js', () => ({
  getQdrantInstance: () => ({
    init: vi.fn(async () => undefined),
    operations: { scrollDocuments },
  }),
}));
vi.mock('../scrapers/utils/wolkeShareSecrets.js', () => ({
  resolveWolkeDisplayUrl: (url: string) =>
    url.replace('wolke://by-share/', 'https://wolke.netzbegruenung.de/s/TESTTOKEN#/'),
}));

const { fetchRecentForCollection } = await import('./notebookRecentService.js');

describe('fetchRecentForCollection', () => {
  it('links a Wolke file with its resolved share link', async () => {
    scrollDocuments.mockResolvedValueOnce([
      {
        id: 1,
        payload: {
          title: 'Antwort',
          source_url: 'wolke://by-share/A.pdf',
          published_at: '2026-09-01',
        },
      },
      {
        id: 2,
        payload: {
          title: 'Presse',
          source_url: 'https://gruene-bayern.de/a',
          published_at: '2026-08-01',
        },
      },
    ]);
    const cards = await fetchRecentForCollection('bayern-system', 5);
    expect(cards.map((c) => c.url)).toEqual([
      'https://wolke.netzbegruenung.de/s/TESTTOKEN#/A.pdf',
      'https://gruene-bayern.de/a',
    ]);
  });
});
