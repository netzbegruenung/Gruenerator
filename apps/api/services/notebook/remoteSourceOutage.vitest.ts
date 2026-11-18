/**
 * Fällt eine Remote-Quelle aus, darf das Notebook nie „keine passenden
 * Stellen" melden. Allein gefragt wird der Ausfall zum Fehler mit ihrem Namen;
 * neben anderen Sammlungen entsteht die Antwort ohne sie, und der Kontext nennt
 * sie (`unavailableSources` → Warnung `source_unavailable` im Stream).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const search = vi.fn();

vi.mock('../document-services/index.js', () => ({
  DocumentSearchService: class {
    search = (...args: unknown[]) => search(...args);
  },
}));
vi.mock('../QueryIntentService/QueryIntentService.js', () => ({
  queryIntentService: {
    detectDocumentScope: () => ({ collections: [], subcategoryFilters: {} }),
  },
}));
vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query: vi.fn() }),
}));
vi.mock('../bundestag/index.js', () => ({
  getEnrichedPersonSearchService: () => null,
}));

const { notebookQAService } = await import('./NotebookQAService.js');
const { REMOTE_TEST_ID, registerRemoteTestCollection } =
  await import('./__fixtures__/remoteSystemCollection.js');

const UNAVAILABLE = 'Bundestag-Quelle gerade nicht erreichbar';

function hit(i: number) {
  return {
    document_id: `doc-${i}`,
    title: `Dokument ${i}`,
    content: `Inhalt ${i}`,
    similarity: 0.9 - i / 100,
    similarity_score: 0.9 - i / 100,
    chunk_index: i,
    source_url: null,
  };
}

let unregister: () => void;
beforeAll(() => {
  unregister = registerRemoteTestCollection();
});
afterAll(() => unregister());

beforeEach(() => {
  search.mockReset();
  search.mockImplementation(async ({ options }: { options: Record<string, unknown> }) =>
    options.remoteSource
      ? { success: false, code: 'SOURCE_UNAVAILABLE', error: UNAVAILABLE, results: [] }
      : { success: true, results: Array.from({ length: 5 }, (_, i) => hit(i)) }
  );
});

describe('remote source outage in the notebook search', () => {
  it('passes the remote target to the search, not a Qdrant name', async () => {
    await notebookQAService
      .getSearchContext({
        question: 'Was sagen die Grünen zur Wärmepumpe?',
        collectionId: REMOTE_TEST_ID,
      })
      .catch(() => null);
    const options = search.mock.calls[0]![0].options;
    expect(options.remoteSource).toBe('bundestag-wrapped');
    expect(options.searchCollection).toBeUndefined();
  });

  it('alone: fails with the source name instead of "no passages"', async () => {
    await expect(
      notebookQAService.getSearchContext({
        question: 'Was sagen die Grünen zur Wärmepumpe?',
        collectionId: REMOTE_TEST_ID,
      })
    ).rejects.toThrow(UNAVAILABLE);
  });

  it('alone in a multi-collection request: same', async () => {
    await expect(
      notebookQAService.getSearchContext({
        question: 'Was sagen die Grünen zur Wärmepumpe?',
        collectionIds: [REMOTE_TEST_ID],
      })
    ).rejects.toThrow(UNAVAILABLE);
  });

  it('next to other collections: answers without it and names it', async () => {
    const context = await notebookQAService.getSearchContext({
      question: 'Was sagen die Grünen zur Wärmepumpe?',
      collectionIds: ['grundsatz-system', REMOTE_TEST_ID],
    });

    expect(context?.sortedResults.length).toBeGreaterThan(0);
    expect(context?.unavailableSources).toEqual([UNAVAILABLE]);
  });
});
