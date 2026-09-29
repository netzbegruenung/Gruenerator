import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { AgentConfig } from './types.js';

/**
 * `gruenerator_search` reicht einen Inhaltstyp an die Dokumentsuche durch —
 * vom Modell gewählt oder vom Agenten gepinnt, und der Pin gewinnt: ein
 * Beschluss-Agent bleibt bei Beschlüssen, auch wenn das Modell `presse` sagt.
 */
const executeDirectSearch = vi.fn();

vi.mock('./directSearch.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./directSearch.js')>()),
  executeDirectSearch,
}));

const { createSearchTools } = await import('./searchTools.js');

function agent(extra: Partial<AgentConfig> = {}): AgentConfig {
  return {
    identifier: 'gruenerator-universal',
    provider: 'mistral',
    model: 'mistral-medium-2604',
    params: {},
    ...extra,
  } as unknown as AgentConfig;
}

async function run(config: AgentConfig, args: Record<string, unknown>): Promise<void> {
  const tools = createSearchTools(config, { userLocale: 'de-DE' });
  const search = tools.gruenerator_search as {
    execute: (a: unknown, o: unknown) => Promise<unknown>;
  };
  await search.execute(args, {});
}

beforeEach(() => {
  executeDirectSearch.mockReset();
  executeDirectSearch.mockResolvedValue({
    collection: 'hessen',
    query: 'q',
    searchMode: 'hybrid',
    resultsCount: 0,
    results: [],
  });
});

describe('gruenerator_search — content_type', () => {
  it('forwards the content type the model asked for', async () => {
    await run(agent(), { query: 'Radverkehr', collection: 'hessen', content_type: 'beschluss' });
    expect(executeDirectSearch.mock.calls[0]?.[0].lvContentType).toEqual(['beschluss']);
  });

  it('sends none when neither model nor agent asks for one', async () => {
    await run(agent(), { query: 'Radverkehr', collection: 'hessen' });
    expect(executeDirectSearch.mock.calls[0]?.[0]).not.toHaveProperty('lvContentType');
  });

  it("lets the agent's pin override the model's choice", async () => {
    await run(
      agent({ defaultFilter: { landesverband: ['HE', 'HE-F'], content_type: ['beschluss'] } }),
      {
        query: 'Radverkehr',
        collection: 'hessen',
        content_type: 'presse',
      }
    );
    expect(executeDirectSearch.mock.calls[0]?.[0].lvContentType).toEqual(['beschluss']);
  });
});
