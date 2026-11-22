import { describe, expect, it } from 'vitest';

import { toGroupFeedItems } from './feed.js';
import {
  PROJECT_SEARCH_STATE_LABELS,
  hasSearchStateInProgress,
  searchSummary,
} from './searchState.js';

import type { GroupFeedItem } from './feed.js';

const item = (searchState: GroupFeedItem['searchState']) => ({ searchState }) as GroupFeedItem;

describe('searchSummary', () => {
  it('counts only items with a state', () => {
    expect(searchSummary([item('ready'), item('indexing'), item(null), item(undefined)])).toEqual({
      searchable: 1,
      total: 2,
    });
    expect(searchSummary([item(null)])).toEqual({ searchable: 0, total: 0 });
  });
  it('detects in-progress items', () => {
    expect(hasSearchStateInProgress([item('ready'), item('pending')])).toBe(true);
    expect(hasSearchStateInProgress([item('ready'), item('failed')])).toBe(false);
  });
});

it('has a label for every state', () => {
  expect(PROJECT_SEARCH_STATE_LABELS.over_cap).toContain('200');
});

describe('feed mapper', () => {
  it('carries search_state for documents', () => {
    const items = toGroupFeedItems({
      documents: [{ id: 'd', title: 'A', search_state: 'failed' }],
      collaborative_documents: [{ id: 'c', title: 'B', document_subtype: 'docs' }],
    } as never);
    expect(items.find((i) => i.id === 'd')?.searchState).toBe('failed');
    expect(items.find((i) => i.id === 'c')?.searchState).toBeNull();
  });
});
