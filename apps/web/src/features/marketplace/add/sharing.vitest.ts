import { describe, expect, it } from 'vitest';

import { applySharing, sharingVisibility, type SharingState } from './sharing';

function recorder() {
  const calls: string[] = [];
  return {
    calls,
    ops: {
      setMode: async (mode: string) => void calls.push(`mode:${mode}`),
      setPublic: async (input: { is_public: boolean; public_ownership: string | null }) =>
        void calls.push(`public:${input.is_public}:${input.public_ownership}`),
      addGroup: async (id: string) => void calls.push(`add:${id}`),
      removeGroup: async (id: string) => void calls.push(`remove:${id}`),
    },
  };
}

const state = (over: Partial<SharingState> = {}): SharingState => ({
  shareMode: 'private',
  isPublic: false,
  groupIds: [],
  ...over,
});

describe('sharingVisibility', () => {
  it('reads the listing first, then project shares, then private', () => {
    expect(sharingVisibility(state({ shareMode: 'authenticated', isPublic: true }))).toBe('public');
    expect(sharingVisibility(state({ groupIds: ['g1'] }))).toBe('project');
    expect(sharingVisibility(state({ shareMode: 'groups' }))).toBe('project');
    expect(sharingVisibility(state())).toBe('private');
  });

  it('preselects nothing for „with login, by link", which is none of the three', () => {
    expect(sharingVisibility(state({ shareMode: 'authenticated' }))).toBeNull();
  });
});

describe('applySharing', () => {
  it('opens the mode to authenticated before it lists', async () => {
    const { calls, ops } = recorder();
    await applySharing({ choice: 'public', ownership: 'owner', audience: 'all' }, state(), ops);
    expect(calls).toEqual(['mode:authenticated', 'public:true:owner']);
  });

  it('lists an already authenticated item without touching the mode', async () => {
    const { calls, ops } = recorder();
    await applySharing(
      { choice: 'public', ownership: 'public_data', audience: 'all' },
      state({ shareMode: 'authenticated' }),
      ops
    );
    expect(calls).toEqual(['public:true:public_data']);
  });

  it('moves a public item into projects: unlist, add, remove, then narrow the mode', async () => {
    const { calls, ops } = recorder();
    await applySharing(
      { choice: 'project', groupIds: ['g2'] },
      state({ shareMode: 'authenticated', isPublic: true, groupIds: ['g1'] }),
      ops
    );
    expect(calls).toEqual(['public:false:null', 'add:g2', 'remove:g1', 'mode:groups']);
  });

  it('takes everything back for „Privat"', async () => {
    const { calls, ops } = recorder();
    await applySharing(
      { choice: 'private' },
      state({ shareMode: 'groups', groupIds: ['g1', 'g2'] }),
      ops
    );
    expect(calls).toEqual(['remove:g1', 'remove:g2', 'mode:private']);
  });
});
