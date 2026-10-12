/**
 * A local runtime mounted INSIDE a thread-list runtime (#4477).
 *
 * Mobile renders every chat screen's `useLocalRuntime` under the drawer's
 * `useRemoteThreadListRuntime` (AppDrawer). assistant-ui then treats the inner
 * runtime as nested: it reports the OUTER list's main thread as
 * `unstable_threadId` for every run of the inner one. Under the default
 * 'runtime' binding the adapter prefers that id over the surface's own
 * `getConfig().threadId` — so a brand-new chat (store id `null`) was posted
 * into whatever server thread the drawer's main item sat on.
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
import { type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useChatConfigStore } from '../../stores/chatConfigStore';

import { createGrueneratorModelAdapter } from './index';

import type { ThreadBinding } from './buildRequestBody';
import type { GrueneratorAdapterConfig } from './types';

const FOREIGN_THREAD = '7d3a0632-4851-4736-81f9-df9ca131ccbe';

const drawerList: RemoteThreadListAdapter = {
  async list() {
    return { threads: [{ remoteId: FOREIGN_THREAD, status: 'regular' }] };
  },
  async fetch(remoteId: string) {
    return { remoteId, status: 'regular' };
  },
  async initialize() {
    throw new Error('the drawer thread never sends');
  },
  async rename() {},
  async archive() {},
  async unarchive() {},
  async delete() {},
  async generateTitle() {
    throw new Error('not used');
  },
};

const idleModel: ChatModelAdapter = {
  async run() {
    return { content: [] };
  },
};

function Drawer({ children }: { children: ReactNode }) {
  const runtime = useRemoteThreadListRuntime({
    runtimeHook: function DrawerThread() {
      return useLocalRuntime(idleModel);
    },
    adapter: drawerList,
    initialThreadId: FOREIGN_THREAD,
  });
  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>;
}

const newChat: GrueneratorAdapterConfig = {
  agentId: null,
  modelId: 'mistral-medium-2604',
  enabledTools: {} as GrueneratorAdapterConfig['enabledTools'],
  threadId: null,
};

async function sendNewChatUnderDrawer(threadBinding: ThreadBinding): Promise<unknown> {
  const fetchMock = vi.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response('event: done\ndata: {"citations":[]}\n\n', { status: 200 })
  );
  useChatConfigStore.setState({ fetch: fetchMock as unknown as typeof fetch });

  const adapter = createGrueneratorModelAdapter(() => newChat, {}, { threadBinding });
  const box: { current: AssistantRuntime | null } = { current: null };
  function ChatScreen() {
    box.current = useLocalRuntime(adapter);
    return null;
  }

  render(
    <Drawer>
      <ChatScreen />
    </Drawer>
  );
  // The drawer's main item must have resolved to the server thread first —
  // that is the state the inner runtime reads at run start.
  await waitFor(() => expect(box.current).not.toBeNull());
  await new Promise((resolve) => setTimeout(resolve, 0));

  await act(async () => {
    box.current!.thread.composer.setText('Nenne drei Vorteile von Solardaechern.');
    box.current!.thread.composer.send();
  });
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as { threadId?: unknown };
  return body.threadId ?? null;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('chat runtime nested in a thread-list runtime', () => {
  it("'runtime' binding takes the outer list's main thread (the #4477 trap)", async () => {
    expect(await sendNewChatUnderDrawer('runtime')).toBe(FOREIGN_THREAD);
  });

  it("'pinned' binding sends the surface's own thread id", async () => {
    expect(await sendNewChatUnderDrawer('pinned')).toBeNull();
  });
});
