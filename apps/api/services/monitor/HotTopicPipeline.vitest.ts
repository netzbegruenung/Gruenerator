import { describe, expect, it, vi } from 'vitest';

// The module pulls in the research stack, the AI providers and Redis at import
// time. None of that is reachable from a unit test, and none of it is what the
// citation helpers below touch.
vi.mock('../../routes/chat/agents/directSearch.js', () => ({ executeResearch: vi.fn() }));
vi.mock('../ai/providers.js', () => ({
  getModel: vi.fn(),
  getPreferredMonitorProvider: vi.fn(() => 'mistral'),
}));
vi.mock('../../utils/redis/jsonCache.js', () => ({
  getCachedJson: vi.fn(),
  setCachedJson: vi.fn(),
}));
vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const { dedupeCitations, applyCiteMarkers } = await import('./HotTopicPipeline.js');

import { type ResearchCitation } from '../../routes/chat/agents/directSearch.js';

function citation(id: number, url: string, snippet = `Snippet ${id}`): ResearchCitation {
  return { id, title: `Quelle ${id}`, url, domain: 'example.com', snippet };
}

describe('dedupeCitations', () => {
  it('keeps distinct sources untouched and numbered from 1', () => {
    const result = dedupeCitations([
      citation(1, 'https://gruene.de/a'),
      citation(2, 'https://gruene.de/b'),
    ]);

    expect(result.citations.map((c) => c.id)).toEqual([1, 2]);
    expect(result.remap.get('2')).toBe('2');
  });

  it('folds the same page reached through www, tracking params and a trailing slash', () => {
    const result = dedupeCitations([
      citation(1, 'https://bundestag.de/presse/mitteilung'),
      citation(2, 'https://www.bundestag.de/presse/mitteilung/?utm_source=newsletter'),
    ]);

    expect(result.citations).toHaveLength(1);
    // The dropped source points at the survivor, so its markers stay meaningful.
    expect(result.remap.get('2')).toBe('1');
  });

  it('renumbers the survivors so the list has no gaps', () => {
    const result = dedupeCitations([
      citation(1, 'https://gruene.de/a'),
      citation(2, 'https://gruene.de/a'),
      citation(3, 'https://gruene.de/c'),
    ]);

    expect(result.citations.map((c) => c.id)).toEqual([1, 2]);
    expect(result.citations[1]?.title).toBe('Quelle 3');
    expect(result.remap.get('3')).toBe('2');
  });

  it('identifies a source without a URL by its snippet', () => {
    const result = dedupeCitations([
      citation(1, '', 'Die   Grünen haben gefordert'),
      citation(2, '', 'Die Grünen haben gefordert'),
    ]);

    expect(result.citations).toHaveLength(1);
  });

  it('keeps sources that carry neither URL nor snippet rather than folding them together', () => {
    const result = dedupeCitations([citation(1, '', ''), citation(2, '', '')]);

    expect(result.citations).toHaveLength(2);
  });
});

describe('applyCiteMarkers', () => {
  it('moves a marker onto the id its source ended up with', () => {
    const { remap } = dedupeCitations([
      citation(1, 'https://gruene.de/a'),
      citation(2, 'https://gruene.de/a'),
      citation(3, 'https://gruene.de/c'),
    ]);

    expect(applyCiteMarkers('Erst [1], dann [2], dann [3].', remap)).toBe(
      'Erst [cite:1], dann [cite:1], dann [cite:2].'
    );
  });

  it('leaves an invented marker as plain text', () => {
    const { remap } = dedupeCitations([citation(1, 'https://gruene.de/a')]);

    expect(applyCiteMarkers('Steht so in [7].', remap)).toBe('Steht so in [7].');
  });
});
