/**
 * `textStats` / `textStatsBatched` gegen eine Attrappe von axios — kein
 * NLP-Dienst. Geprüft wird die Drahtform (`top_n`, `lemma_of`) und die
 * Fehlerregel: ein Ausfall liefert `[]`, auch wenn nur ein Stapel ausfällt —
 * sonst läse sich eine halbe Zählung als ganze.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const postMock = vi.fn();

vi.mock('axios', () => ({
  default: {
    post: (...args: unknown[]) => postMock(...args),
    get: vi.fn(),
    isAxiosError: () => false,
  },
}));

vi.mock('../../config/env.js', () => ({ env: { NLP_SERVICE_URL: 'http://nlp.test' } }));

vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { textStats, textStatsBatched } from './nlpClient.js';

import type { TextStatsResult } from './types.js';

function result(id: string): TextStatsResult {
  return {
    id,
    tokens: 3,
    words: 2,
    sentences: 1,
    lemmas: [{ lemma: 'wald', pos: 'NOUN', count: 2 }],
    forms: {},
  };
}

beforeEach(() => {
  postMock.mockReset();
});

describe('textStats', () => {
  it('posts the texts with top_n and lemma_of and returns the results', async () => {
    postMock.mockResolvedValueOnce({ data: { results: [result('d1')] } });
    const out = await textStats([{ id: 'd1', text: 'Der Wald.' }], {
      topN: 20,
      lemmaOf: ['wald'],
      timeoutMs: 1234,
    });
    expect(out).toEqual([result('d1')]);
    expect(postMock).toHaveBeenCalledWith(
      'http://nlp.test/analyze/text-stats',
      { texts: [{ id: 'd1', text: 'Der Wald.' }], top_n: 20, lemma_of: ['wald'] },
      { timeout: 1234 }
    );
  });

  it('returns [] when the service fails', async () => {
    postMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    expect(await textStats([{ id: 'd1', text: 'x' }])).toEqual([]);
  });

  it('does not call the service without texts', async () => {
    expect(await textStats([])).toEqual([]);
    expect(postMock).not.toHaveBeenCalled();
  });
});

describe('textStatsBatched', () => {
  const texts = ['a', 'b', 'c'].map((id) => ({ id, text: id }));

  it('sends batches and concatenates the results in input order', async () => {
    postMock.mockImplementation(async (_url: string, body: { texts: Array<{ id: string }> }) => ({
      data: { results: body.texts.map((t) => result(t.id)) },
    }));
    const out = await textStatsBatched(texts, {}, 2);
    expect(postMock).toHaveBeenCalledTimes(2);
    expect(out.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('returns [] when one batch fails, never a partial count', async () => {
    postMock
      .mockResolvedValueOnce({ data: { results: [result('a'), result('b')] } })
      .mockRejectedValueOnce(new Error('timeout'));
    expect(await textStatsBatched(texts, {}, 2)).toEqual([]);
  });
});
