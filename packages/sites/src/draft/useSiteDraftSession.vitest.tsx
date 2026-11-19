import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as Y from 'yjs';

import { seededDoc } from './testDoc';

const hoisted = vi.hoisted(() => ({
  collab: { current: null as unknown },
  roomsSeen: [] as string[],
  lastRoom: { current: '' },
  returned: { current: null as unknown },
  prepare: vi.fn(),
}));

vi.mock('@gruenerator/collab', () => ({
  // Like the shared hook: the render in which the room changes still sees the previous state.
  useCollaboration: (o: { documentId: string }) => {
    hoisted.roomsSeen.push(o.documentId);
    const switching = hoisted.lastRoom.current !== o.documentId;
    hoisted.lastRoom.current = o.documentId;
    if (switching && hoisted.returned.current) return hoisted.returned.current;
    hoisted.returned.current = hoisted.collab.current;
    return hoisted.collab.current;
  },
  useSyncGate: () => 'ready',
}));
vi.mock('../SitesContext', () => ({
  useAuth: () => ({ user: { id: 'u1' } }),
  useSitesCollaboration: () => ({}),
}));
vi.mock('../hooks/useSite', () => ({ usePrepareSiteDraft: () => hoisted.prepare }));

import { useSiteDraftSession } from './useSiteDraftSession';

function fakeProvider() {
  return { on: vi.fn(), off: vi.fn(), unsyncedChanges: 0, disconnect: vi.fn() };
}

function collabState(ydoc: Y.Doc, provider: unknown) {
  return {
    ydoc,
    provider,
    isConnected: true,
    isSynced: true,
    isLocalLoaded: true,
    authError: null,
    isReadOnly: false,
  };
}

describe('useSiteDraftSession', () => {
  beforeEach(() => {
    hoisted.roomsSeen.length = 0;
    hoisted.lastRoom.current = '';
    hoisted.returned.current = null;
    hoisted.prepare.mockReset();
    hoisted.prepare.mockResolvedValue(true);
  });

  it('connects only after prepare succeeded and is ready for the current attempt', async () => {
    hoisted.collab.current = collabState(seededDoc(), null);
    const { result } = renderHook(() => useSiteDraftSession('a'));
    expect(result.current.state).toBe('preparing');
    expect(hoisted.roomsSeen.every((room) => room === '')).toBe(true);
    const doc = seededDoc();
    hoisted.collab.current = collabState(doc, fakeProvider());
    await act(async () => {});
    expect(hoisted.roomsSeen.at(-1)).toBe('site-a');
    expect(result.current.state).toBe('ready');
  });

  it('does not connect to a new siteId before its own prepare has run', async () => {
    hoisted.collab.current = collabState(seededDoc(), null);
    const { result, rerender } = renderHook(({ id }) => useSiteDraftSession(id), {
      initialProps: { id: 'a' },
    });
    await act(async () => {});
    hoisted.roomsSeen.length = 0;
    let release: () => void = () => {};
    hoisted.prepare.mockReturnValue(new Promise<boolean>((r) => (release = () => r(true))));
    rerender({ id: 'b' });
    expect(hoisted.roomsSeen).not.toContain('site-b');
    expect(result.current.state).toBe('preparing');
    await act(async () => release());
    expect(hoisted.roomsSeen.at(-1)).toBe('site-b');
  });

  it('after a retry the old doc and provider are not ready, the new ones are', async () => {
    const oldDoc = seededDoc();
    hoisted.collab.current = collabState(seededDoc(), null);
    const { result, rerender } = renderHook(() => useSiteDraftSession('a'));
    hoisted.collab.current = collabState(oldDoc, fakeProvider());
    await act(async () => {});
    expect(result.current.state).toBe('ready');

    hoisted.prepare.mockResolvedValue(true);
    const onFailed = (
      (hoisted.collab.current as { provider: ReturnType<typeof fakeProvider> }).provider.on.mock
        .calls as [string, () => void][]
    ).find(([name]) => name === 'authenticationFailed')?.[1];
    expect(onFailed).toBeDefined();
    await act(async () => onFailed?.());
    expect(result.current.state).not.toBe('ready');
    expect(hoisted.roomsSeen.at(-1)).toBe('site-a');
    expect(result.current.state).toBe('connecting');

    hoisted.collab.current = collabState(seededDoc(), fakeProvider());
    rerender();
    expect(result.current.state).toBe('ready');
  });
});
