import { describe, expect, it } from 'vitest';

import { buildMarketMenuActions } from './marketMenu';

const ids = (item: Parameters<typeof buildMarketMenuActions>[0]) =>
  buildMarketMenuActions(item).map((a) => a.id);

describe('buildMarketMenuActions', () => {
  it('offers editing, sharing and deleting only for own items', () => {
    expect(ids({ kind: 'agent', own: true, inLibrary: false })).toEqual([
      'chat',
      'details',
      'edit',
      'share',
      'delete',
    ]);
    expect(ids({ kind: 'agent', own: false, inLibrary: false })).toEqual(['chat', 'details']);
  });

  it('lets a library item be removed, not deleted', () => {
    expect(ids({ kind: 'recipe', own: false, inLibrary: true })).toEqual([
      'chat',
      'details',
      'remove',
    ]);
  });

  it('gives a task neither a chat start nor sharing', () => {
    expect(ids({ kind: 'task', own: true, inLibrary: false })).toEqual([
      'details',
      'edit',
      'delete',
    ]);
  });
});
