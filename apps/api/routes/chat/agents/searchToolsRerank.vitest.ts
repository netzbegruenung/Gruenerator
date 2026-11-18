/**
 * Der Rerank-Schalter des Loops (`LOOP_RERANK_ENABLED` → `rerankSearchChunks`)
 * muss bis in die Notebook-Suche reichen — für eine Einzelsammlung wie für das
 * österreichische Bündel. Fehlt er, verlöre die Suche den Reranker still, und
 * zwar unsichtbar, weil das Ergebnis inhaltlich gleich aussieht.
 *
 * Nur `searchCollectionAsNotebook` ist ersetzt; was es mit der Option tut,
 * prüft notebookCollectionSearch.vitest.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { AgentConfig } from './types.js';

const searchAsNotebook = vi.fn();

vi.mock('./notebookCollectionSearch.js', () => ({
  searchCollectionAsNotebook: searchAsNotebook,
}));

const { createSearchTools } = await import('./searchTools.js');

const AGENT = {
  identifier: 'gruenerator-universal',
  provider: 'mistral',
  model: 'mistral-medium-2604',
  params: {},
} as unknown as AgentConfig;

const reply = (collection: string) => ({
  collection,
  query: 'q',
  searchMode: 'hybrid',
  resultsCount: 0,
  results: [],
});

async function runSearch(
  locale: string,
  options: Record<string, unknown>,
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const tools = createSearchTools(AGENT, { userLocale: locale, ...options });
  const search = tools.gruenerator_search as {
    execute: (a: unknown, o: unknown) => Promise<Record<string, unknown>>;
  };
  return search.execute(args, { toolCallId: 'c1' });
}

beforeEach(() => {
  searchAsNotebook.mockReset();
  searchAsNotebook.mockImplementation((p: { collection: string }) =>
    Promise.resolve(reply(p.collection))
  );
});

describe('createSearchTools — rerankSearchChunks', () => {
  it.each([
    ['Einzelsammlung', 'de-DE', 'deutschland'],
    ['Bündel', 'de-AT', 'oesterreich'],
  ])('reicht die Option durch — %s', async (_n, locale, collection) => {
    await runSearch(locale, { rerankSearchChunks: true }, { query: 'Klima', collection });
    expect(searchAsNotebook).toHaveBeenCalledTimes(1);
    expect(searchAsNotebook.mock.calls[0]?.[0]).toMatchObject({ rerankChunks: true });
  });

  it.each([
    ['Einzelsammlung', 'de-DE', 'deutschland'],
    ['Bündel', 'de-AT', 'oesterreich'],
  ])('setzt ohne die Option gar keine Eigenschaft — %s', async (_n, locale, collection) => {
    await runSearch(locale, {}, { query: 'Klima', collection });
    expect(searchAsNotebook.mock.calls[0]?.[0]).not.toHaveProperty('rerankChunks');
  });

  it('gibt den Degradations-Marker der Suche an das Modell weiter', async () => {
    searchAsNotebook.mockResolvedValue({ ...reply('oesterreich'), rerankDegraded: true });
    const out = await runSearch(
      'de-AT',
      { rerankSearchChunks: true },
      { query: 'Klima', collection: 'oesterreich' }
    );
    expect(out.rerankDegraded).toBe(true);
  });
});
