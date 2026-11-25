import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAgentStore } from '../stores/chatStore';

import { ChatCollaborationBridge } from './ChatCollaborationBridge';
import { cacheThreadShareMetaForTest } from './GrueneratorThreadListAdapter';

import type { AssistantRuntime } from '@assistant-ui/react';

const constructed = vi.hoisted(() => ({ names: [] as string[] }));
vi.mock('@hocuspocus/provider', () => ({
  HocuspocusProvider: class {
    awareness = {
      setLocalStateField: vi.fn(),
      setLocalState: vi.fn(),
      getStates: () => new Map(),
      on: vi.fn(),
      off: vi.fn(),
      clientID: 1,
    };
    // Der Server-Impuls (`turnSignal`, #5700) liest eine Y.Map aus dem Raum.
    document = {
      getMap: () => ({ get: () => undefined, observe: vi.fn(), unobserve: vi.fn() }),
    };
    constructor(opts: { name: string }) {
      constructed.names.push(opts.name);
    }
    destroy() {}
  },
}));

const runtime = {
  thread: { getState: () => ({ isRunning: false }), subscribe: () => () => {} },
} as unknown as AssistantRuntime;

function mount() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ChatCollaborationBridge userId="u1" userName="Ada" runtime={runtime}>
        <div />
      </ChatCollaborationBridge>
    </QueryClientProvider>
  );
}

describe('ChatCollaborationBridge gate', () => {
  beforeEach(() => {
    constructed.names.length = 0;
    useAgentStore.setState({ currentThreadId: 'thread-a', chatViewMode: 'thread' });
  });

  it('opens no socket for a private own thread', () => {
    cacheThreadShareMetaForTest('thread-a', { accessType: 'owner', teamShared: false });
    mount();
    expect(constructed.names).toEqual([]);
  });

  // The room code is a lazy chunk (#5891), so joining is asynchronous.
  it('joins the room for an own thread with a group share', async () => {
    cacheThreadShareMetaForTest('thread-a', { accessType: 'owner', teamShared: true });
    mount();
    await waitFor(() => expect(constructed.names).toEqual(['chat-thread-a']));
  });

  it('joins the room for someone else’s thread', async () => {
    cacheThreadShareMetaForTest('thread-a', { accessType: 'group', teamShared: false });
    mount();
    await waitFor(() => expect(constructed.names).toEqual(['chat-thread-a']));
  });

  it('connects once the list says the thread became a team chat', async () => {
    cacheThreadShareMetaForTest('thread-a', { accessType: 'owner', teamShared: false });
    mount();
    expect(constructed.names).toEqual([]);
    act(() => cacheThreadShareMetaForTest('thread-a', { accessType: 'owner', teamShared: true }));
    await waitFor(() => expect(constructed.names).toEqual(['chat-thread-a']));
  });

  it('keeps the chat mounted while the room loads', async () => {
    cacheThreadShareMetaForTest('thread-a', { accessType: 'owner', teamShared: false });
    const view = mount();
    const before = view.container.querySelector('div');
    act(() => cacheThreadShareMetaForTest('thread-a', { accessType: 'owner', teamShared: true }));
    await waitFor(() => expect(constructed.names).toEqual(['chat-thread-a']));
    expect(view.container.querySelector('div')).toBe(before);
  });
});
