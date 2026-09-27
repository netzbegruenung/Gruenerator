import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { AgentConfig } from './types.js';

/**
 * Austria's material sits in two Qdrant collections — `oesterreich`
 * (programmes) and `gruene-at` (the website) — but an AT user has ONE notebook,
 * and making the planner choose between the two is a distinction it has no
 * basis to make: choosing wrong costs a whole corpus. So the enum offers one
 * key and the fan-out happens on execution.
 *
 * Only `executeDirectSearch` is replaced; `deduplicateByUrl` stays real, since
 * the merge is the thing under test.
 */
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

interface ToolResult {
  collection: string;
  resultsCount: number;
  results: Array<{ rank: number; source: string; url?: string; score?: number }>;
  error?: boolean;
}

function hit(source: string, score: number, url?: string) {
  return { rank: 1, relevance: 'hoch', source, excerpt: '…', searchMethod: 'hybrid', score, url };
}

function reply(collection: string, results: ReturnType<typeof hit>[]) {
  return { collection, query: 'q', searchMode: 'hybrid', resultsCount: results.length, results };
}

async function runSearch(locale: string, args: Record<string, unknown>): Promise<ToolResult> {
  const tools = createSearchTools(AGENT, { userLocale: locale });
  const search = tools.gruenerator_search as {
    execute: (a: unknown, o: unknown) => Promise<unknown>;
  };
  return (await search.execute(args, {})) as ToolResult;
}

beforeEach(() => {
  executeDirectSearch.mockReset();
});

describe('gruenerator_search — the Austrian bundle', () => {
  it('searches both Austrian corpora behind the single key', async () => {
    executeDirectSearch.mockImplementation(({ collection }: { collection: string }) =>
      Promise.resolve(
        reply(collection, [hit(`${collection}-treffer`, 0.5, `https://x/${collection}`)])
      )
    );

    const result = await runSearch('de-AT', { query: 'Klimaziele', collection: 'oesterreich' });

    expect(executeDirectSearch).toHaveBeenCalledTimes(2);
    expect(executeDirectSearch.mock.calls.map((c) => c[0].collection).sort()).toEqual([
      'gruene-at',
      'oesterreich',
    ]);
    // The model sees ONE collection, not the two behind it.
    expect(result.collection).toBe('oesterreich');
    expect(result.results.map((r) => r.source)).toEqual([
      'oesterreich-treffer',
      'gruene-at-treffer',
    ]);
  });

  it('re-ranks across both corpora instead of interleaving', async () => {
    // Same embedding model and hybrid weights on both sides, so the scores are
    // comparable. A fixed interleave would hand half the budget to whichever
    // corpus happens to be thinner on the topic.
    executeDirectSearch.mockImplementation(({ collection }: { collection: string }) =>
      Promise.resolve(
        collection === 'oesterreich'
          ? reply(collection, [hit('programm-schwach', 0.2, 'https://x/1')])
          : reply(collection, [
              hit('web-stark', 0.9, 'https://x/2'),
              hit('web-mittel', 0.5, 'https://x/3'),
            ])
      )
    );

    const result = await runSearch('de-AT', { query: 'Klimaziele', collection: 'oesterreich' });

    expect(result.results.map((r) => r.source)).toEqual([
      'web-stark',
      'web-mittel',
      'programm-schwach',
    ]);
    expect(result.results.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it('honours the limit across the merged list', async () => {
    executeDirectSearch.mockImplementation(({ collection }: { collection: string }) =>
      Promise.resolve(
        reply(collection, [
          hit(`${collection}-a`, 0.9, `https://x/${collection}/a`),
          hit(`${collection}-b`, 0.8, `https://x/${collection}/b`),
        ])
      )
    );

    const result = await runSearch('de-AT', {
      query: 'Klimaziele',
      collection: 'oesterreich',
      limit: 3,
    });

    expect(result.results).toHaveLength(3);
    expect(result.resultsCount).toBe(3);
  });

  it('drops a document both corpora returned', async () => {
    executeDirectSearch.mockImplementation(({ collection }: { collection: string }) =>
      Promise.resolve(reply(collection, [hit(`${collection}-treffer`, 0.5, 'https://x/geteilt')]))
    );

    const result = await runSearch('de-AT', { query: 'Klimaziele', collection: 'oesterreich' });

    expect(result.results).toHaveLength(1);
  });

  it('reports a partial result rather than an error when one corpus fails', async () => {
    executeDirectSearch.mockImplementation(({ collection }: { collection: string }) =>
      Promise.resolve(
        collection === 'oesterreich'
          ? { ...reply(collection, []), error: true, message: 'kaputt' }
          : reply(collection, [hit('web-treffer', 0.7, 'https://x/1')])
      )
    );

    const result = await runSearch('de-AT', { query: 'Klimaziele', collection: 'oesterreich' });

    expect(result.error).toBeUndefined();
    expect(result.results).toHaveLength(1);
  });

  it('errors only when every corpus failed', async () => {
    executeDirectSearch.mockImplementation(({ collection }: { collection: string }) =>
      Promise.resolve({ ...reply(collection, []), error: true, message: 'kaputt' })
    );

    const result = await runSearch('de-AT', { query: 'Klimaziele', collection: 'oesterreich' });

    expect(result.error).toBe(true);
  });

  it('leaves an ordinary key as a single search', async () => {
    executeDirectSearch.mockImplementation(({ collection }: { collection: string }) =>
      Promise.resolve(reply(collection, [hit('treffer', 0.5, 'https://x/1')]))
    );

    await runSearch('de-DE', { query: 'Artenschutz', collection: 'hessen' });

    expect(executeDirectSearch).toHaveBeenCalledTimes(1);
    expect(executeDirectSearch.mock.calls[0][0].collection).toBe('hessen');
  });
});
