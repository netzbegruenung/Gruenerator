import { describe, expect, it } from 'vitest';

import {
  collabSearchStates,
  deriveCollabSearchState,
  deriveDocumentSearchState,
  documentSearchStates,
} from './projectSearchState.js';

const doc = (over: Record<string, unknown> = {}) => ({
  id: 'd1',
  status: 'completed',
  vector_count: 5,
  user_id: 'u1',
  shared_at: '2026-01-01T00:00:00Z',
  ...over,
});
const collab = (over: Record<string, unknown> = {}) => ({
  id: 'c1',
  document_subtype: 'docs',
  updated_at: '2026-01-01T00:00:00Z',
  index_checked_at: '2026-01-02T00:00:00Z',
  index_chunk_count: 3,
  shared_at: '2026-01-01T00:00:00Z',
  ...over,
});

describe('deriveDocumentSearchState', () => {
  it('maps statuses', () => {
    expect(deriveDocumentSearchState(doc(), true)).toBe('ready');
    expect(deriveDocumentSearchState(doc(), false)).toBe('over_cap');
    expect(deriveDocumentSearchState(doc({ vector_count: 0 }), true)).toBe('not_searchable');
    expect(deriveDocumentSearchState(doc({ vector_count: null }), true)).toBe('not_searchable');
    for (const status of ['pending', 'uploaded', 'processing']) {
      expect(deriveDocumentSearchState(doc({ status }), true)).toBe('indexing');
    }
    expect(deriveDocumentSearchState(doc({ status: 'failed' }), true)).toBe('failed');
  });
});

describe('deriveCollabSearchState', () => {
  it('maps index rows', () => {
    expect(deriveCollabSearchState(collab({ document_subtype: 'video' }), true)).toBeNull();
    expect(
      deriveCollabSearchState(
        collab({ index_checked_at: null }),
        true,
        Date.parse('2026-01-01T00:01:00Z')
      )
    ).toBe('pending');
    // Ohne Text gibt es nie eine Indexzeile — nach der Schonfrist nicht mehr „bald".
    const old = collab({ index_checked_at: null, updated_at: '2026-01-01T00:00:00Z' });
    expect(deriveCollabSearchState(old, true, Date.parse('2026-01-01T00:20:00Z'))).toBe(
      'not_searchable'
    );
    expect(deriveCollabSearchState(old, true, Date.parse('2026-01-01T00:05:00Z'))).toBe('pending');
    expect(deriveCollabSearchState(collab({ updated_at: '2026-02-01T00:00:00Z' }), true)).toBe(
      'stale'
    );
    expect(deriveCollabSearchState(collab(), true)).toBe('ready');
    expect(deriveCollabSearchState(collab(), false)).toBe('over_cap');
  });
});

describe('caps', () => {
  it('marks documents beyond the newest 200 as over_cap', () => {
    const rows = Array.from({ length: 201 }, (_, i) =>
      doc({ id: `d${i}`, shared_at: new Date(2026, 0, 1, 0, i).toISOString() })
    );
    const states = documentSearchStates(rows);
    expect(states.get('d200')).toBe('ready');
    expect(states.get('d0')).toBe('over_cap');
  });
  it('marks collab docs beyond the newest 50 as over_cap', () => {
    const rows = Array.from({ length: 51 }, (_, i) =>
      collab({ id: `c${i}`, shared_at: new Date(2026, 0, 1, 0, i).toISOString() })
    );
    const states = collabSearchStates(rows);
    expect(states.get('c50')).toBe('ready');
    expect(states.get('c0')).toBe('over_cap');
  });
});
