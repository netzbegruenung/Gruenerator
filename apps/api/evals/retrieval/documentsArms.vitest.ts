import { describe, expect, it } from 'vitest';

import { answeredByFullScan, distinctNotebookFilters } from './documentsArms.js';

import type { RetrievalCase } from './cases.js';

function notebookCase(id: string, documentIds: string[]): RetrievalCase {
  return {
    id,
    collection: 'user',
    query: 'q',
    expect: [],
    kind: 'notebook',
    notebook: { user: { collectionId: 'c', name: 'n', documentIds } },
  };
}

describe('distinctNotebookFilters', () => {
  it('runs a document set once even when two cases share it, in any order', () => {
    const filters = distinctNotebookFilters([
      notebookCase('a', ['x', 'y']),
      notebookCase('b', ['y', 'x']),
      notebookCase('c', ['z']),
    ]);
    expect(filters).toEqual([
      { label: 'a', documentIds: ['x', 'y'] },
      { label: 'c', documentIds: ['z'] },
    ]);
  });

  it('ignores cases without a user document set', () => {
    expect(distinctNotebookFilters([notebookCase('a', [])])).toEqual([]);
  });
});

describe('answeredByFullScan', () => {
  it('reads a perfect minimal-beam recall as a full scan', () => {
    expect(answeredByFullScan({ overlap: 120, total: 120 })).toBe(true);
  });

  it('reads any loss at the minimal beam as a real graph walk', () => {
    expect(answeredByFullScan({ overlap: 88, total: 120 })).toBe(false);
  });

  it('does not call an empty run a full scan', () => {
    expect(answeredByFullScan({ overlap: 0, total: 0 })).toBe(false);
  });
});
