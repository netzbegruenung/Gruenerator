/**
 * Zwischen der Fabrik und `executeDirectSearch` liegt `searchCollectionOrBundle`
 * mit ZWEI Zweigen: einer Einzelsammlung und dem Bündel-Fächer für Österreich
 * (`oesterreich` → zwei Qdrant-Sammlungen). Beide müssen die Option tragen —
 * ohne den zweiten verlöre jede AT-Suche den Reranker stillschweigend, und zwar
 * unsichtbar, weil das Ergebnis inhaltlich gleich aussieht.
 *
 * Nur `executeDirectSearch` ist ersetzt; die Fabrik und der Merge bleiben echt.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { AgentConfig } from './types.js';

const executeDirectSearch = vi.fn();

vi.mock('./directSearch.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./directSearch.js')>()),
  executeDirectSearch,
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
): Promise<void> {
  const tools = createSearchTools(AGENT, { userLocale: locale, ...options });
  const search = tools.gruenerator_search as {
    execute: (a: unknown, o: unknown) => Promise<unknown>;
  };
  await search.execute(args, { toolCallId: 'c1' });
}

beforeEach(() => {
  executeDirectSearch.mockReset();
  executeDirectSearch.mockImplementation((p: { collection: string }) =>
    Promise.resolve(reply(p.collection))
  );
});

describe('createSearchTools — rerankSearchChunks', () => {
  it('reicht die Option an eine Einzelsammlung durch', async () => {
    await runSearch(
      'de-DE',
      { rerankSearchChunks: true },
      { query: 'Klima', collection: 'deutschland' }
    );
    expect(executeDirectSearch).toHaveBeenCalledTimes(1);
    expect(executeDirectSearch.mock.calls[0]?.[0]).toMatchObject({ rerankChunks: true });
  });

  it('reicht die Option an JEDES Mitglied des Bündels durch', async () => {
    await runSearch(
      'de-AT',
      { rerankSearchChunks: true },
      { query: 'Klima', collection: 'oesterreich' }
    );
    expect(executeDirectSearch.mock.calls.length).toBeGreaterThan(1);
    for (const call of executeDirectSearch.mock.calls) {
      expect(call[0]).toMatchObject({ rerankChunks: true });
    }
  });

  it('setzt ohne die Option gar keine Eigenschaft — Einzelsammlung', async () => {
    await runSearch('de-DE', {}, { query: 'Klima', collection: 'deutschland' });
    expect(executeDirectSearch.mock.calls[0]?.[0]).not.toHaveProperty('rerankChunks');
  });

  it('setzt ohne die Option gar keine Eigenschaft — Bündel', async () => {
    await runSearch('de-AT', {}, { query: 'Klima', collection: 'oesterreich' });
    for (const call of executeDirectSearch.mock.calls) {
      expect(call[0]).not.toHaveProperty('rerankChunks');
    }
  });
});

describe('Bündel — Weitergabe des Degradations-Markers', () => {
  it('meldet das Bündel als degradiert, sobald EIN Mitglied es ist', async () => {
    let call = 0;
    executeDirectSearch.mockImplementation((p: { collection: string }) => {
      call += 1;
      return Promise.resolve(
        call === 1 ? { ...reply(p.collection), rerankDegraded: true } : reply(p.collection)
      );
    });

    const tools = createSearchTools(AGENT, { userLocale: 'de-AT', rerankSearchChunks: true });
    const search = tools.gruenerator_search as {
      execute: (a: unknown, o: unknown) => Promise<{ rerankDegraded?: boolean }>;
    };
    const out = await search.execute(
      { query: 'Klima', collection: 'oesterreich' },
      { toolCallId: 'c1' }
    );

    expect(out.rerankDegraded).toBe(true);
  });

  it('setzt nichts, wenn kein Mitglied degradiert war', async () => {
    const tools = createSearchTools(AGENT, { userLocale: 'de-AT', rerankSearchChunks: true });
    const search = tools.gruenerator_search as {
      execute: (a: unknown, o: unknown) => Promise<Record<string, unknown>>;
    };
    const out = await search.execute(
      { query: 'Klima', collection: 'oesterreich' },
      { toolCallId: 'c1' }
    );

    expect(out).not.toHaveProperty('rerankDegraded');
  });
});
