/**
 * Per-thread history through `unstable_useAdapters`.
 *
 * Drives the real hook through the real RemoteThreadList client (the path
 * `useRemoteThreadListRuntime` takes once the adapter has no
 * `unstable_Provider`) and checks the behavior that matters: opening a thread
 * loads THAT thread's messages, also after switching to another one. It does
 * not discriminate shim vs. plain React hooks — in this harness tap runs the
 * resource inside the host render, where both happen to work.
 */
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  useRemoteThreadListRuntime,
  type AssistantRuntime,
  type ChatModelAdapter,
  type RemoteThreadListAdapter,
} from '@assistant-ui/react';
import { act, render, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { useChatConfigStore } from '../stores/chatConfigStore';

import { useGrueneratorThreadAdapters } from './GrueneratorChatRuntime';

const MESSAGES: Record<string, string> = {
  'thread-a': 'Nachricht aus A',
  'thread-b': 'Nachricht aus B',
};

const adapter: RemoteThreadListAdapter = {
  unstable_useAdapters: useGrueneratorThreadAdapters,
  async list() {
    return {
      threads: Object.keys(MESSAGES).map((remoteId) => ({ remoteId, status: 'regular' as const })),
    };
  },
  async fetch(remoteId: string) {
    return { remoteId, status: 'regular' as const };
  },
  async initialize() {
    return { remoteId: 'minted-thread' };
  },
  async rename() {},
  async archive() {},
  async unarchive() {},
  async delete() {},
  async generateTitle() {
    throw new Error('generateTitle is not used by this test');
  },
};

const modelAdapter: ChatModelAdapter = {
  async *run() {
    yield { content: [{ type: 'text', text: 'Antwort' }] };
  },
};

function useTestThreadRuntime() {
  return useLocalRuntime(modelAdapter);
}

function mountRuntime() {
  const box: { current: AssistantRuntime | null } = { current: null };
  function Harness() {
    const runtime = useRemoteThreadListRuntime({ runtimeHook: useTestThreadRuntime, adapter });
    useEffect(() => {
      box.current = runtime;
    }, [runtime]);
    return (
      <AssistantRuntimeProvider runtime={runtime}>
        <div />
      </AssistantRuntimeProvider>
    );
  }
  render(<Harness />);
  if (!box.current) throw new Error('runtime not mounted');
  return box.current;
}

function mainThreadText(runtime: AssistantRuntime): string {
  return runtime.thread
    .getState()
    .messages.map((m) =>
      m.content.map((part: { type: string; text?: string }) => part.text ?? '').join('')
    )
    .join('');
}

describe('useGrueneratorThreadAdapters (unstable_useAdapters)', () => {
  afterEach(() => {
    useChatConfigStore.getState().configure();
  });

  it('loads the opened thread’s own history, also after a switch', async () => {
    const requested: string[] = [];
    useChatConfigStore.getState().configure({
      fetch: async (url: string) => {
        const threadId = new URL(url, 'http://test').searchParams.get('threadId') ?? '';
        requested.push(threadId);
        return new Response(
          JSON.stringify([{ id: `${threadId}-1`, role: 'user', content: MESSAGES[threadId] }]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      },
    });

    const runtime = mountRuntime();
    await waitFor(() => expect(runtime.threads.getState().threadIds).toContain('thread-a'));

    await act(async () => {
      await runtime.threads.switchToThread('thread-a');
    });
    await waitFor(() => expect(mainThreadText(runtime)).toBe('Nachricht aus A'));

    await act(async () => {
      await runtime.threads.switchToThread('thread-b');
    });
    await waitFor(() => expect(mainThreadText(runtime)).toBe('Nachricht aus B'));

    expect(requested).toEqual(expect.arrayContaining(['thread-a', 'thread-b']));
  });
});
