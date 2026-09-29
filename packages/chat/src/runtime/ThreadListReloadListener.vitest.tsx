/**
 * A Papierkorb restore happens outside the chat runtime (web toast, /papierkorb),
 * so the host asks for a reload through `requestThreadListReload()`. The
 * listener must turn that into a real `aui.threads.reload()` — i.e. a fresh
 * adapter `list()` — and stop listening once unmounted.
 */
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  useRemoteThreadListRuntime,
  type ChatModelAdapter,
  type RemoteThreadListAdapter,
} from '@assistant-ui/react';
import { act, render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { requestThreadListReload } from './GrueneratorThreadListAdapter';
import { ThreadListReloadListener } from './ThreadListReloadListener';

const modelAdapter: ChatModelAdapter = {
  async *run() {
    yield { content: [{ type: 'text', text: 'Antwort' }] };
  },
};

function useTestThreadRuntime() {
  return useLocalRuntime(modelAdapter);
}

function makeAdapter() {
  const list = vi.fn(async () => ({
    threads: [{ remoteId: 'thread-1', status: 'regular' as const, title: 'Eins' }],
  }));
  const adapter: RemoteThreadListAdapter = {
    list,
    async fetch(id: string) {
      return { remoteId: id, status: 'regular' as const };
    },
    async initialize() {
      return { remoteId: 'minted-thread', externalId: undefined };
    },
    async rename() {},
    async archive() {},
    async unarchive() {},
    async delete() {},
    async generateTitle() {
      throw new Error('generateTitle is not used by this test');
    },
  };
  return { adapter, list };
}

function Harness({ adapter }: { adapter: RemoteThreadListAdapter }) {
  const runtime = useRemoteThreadListRuntime({ runtimeHook: useTestThreadRuntime, adapter });
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadListReloadListener />
    </AssistantRuntimeProvider>
  );
}

describe('ThreadListReloadListener', () => {
  it('reloads the thread list when a host requests it', async () => {
    const { adapter, list } = makeAdapter();
    render(<Harness adapter={adapter} />);
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));

    await act(async () => {
      requestThreadListReload();
    });

    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  });

  it('stops listening once unmounted', async () => {
    const { adapter, list } = makeAdapter();
    const { unmount } = render(<Harness adapter={adapter} />);
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
    unmount();

    requestThreadListReload();
    await new Promise((r) => setTimeout(r, 20));

    expect(list).toHaveBeenCalledTimes(1);
  });
});
