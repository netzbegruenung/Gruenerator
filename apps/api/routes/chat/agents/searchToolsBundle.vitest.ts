import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { AgentConfig } from './types.js';

/**
 * Austria's material sits in two Qdrant collections — `oesterreich`
 * (programmes) and `gruene-at` (the website) — but an AT user has ONE notebook,
 * and making the planner choose between the two is a distinction it has no
 * basis to make: choosing wrong costs a whole corpus. So the enum offers one
 * key and the fan-out happens on execution.
 *
 * The fan-out is now ONE multi-collection notebook search (the pipeline ranks
 * across members — see notebookCollectionSearch.vitest.ts); this file pins that
 * the tool hands it the members.
 */
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

async function runSearch(locale: string, args: Record<string, unknown>): Promise<void> {
  const tools = createSearchTools(AGENT, { userLocale: locale });
  const search = tools.gruenerator_search as {
    execute: (a: unknown, o: unknown) => Promise<unknown>;
  };
  await search.execute(args, {});
}

beforeEach(() => {
  searchAsNotebook.mockReset();
  searchAsNotebook.mockResolvedValue({
    collection: 'x',
    query: 'q',
    searchMode: 'hybrid',
    resultsCount: 0,
    results: [],
  });
});

describe('gruenerator_search — the Austrian bundle', () => {
  it('searches both Austrian corpora behind the single key, in one call', async () => {
    await runSearch('de-AT', { query: 'Klimaschutz', collection: 'oesterreich' });
    expect(searchAsNotebook).toHaveBeenCalledTimes(1);
    expect(searchAsNotebook.mock.calls[0]?.[0]).toMatchObject({
      collection: 'oesterreich',
      members: ['oesterreich', 'gruene-at'],
    });
  });

  it('leaves an ordinary key as a single-collection search', async () => {
    await runSearch('de-DE', { query: 'Klimaschutz', collection: 'hessen' });
    expect(searchAsNotebook.mock.calls[0]?.[0]).toMatchObject({
      collection: 'hessen',
      members: ['hessen'],
    });
  });

  it('asks for eight sources when the model names no limit', () => {
    // The default lives in the schema; the AI SDK applies it before `execute`.
    const schema = (
      createSearchTools(AGENT, { userLocale: 'de-DE' }).gruenerator_search as {
        inputSchema: { parse: (v: unknown) => { limit: number } };
      }
    ).inputSchema;
    expect(schema.parse({ query: 'Klimaschutz' }).limit).toBe(8);
  });
});
