import { describe, it, expect } from 'vitest';

import { isNamedSourceUnavailable, partitionSearchErrors } from './types.js';

/**
 * Retrieval failures need two different sentences: "the search backends are
 * down" versus "this file you attached could not be read". The second kind was
 * collected all along and then filtered away by the availability predicate, so
 * the answer silently omitted the source.
 */

describe('partitionSearchErrors', () => {
  it('reports nothing for a clean turn', () => {
    expect(partitionSearchErrors([])).toEqual({
      coreDegraded: false,
      unavailableSources: [],
      needsReauth: false,
    });
    expect(partitionSearchErrors(undefined).coreDegraded).toBe(false);
  });

  it('flags a search backend outage as core degradation', () => {
    const result = partitionSearchErrors([
      { source: 'documents:deutschland', message: 'timeout' },
    ]);

    expect(result.coreDegraded).toBe(true);
    expect(result.unavailableSources).toEqual([]);
  });

  it('names a single attached source that could not be read', () => {
    const result = partitionSearchErrors([{ source: 'wolke:abc', message: 'download failed' }]);

    expect(result.coreDegraded).toBe(false);
    expect(result.unavailableSources).toEqual(['wolke:abc']);
  });

  it('separates both kinds in the same turn', () => {
    const result = partitionSearchErrors([
      { source: 'web', message: 'searxng down' },
      { source: 'connect:xyz', message: 'token expired', reauth: true },
    ]);

    expect(result.coreDegraded).toBe(true);
    expect(result.unavailableSources).toEqual(['connect:xyz']);
    expect(result.needsReauth).toBe(true);
  });

  it('deduplicates repeated failures of the same source', () => {
    const result = partitionSearchErrors([
      { source: 'wolke:abc', message: 'first' },
      { source: 'wolke:abc', message: 'second' },
    ]);

    expect(result.unavailableSources).toEqual(['wolke:abc']);
  });

  it('does not claim reauth for an ordinary read failure', () => {
    const result = partitionSearchErrors([{ source: 'connect:xyz', message: 'download failed' }]);

    expect(result.needsReauth).toBe(false);
  });

  it('ignores soft LLM-stage failures — they say nothing about sources', () => {
    const result = partitionSearchErrors([
      { source: 'rerank', message: 'model timeout' },
      { source: 'briefGenerator', message: 'unparseable' },
    ]);

    expect(result.coreDegraded).toBe(false);
    expect(result.unavailableSources).toEqual([]);
  });
});

describe('isNamedSourceUnavailable', () => {
  it('covers every prefix the multi-doc fan-out emits', () => {
    for (const source of ['wolke:a', 'connect:b', 'doc_mention:c', 'notebook:d:coll']) {
      expect(isNamedSourceUnavailable({ source })).toBe(true);
    }
  });

  it('does not claim search-backend errors', () => {
    expect(isNamedSourceUnavailable({ source: 'web' })).toBe(false);
    expect(isNamedSourceUnavailable({ source: 'documents:deutschland' })).toBe(false);
  });
});
