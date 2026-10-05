import { describe, expect, it, vi } from 'vitest';

import {
  coverageTerms,
  coversQuery,
  fetchTermFrequencies,
  loadTermFrequencies,
  matchedQueryTerms,
} from './queryCoverage.js';

import type { QdrantClient } from '@qdrant/js-client-rest';

// Chunk counts from the Berlin slice of landesverbaende_documents, 05.10.2026.
const BERLIN = new Map([
  ['hitzeschutz', 36],
  ['berliner', 3251],
  ['schulen', 592],
  ['berlin', 4507],
  ['strand', 0],
  ['bauen', 244],
]);

describe('coverageTerms', () => {
  it('drops function words and punctuation', () => {
    expect(coverageTerms('Was tun die Grünen gegen Hitze in der Stadt?')).toEqual([
      'tun',
      'grünen',
      'hitze',
      'stadt',
    ]);
  });
});

describe('matchedQueryTerms', () => {
  it('matches compounds and umlaut spellings as substrings', () => {
    expect(
      matchedQueryTerms(
        ['Hitzeschutzplan für Berliner Schulen', 'Waelder im Wandel'],
        ['hitzeschutz', 'schulen', 'wälder', 'strand']
      )
    ).toEqual(['hitzeschutz', 'schulen', 'wälder']);
  });
});

describe('coversQuery', () => {
  const terms = ['hitzeschutz', 'berliner', 'schulen'];

  it('accepts a document missing one common term when it has the rarest', () => {
    expect(coversQuery(['hitzeschutz', 'berliner'], terms, BERLIN)).toBe(true);
  });

  it('rejects a document whose only gap is the rarest term', () => {
    // "Schulen in Berlin am Strand bauen": generic words alone carry no match.
    const strand = ['schulen', 'berlin', 'strand', 'bauen'];
    expect(coversQuery(['schulen', 'berlin', 'bauen'], strand, BERLIN)).toBe(false);
  });

  it('demands both terms of a two-word query', () => {
    expect(coversQuery(['hitzeschutz'], ['hitzeschutz', 'schulen'], BERLIN)).toBe(false);
    expect(coversQuery(['hitzeschutz', 'schulen'], ['hitzeschutz', 'schulen'], BERLIN)).toBe(true);
  });

  it('leaves single words to term_chunk_count', () => {
    expect(coversQuery(['hitzeschutz'], ['hitzeschutz'], BERLIN)).toBe(false);
  });

  it('says no when a frequency is unknown', () => {
    expect(coversQuery(terms, terms, new Map([['hitzeschutz', 36]]))).toBe(false);
  });
});

describe('fetchTermFrequencies', () => {
  it('counts each term inside the collection slice and caches the count', async () => {
    const count = vi.fn(async () => ({ count: 7 }));
    const client = { count } as unknown as QdrantClient;
    const filter = { must: [{ key: 'landesverband', match: { any: ['BE', 'BE-F'] } }] };

    const first = await fetchTermFrequencies(client, 'lv_test', filter, ['wolf', 'wald']);
    const second = await fetchTermFrequencies(client, 'lv_test', filter, ['wolf']);

    expect(first).toEqual(
      new Map([
        ['wolf', 7],
        ['wald', 7],
      ])
    );
    expect(second.get('wolf')).toBe(7);
    expect(count).toHaveBeenCalledTimes(2);
    expect(count).toHaveBeenCalledWith('lv_test', {
      filter: {
        must: [
          { key: 'landesverband', match: { any: ['BE', 'BE-F'] } },
          { key: 'chunk_text', match: { text: 'wolf' } },
        ],
      },
      exact: true,
    });
  });
});

describe('loadTermFrequencies', () => {
  it('initialises Qdrant before counting and stays quiet when it fails', async () => {
    const init = vi.fn(async () => {
      throw new Error('Qdrant down');
    });

    const result = await loadTermFrequencies({ init, client: null }, 'lv', undefined, [
      'a1x',
      'b2y',
    ]);

    expect(init).toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it('gives up after the deadline instead of holding the search', async () => {
    const count = vi.fn(() => new Promise<{ count: number }>(() => {}));
    const client = { count } as unknown as QdrantClient;

    const result = await loadTermFrequencies(
      { init: async () => {}, client },
      'lv_slow',
      undefined,
      ['langsam', 'zaeh'],
      20
    );

    expect(result).toBeNull();
  });

  it('skips single-word queries', async () => {
    const init = vi.fn(async () => {});
    expect(await loadTermFrequencies({ init, client: null }, 'lv', undefined, ['wolf'])).toBeNull();
    expect(init).not.toHaveBeenCalled();
  });
});
